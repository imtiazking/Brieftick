import { NextResponse } from 'next/server';
import { requireRiContext } from '@/lib/ri/context';
import { labApiErrorResponse } from '@/lib/ri/lab-api/errors';
import { mapFindingRowToLabView } from '@/lib/ri/lab-api/lab-governance-view';
import { parseLabFindingPatchBody } from '@/lib/ri/lab-api/lab-link-write';
import { assertLabFindingWritesEnabled } from '@/lib/ri/lab-api/lab-connected-writes';
import { getFindingDetail, updateFinding } from '@/lib/ri/services/findings';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const ctx = await requireRiContext('finding:read');
    const detail = await getFindingDetail(ctx.supabase, ctx.organisationId, id);
    const finding = mapFindingRowToLabView(detail.finding as Record<string, unknown>);
    return NextResponse.json({ ok: true, finding, detail: detail.finding });
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
