import { NextResponse } from 'next/server';
import { requireRiContext } from '@/lib/ri/context';
import { labApiErrorResponse } from '@/lib/ri/lab-api/errors';
import { mapEvidenceRowToLabView } from '@/lib/ri/lab-api/lab-governance-view';
import { getEvidenceDetail } from '@/lib/ri/services/evidence';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const ctx = await requireRiContext('evidence:read');
    const detail = await getEvidenceDetail(ctx.supabase, ctx.organisationId, id);
    const evidence = mapEvidenceRowToLabView(detail.evidence as Record<string, unknown>);
    return NextResponse.json({
      ok: true,
      evidence: {
        ...evidence,
        obligationIds: detail.obligations?.map((o) => o?.id).filter(Boolean) ?? [],
        controlIds: detail.controls?.map((c) => c?.id).filter(Boolean) ?? [],
        actionIds: detail.actions?.map((a) => a?.id).filter(Boolean) ?? [],
        regulatoryChangeIds: detail.changes?.map((c) => c?.id).filter(Boolean) ?? [],
      },
      detail: detail.evidence,
    });
  } catch (err) {
    return labApiErrorResponse(err);
  }
}
