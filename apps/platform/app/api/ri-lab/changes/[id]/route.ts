import { NextResponse } from 'next/server';
import { requireRiContext } from '@/lib/ri/context';
import { labApiErrorResponse } from '@/lib/ri/lab-api/errors';
import { parseLabChangePatch } from '@/lib/ri/lab-api/lab-change-write';
import { assertLabChangeWritesEnabled } from '@/lib/ri/lab-api/lab-connected-writes';
import { getChangeDetail, updateChangeStatus, updateRegulatoryChangeMetadata, updateRegulatoryChangeOwner } from '@/lib/ri/services/changes';
import { mapChangeDetailToLabView } from '@/lib/ri/lab-api/lab-work-view';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const ctx = await requireRiContext('change:read');
    const detail = await getChangeDetail(ctx.supabase, ctx.organisationId, id);
    const labChange = mapChangeDetailToLabView(detail);
    return NextResponse.json({ ok: true, change: labChange, detail: detail.change });
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
    const ctx = await requireRiContext('change:write');
    assertLabChangeWritesEnabled(ctx.role);
    const patch = parseLabChangePatch(await request.json());
    if (patch.ownerUserId) {
      await updateRegulatoryChangeOwner(ctx.supabase, {
        organisationId: ctx.organisationId,
        changeId: id,
        userId: ctx.userId,
        ownerUserId: patch.ownerUserId,
        expectedUpdatedAt: patch.expectedUpdatedAt,
      });
    }
    const metadataFields =
      patch.materiality !== undefined || patch.implementationDeadline !== undefined || patch.changeType;
    if (metadataFields) {
      await updateRegulatoryChangeMetadata(ctx.supabase, {
        organisationId: ctx.organisationId,
        changeId: id,
        userId: ctx.userId,
        materiality: patch.materiality,
        implementationDeadline: patch.implementationDeadline,
        changeType: patch.changeType,
        expectedUpdatedAt: patch.ownerUserId ? null : patch.expectedUpdatedAt,
      });
    }
    if (patch.status) {
      await updateChangeStatus(ctx.supabase, {
        organisationId: ctx.organisationId,
        changeId: id,
        userId: ctx.userId,
        status: patch.status,
        expectedUpdatedAt:
          patch.ownerUserId || metadataFields ? null : patch.expectedUpdatedAt,
      });
    }
    const detail = await getChangeDetail(ctx.supabase, ctx.organisationId, id);
    const labChange = mapChangeDetailToLabView(detail);
    return NextResponse.json({
      ok: true,
      change: labChange,
      detail: detail.change,
    });
  } catch (err) {
    return labApiErrorResponse(err);
  }
}
