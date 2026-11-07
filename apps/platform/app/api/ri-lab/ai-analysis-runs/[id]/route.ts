import { NextResponse } from 'next/server';
import { requireRiContext } from '@/lib/ri/context';
import { labApiErrorResponse } from '@/lib/ri/lab-api/errors';
import { assertLabConnectedWrite } from '@/lib/ri/lab-api/lab-connected-writes';
import { mapAiRunToLabView } from '@/lib/ri/lab-api/lab-governance-view';
import { buildLabAiAnalysisRunDetailExtras } from '@/lib/ri/lab-api/map-ai-analysis-run-detail';
import { getAnalysisRun, submitAnalysisReview } from '@/lib/ri/services/ai-analysis';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
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
    return NextResponse.json({
      ok: true,
      aiAnalysisRun: run,
      detail: detail.run,
      citations: labDetail.citations,
      publicationSource: labDetail.publicationSource,
      reviews: detail.reviews ?? [],
    });
  } catch (err) {
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
    await submitAnalysisReview(ctx.supabase, {
      organisationId: ctx.organisationId,
      userId: ctx.userId,
      role: ctx.role,
      runId: id,
      decision,
      acceptedClaimIndexes: body.acceptedClaimIndexes ?? [],
      rejectedClaimIndexes: body.rejectedClaimIndexes ?? [],
      notes: body.notes,
    });
    return NextResponse.json({ ok: true, runId: id, decision });
  } catch (err) {
    return labApiErrorResponse(err);
  }
}
