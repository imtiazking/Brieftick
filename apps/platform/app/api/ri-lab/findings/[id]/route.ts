import { NextResponse } from 'next/server';
import { requireRiContext } from '@/lib/ri/context';
import { labApiErrorResponse } from '@/lib/ri/lab-api/errors';
import {
  findingRelationshipFieldsFromMetadata,
  mapFindingRowToLabView,
} from '@/lib/ri/lab-api/lab-governance-view';
import { parseLabFindingPatchBody } from '@/lib/ri/lab-api/lab-link-write';
import { assertLabFindingWritesEnabled } from '@/lib/ri/lab-api/lab-connected-writes';
import { getFindingDetail, updateFinding } from '@/lib/ri/services/findings';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const ctx = await requireRiContext('finding:read');
    const detail = await getFindingDetail(ctx.supabase, ctx.organisationId, id);
    const finding = mapFindingRowToLabView(detail.finding as Record<string, unknown>);
    const meta = (detail.finding as { metadata?: Record<string, unknown> })?.metadata ?? null;
    const { parentRiskId: metaRiskId, parentControlId } = findingRelationshipFieldsFromMetadata(meta);
    const linkedControls: Array<{ id: string; name: string }> = [];
    for (const c of detail.controls ?? []) {
      if (c?.id) linkedControls.push({ id: String(c.id), name: String((c as { name?: string }).name ?? '') });
    }
    if (!linkedControls.length && parentControlId) {
      const { data: ctrl } = await ctx.supabase
        .from('controls')
        .select('id, name')
        .eq('organisation_id', ctx.organisationId)
        .eq('id', parentControlId)
        .maybeSingle();
      if (ctrl?.id) {
        linkedControls.push({ id: String(ctrl.id), name: String(ctrl.name ?? '') });
      } else {
        linkedControls.push({ id: parentControlId, name: '' });
      }
    }
    const linkedActions: Array<{ id: string; title: string }> = [];
    for (const a of detail.actions ?? []) {
      if (a?.id) linkedActions.push({ id: String(a.id), title: String((a as { title?: string }).title ?? '') });
    }
    const parentRiskId = metaRiskId;
    return NextResponse.json({
      ok: true,
      finding: {
        ...finding,
        controlIds: linkedControls.map((c) => c.id),
        actionIds: linkedActions.map((a) => a.id),
        parentRiskId,
        parentControlId,
        linkedControls,
        linkedActions,
      },
      linkedControls,
      linkedActions,
      parentRiskId,
      detail: detail.finding,
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
    const ctx = await requireRiContext('finding:write');
    assertLabFindingWritesEnabled(ctx.role);
    const patch = parseLabFindingPatchBody(await request.json());
    const row = await updateFinding(ctx.supabase, {
      organisationId: ctx.organisationId,
      findingId: id,
      userId: ctx.userId,
      fields: patch.fields,
      expectedUpdatedAt: patch.expectedUpdatedAt,
    });
    return NextResponse.json({
      ok: true,
      finding: mapFindingRowToLabView(row as Record<string, unknown>),
    });
  } catch (err) {
    return labApiErrorResponse(err);
  }
}
