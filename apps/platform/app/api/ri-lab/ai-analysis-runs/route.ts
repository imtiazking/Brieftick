import { NextResponse } from 'next/server';
import { after } from 'next/server';
import { requireRiContext } from '@/lib/ri/context';
import { labApiErrorResponse } from '@/lib/ri/lab-api/errors';
import { assertLabConnectedWrite } from '@/lib/ri/lab-api/lab-connected-writes';
import { RiNotFoundError } from '@/lib/ri/errors';
import { getLatestPublicationVersion } from '@/lib/ri/services/publication-versions';
import { getPublicationDetail } from '@/lib/ri/services/publications';
import {
  lookupAnalysisRunByIdempotency,
  requestPublicationAnalysis,
  runPublicationAnalysisProvider,
  type PublicationAnalysisProviderJob,
} from '@/lib/ri/services/ai-analysis';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { isRiAiExecutionEnabled } from '@/lib/ri/ai/ri-ai-execution';
import { recoverStaleAiAnalysisRuns } from '@/lib/ri/ai/recover-stale-ai-analysis-runs.mjs';

/** Staging UC-RI-005 live extraction — provider work may continue via after() while client polls. */
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const ctx = await requireRiContext('ai:read');
    const url = new URL(request.url);
    const publicationId = url.searchParams.get('publicationId')?.trim();
    const idempotencyKeySuffix = url.searchParams.get('idempotencyKeySuffix')?.trim();
    const useCaseId = url.searchParams.get('useCaseId')?.trim() || 'UC-RI-005';
    if (!publicationId || !idempotencyKeySuffix) {
      return NextResponse.json({ ok: false, code: 'publication_and_suffix_required' }, { status: 400 });
    }
    const latest = await getLatestPublicationVersion(ctx.supabase, publicationId);
    if (!latest?.id) {
      return NextResponse.json({ ok: false, code: 'publication_version_not_found' }, { status: 404 });
    }
    const idempotencyKey = `${useCaseId}:${latest.id}:${ctx.organisationId}:${idempotencyKeySuffix}`;
    const row = await lookupAnalysisRunByIdempotency(ctx.supabase, ctx.organisationId, idempotencyKey);
    if (!row) {
      return NextResponse.json({ ok: false, code: 'run_not_found', idempotencyKey }, { status: 404 });
    }
    return NextResponse.json({
      ok: true,
      runId: row.id,
      executionStatus: row.execution_status,
      errorCode: row.error_code,
      completedAt: row.completed_at,
      idempotencyKey,
    });
  } catch (err) {
    return labApiErrorResponse(err);
  }
}

function scheduleAsyncProvider(job: PublicationAnalysisProviderJob) {
  after(async () => {
    try {
      const admin = createSupabaseAdminClient();
      if (!admin) {
        console.error('[ri-ai] async_dispatch_no_admin_client');
        return;
      }
      await runPublicationAnalysisProvider(admin, job);
    } catch (err) {
      console.error(
        '[ri-ai] async_dispatch_failed',
        JSON.stringify({
          runId: job.runId,
          organisationId: job.params.organisationId,
          message: err instanceof Error ? err.message : String(err),
        }),
      );
    }
  });
}

export async function POST(request: Request) {
  try {
    const ctx = await requireRiContext('ai:request');
    assertLabConnectedWrite(ctx.role, 'ai:request');
    const body = (await request.json()) as {
      publicationId?: string;
      publicationVersionId?: string;
      useCaseId?: string;
      targetEntityId?: string;
      idempotencyKeySuffix?: string;
      extractionBatchIndex?: number;
      maxSectionsPerBatch?: number;
      cumulativeSuppliedProvisionCores?: string[];
      targetProvisionCores?: string[];
    };
    const publicationId = body.publicationId?.trim();
    const useCaseId = body.useCaseId?.trim() || 'UC-RI-005';
    if (!publicationId) throw new Error('publication_id_required');

    await getPublicationDetail(ctx.supabase, ctx.organisationId, publicationId);

    let publicationVersionId = body.publicationVersionId?.trim();
    if (!publicationVersionId) {
      const latest = await getLatestPublicationVersion(ctx.supabase, publicationId);
      if (!latest?.id) throw new Error('publication_version_not_found');
      publicationVersionId = latest.id;
    }

    if (useCaseId === 'UC-RI-005' && isRiAiExecutionEnabled()) {
      const admin = createSupabaseAdminClient();
      if (admin) {
        try {
          await recoverStaleAiAnalysisRuns(admin);
        } catch (err) {
          console.error(
            '[ri-ai] stale_run_recovery_failed',
            err instanceof Error ? err.message : String(err),
          );
        }
      }
    }

    const result = await requestPublicationAnalysis(ctx.supabase, {
      organisationId: ctx.organisationId,
      userId: ctx.userId,
      role: ctx.role,
      publicationId,
      publicationVersionId,
      useCaseId,
      targetEntityId: body.targetEntityId,
      idempotencyKeySuffix: body.idempotencyKeySuffix,
      extractionBatchIndex: body.extractionBatchIndex,
      maxSectionsPerBatch: body.maxSectionsPerBatch,
      cumulativeSuppliedProvisionCores: body.cumulativeSuppliedProvisionCores,
      targetProvisionCores: body.targetProvisionCores,
    });

    if ('dispatched' in result && result.dispatched && result.providerJob) {
      scheduleAsyncProvider(result.providerJob);
      return NextResponse.json(
        {
          ok: true,
          runId: result.runId,
          reused: false,
          dispatched: true,
          executionStatus: result.executionStatus,
        },
        { status: 202 },
      );
    }

    return NextResponse.json({
      ok: Boolean(result.ok),
      runId: result.runId,
      reused: 'reused' in result ? result.reused : false,
      executionStatus: 'executionStatus' in result ? result.executionStatus : null,
      citationValid: 'citationValid' in result ? result.citationValid : null,
      code: 'code' in result ? result.code : null,
    });
  } catch (err) {
    if (err instanceof RiNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    return labApiErrorResponse(err);
  }
}