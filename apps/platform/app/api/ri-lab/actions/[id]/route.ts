import { NextResponse } from 'next/server';
import { requireRiContext } from '@/lib/ri/context';
import { labApiErrorResponse } from '@/lib/ri/lab-api/errors';
import { assertLabActionWritesEnabled } from '@/lib/ri/lab-api/lab-connected-writes';
import { mapActionRowToLabView } from '@/lib/ri/lab-api/lab-governance-view';
import { parseLabActionPatchBody } from '@/lib/ri/lab-api/lab-action-write';
import { getRiActionDetail, updateRiAction } from '@/lib/ri/services/ri-actions';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const ctx = await requireRiContext('action:read');
    const detail = await getRiActionDetail(ctx.supabase, ctx.organisationId, id);
    const action = mapActionRowToLabView(detail.action as Record<string, unknown>);
    return NextResponse.json({
      ok: true,
      action: {
        ...action,
        obligationIds: detail.obligations?.map((o) => o?.id).filter(Boolean) ?? [],
        controlIds: detail.controls?.map((c) => c?.id).filter(Boolean) ?? [],
        evidenceIds: detail.evidence?.map((e) => e?.id).filter(Boolean) ?? [],
      },
      detail: detail.action,
    });
  } catch (err) {
    return labApiErrorResponse(err);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const ctx = await requireRiContext('action:write');
    assertLabActionWritesEnabled(ctx.role);
    const patch = parseLabActionPatchBody(await request.json());
    const row = await updateRiAction(ctx.supabase, {
      organisationId: ctx.organisationId,
      actionId: id,
      userId: ctx.userId,
      fields: patch.fields,
      expectedUpdatedAt: patch.expectedUpdatedAt,
    });
    return NextResponse.json({ ok: true, action: mapActionRowToLabView(row as Record<string, unknown>) });
  } catch (err) {
    return labApiErrorResponse(err);
  }
}
