import { NextResponse } from 'next/server';
import { requireRiContext } from '@/lib/ri/context';
import { labApiErrorResponse } from '@/lib/ri/lab-api/errors';
import { assertLabActionWritesEnabled } from '@/lib/ri/lab-api/lab-connected-writes';
import { mapActionRowToLabView } from '@/lib/ri/lab-api/lab-governance-view';
import { parseLabActionCreateBody } from '@/lib/ri/lab-api/lab-action-write';
import { createLabRiAction, listRiActions } from '@/lib/ri/services/ri-actions';

export async function GET() {
  try {
    const ctx = await requireRiContext('action:read');
    const rows = await listRiActions(ctx.supabase, ctx.organisationId);
    return NextResponse.json({
      ok: true,
      actions: rows.map((r) => mapActionRowToLabView(r as Record<string, unknown>)),
    });
  } catch (err) {
    return labApiErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireRiContext('action:write');
    assertLabActionWritesEnabled(ctx.role);
    const body = parseLabActionCreateBody(await request.json());
    const result = await createLabRiAction(ctx.supabase, {
      organisationId: ctx.organisationId,
      userId: ctx.userId,
      role: ctx.role,
      title: body.title,
      sourceType: body.sourceType,
      description: body.description,
      priority: body.priority,
      dueDate: body.dueDate,
      ownerUserId: body.ownerUserId,
      creationMode: body.creationMode,
      obligationId: body.obligationId,
      controlId: body.controlId,
      riskId: body.riskId,
      idempotencyKey: body.idempotencyKey,
    });
    return NextResponse.json(
      {
        ok: true,
        action: mapActionRowToLabView(result.row as Record<string, unknown>),
        idempotentReplay: result.replayed,
      },
      { status: result.replayed ? 200 : 201 },
    );
  } catch (err) {
    return labApiErrorResponse(err);
  }
}
