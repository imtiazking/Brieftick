import { NextResponse } from 'next/server';
import { requireRiContext } from '@/lib/ri/context';
import { labApiErrorResponse } from '@/lib/ri/lab-api/errors';
import { mapControlRowToLabView } from '@/lib/ri/lab-api/lab-governance-view';
import { parseLabControlPatchBody } from '@/lib/ri/lab-api/lab-work-write';
import { assertLabControlWritesEnabled } from '@/lib/ri/lab-api/lab-connected-writes';
import { getControlDetail, updateControl } from '@/lib/ri/services/controls';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const ctx = await requireRiContext('control:read');
    const detail = await getControlDetail(ctx.supabase, ctx.organisationId, id);
    const control = mapControlRowToLabView(detail.control as Record<string, unknown>);
    return NextResponse.json({
      ok: true,
      control: {
        ...control,
        riskIds: detail.risks?.map((r) => r?.id).filter(Boolean) ?? [],
        obligationIds: detail.obligations?.map((o) => o?.id).filter(Boolean) ?? [],
        evidenceIds: detail.evidence?.map((e) => e?.id).filter(Boolean) ?? [],
        findingIds: detail.findings?.map((f) => f?.id).filter(Boolean) ?? [],
        assuranceReviewIds: detail.assurance?.map((a) => a?.id).filter(Boolean) ?? [],
      },
      detail: detail.control,
    });
  } catch (err) {
    return labApiErrorResponse(err);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const ctx = await requireRiContext('control:write');
    assertLabControlWritesEnabled(ctx.role);
    const patch = parseLabControlPatchBody(await request.json());
    const row = await updateControl(
      ctx.supabase,
      ctx.organisationId,
      id,
      patch.fields,
      patch.expectedUpdatedAt,
    );
    const control = mapControlRowToLabView(row as Record<string, unknown>);
    return NextResponse.json({ ok: true, control });
  } catch (err) {
    return labApiErrorResponse(err);
  }
}
