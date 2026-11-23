import { NextResponse } from 'next/server';
import { requireRiContext } from '@/lib/ri/context';
import { labApiErrorResponse } from '@/lib/ri/lab-api/errors';
import { assertLabConnectedWrite } from '@/lib/ri/lab-api/lab-connected-writes';
import { mapAiRunToLabView } from '@/lib/ri/lab-api/lab-governance-view';
import { buildLabAiAnalysisRunDetailExtras } from '@/lib/ri/lab-api/map-ai-analysis-run-detail';
import { getAnalysisRun, submitAnalysisReview } from '@/lib/ri/services/ai-analysis';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { startLabResourceTimer, emitLabResourceMetric } = await import(
    '@/lib/ri/observability/lab-resource-metrics.mjs'
  );
  const timer = startLabResourceTimer();
  try {
    const { id } = await params;
    const ctx = await requireRiContext('ai:read');
    const detail = await getAnalysisRun(ctx.supabase, ctx.organisationId, id);
    const run = mapAiRunToLabView(detail.run);
    const labDetail = await buildLabAiAnalysisRunDetailExtras(
      ctx.supabase,
      detail.run,
      detail.citations ?? [],
    );
    const executionStatus = String(detail.run?.execution_status || '').toUpperCase();
    const terminal = ['COMPLETED', 'FAILED', 'VALIDATION_FAILED'].includes(executionStatus);
    const res = NextResponse.json({
      ok: true,
      aiAnalysisRun: run,
      detail: detail.run,
      citations: labDetail.citations,
      publicationSource: labDetail.publicationSource,
      reviews: detail.reviews ?? [],
    });
    res.headers.set('Cache-Control', 'private, no-store');
    emitLabResourceMetric('ai_analysis_run_get', {
      runId: id,
      executionStatus,
      terminal,
    });
    timer.end({ route: 'ai-analysis-runs-get', terminal, executionStatus });
    return res;
  } catch (err) {
    timer.end({ route: 'ai-analysis-runs-get', error: 'failed' });
    return labApiErrorResponse(err);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const ctx = await requireRiContext('ai:review');
    assertLabConnectedWrite(ctx.role, 'ai:review');
    const body = (await request.json()) as {
      decision?: 'ACCEPTED' | 'PARTIALLY_ACCEPTED' | 'REJECTED';
      acceptedClaimIndexes?: number[];
      rejectedClaimIndexes?: number[];
      notes?: string;
    };
    const decision = body.decision ?? 'ACCEPTED';
    const result = await submitAnalysisReview(ctx.supabase, {
      organisationId: ctx.organisationId,
      userId: ctx.userId,
      role: ctx.role,
      runId: id,
      decision,
      acceptedClaimIndexes: body.acceptedClaimIndexes ?? [],
      rejectedClaimIndexes: body.rejectedClaimIndexes ?? [],
      notes: body.notes,
    });
    return NextResponse.json({
      ok: true,
      runId: id,
      decision,
      materialised: result.materialised,
      skipped: result.skipped,
    });
  } catch (err) {
    return labApiErrorResponse(err);
  }
}
