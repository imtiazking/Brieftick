import { NextResponse } from 'next/server';
import { requireRiContext } from '@/lib/ri/context';
import { labApiErrorResponse } from '@/lib/ri/lab-api/errors';
import { parseLabObligationPatchBody } from '@/lib/ri/lab-api/lab-work-write';
import { assertLabObligationWritesEnabled } from '@/lib/ri/lab-api/lab-connected-writes';
import { getObligationDetail, updateObligation } from '@/lib/ri/services/obligations';
import { mapObligationRowToLabView } from '@/lib/ri/lab-api/lab-work-view';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const ctx = await requireRiContext('obligation:read');
    const detail = await getObligationDetail(ctx.supabase, ctx.organisationId, id);
    const row = detail.obligation as Record<string, unknown> & {
      id: string;
      obligation_statement: string;
      status: string;
    };
    const change = Array.isArray(row.change) ? row.change[0] : row.change;
    const lab = mapObligationRowToLabView({
      ...(row as Parameters<typeof mapObligationRowToLabView>[0]),
      change,
    });
    const risks = (detail as { risks?: { id?: string }[] }).risks ?? [];
    const controls = (detail as { controls?: { id?: string }[] }).controls ?? [];
    const riskIds = risks.map((r) => r?.id).filter(Boolean);
    const controlIds = controls.map((c) => c?.id).filter(Boolean);
    return NextResponse.json({
      ok: true,
      obligation: {
        ...lab,
        sourceSection: row.source_section,
        impacts: detail.impacts ?? [],
        risks,
        controls,
        riskIds,
        controlIds,
      },
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
    const ctx = await requireRiContext('obligation:write');
    assertLabObligationWritesEnabled(ctx.role);
    const patch = parseLabObligationPatchBody(await request.json());
    await updateObligation(ctx.supabase, {
      organisationId: ctx.organisationId,
      obligationId: id,
      userId: ctx.userId,
      fields: patch.fields,
      expectedUpdatedAt: patch.expectedUpdatedAt,
    });
    const detail = await getObligationDetail(ctx.supabase, ctx.organisationId, id);
    const row = detail.obligation as Record<string, unknown> & {
      id: string;
      obligation_statement: string;
      status: string;
    };
    const change = Array.isArray(row.change) ? row.change[0] : row.change;
    const lab = mapObligationRowToLabView({
      ...(row as Parameters<typeof mapObligationRowToLabView>[0]),
      change,
    });
    const risks = (detail as { risks?: { id?: string }[] }).risks ?? [];
    const controls = (detail as { controls?: { id?: string }[] }).controls ?? [];
    const riskIds = risks.map((r) => r?.id).filter(Boolean);
    const controlIds = controls.map((c) => c?.id).filter(Boolean);
    return NextResponse.json({
      ok: true,
      obligation: {
        ...lab,
        sourceSection: row.source_section,
        impacts: detail.impacts ?? [],
        risks,
        controls,
        riskIds,
        controlIds,
      },
    });
  } catch (err) {
    return labApiErrorResponse(err);
  }
}
