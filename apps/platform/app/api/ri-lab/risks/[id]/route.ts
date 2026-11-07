import { NextResponse } from 'next/server';
import { requireRiContext } from '@/lib/ri/context';
import { labApiErrorResponse } from '@/lib/ri/lab-api/errors';
import { mapRiskRowToLabView } from '@/lib/ri/lab-api/lab-governance-view';
import { parseLabRiskPatchBody } from '@/lib/ri/lab-api/lab-work-write';
import { assertLabRiskWritesEnabled } from '@/lib/ri/lab-api/lab-connected-writes';
import { getRiskDetail, updateRisk } from '@/lib/ri/services/risks';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const ctx = await requireRiContext('risk:read');
    const detail = await getRiskDetail(ctx.supabase, ctx.organisationId, id);
    const risk = mapRiskRowToLabView(detail.risk as Record<string, unknown>);
    return NextResponse.json({
      ok: true,
      risk: {
        ...risk,
        obligationIds: detail.obligations?.map((o) => o?.id).filter(Boolean) ?? [],
        controlIds: detail.controls?.map((c) => c?.id).filter(Boolean) ?? [],
      },
      detail: detail.risk,
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
    const ctx = await requireRiContext('risk:write');
    assertLabRiskWritesEnabled(ctx.role);
    const patch = parseLabRiskPatchBody(await request.json());
    const row = await updateRisk(
      ctx.supabase,
      ctx.organisationId,
      id,
      patch.fields,
      patch.expectedUpdatedAt,
    );
    const risk = mapRiskRowToLabView(row as Record<string, unknown>);
    return NextResponse.json({ ok: true, risk });
  } catch (err) {
    return labApiErrorResponse(err);
  }
}
