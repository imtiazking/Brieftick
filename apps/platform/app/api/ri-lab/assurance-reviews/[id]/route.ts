import { NextResponse } from 'next/server';
import { requireRiContext } from '@/lib/ri/context';
import { labApiErrorResponse } from '@/lib/ri/lab-api/errors';
import { mapAssuranceRowToLabView } from '@/lib/ri/lab-api/lab-governance-view';
import { getAssuranceDetail } from '@/lib/ri/services/assurance';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const ctx = await requireRiContext('assurance:read');
    const detail = await getAssuranceDetail(ctx.supabase, ctx.organisationId, id);
    const assurance = mapAssuranceRowToLabView(detail.review as Record<string, unknown>);
    return NextResponse.json({
      ok: true,
      assuranceReview: assurance,
      detail: detail.review,
      controls: detail.controls ?? [],
      obligations: detail.obligations ?? [],
      findings: detail.findings ?? [],
    });
  } catch (err) {
    return labApiErrorResponse(err);
  }
}
