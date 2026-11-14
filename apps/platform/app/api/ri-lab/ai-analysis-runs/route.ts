import { NextResponse } from 'next/server';
import { requireRiContext } from '@/lib/ri/context';
import { labApiErrorResponse } from '@/lib/ri/lab-api/errors';
import { assertLabConnectedWrite } from '@/lib/ri/lab-api/lab-connected-writes';
import { getLatestPublicationVersion } from '@/lib/ri/services/publication-versions';
import { requestPublicationAnalysis } from '@/lib/ri/services/ai-analysis';

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
    };
    const publicationId = body.publicationId?.trim();
    const useCaseId = body.useCaseId?.trim() || 'UC-RI-005';
    if (!publicationId) throw new Error('publication_id_required');

    let publicationVersionId = body.publicationVersionId?.trim();
    if (!publicationVersionId) {
      const latest = await getLatestPublicationVersion(ctx.supabase, publicationId);
      if (!latest?.id) throw new Error('publication_version_not_found');
      publicationVersionId = latest.id;
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
    });

    return NextResponse.json({
      ok: Boolean(result.ok),
      runId: result.runId,
      reused: 'reused' in result ? result.reused : false,
      citationValid: 'citationValid' in result ? result.citationValid : null,
      code: 'code' in result ? result.code : null,
    });
  } catch (err) {
    return labApiErrorResponse(err);
  }
}