import { NextResponse } from 'next/server';
import { requireRiContext } from '@/lib/ri/context';
import { labApiErrorResponse } from '@/lib/ri/lab-api/errors';
import { parseLabControlCreateBody } from '@/lib/ri/lab-api/lab-link-write';
import { assertLabControlWritesEnabled } from '@/lib/ri/lab-api/lab-connected-writes';
import { createControl, listControls } from '@/lib/ri/services/controls';
import { mapControlRowToLabView } from '@/lib/ri/lab-api/lab-governance-view';

export async function GET() {
  try {
    const ctx = await requireRiContext('control:read');
    const rows = await listControls(ctx.supabase, ctx.organisationId);
    return NextResponse.json({
      ok: true,
      controls: rows.map((r) => mapControlRowToLabView(r as Record<string, unknown>)),
    });
  } catch (err) {
    return labApiErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireRiContext('control:write');
    assertLabControlWritesEnabled(ctx.role);
    const fields = parseLabControlCreateBody(await request.json());
    const row = await createControl(ctx.supabase, {
      organisationId: ctx.organisationId,
      userId: ctx.userId,
      role: ctx.role,
      fields,
    });
    return NextResponse.json(
      { ok: true, control: mapControlRowToLabView(row as Record<string, unknown>) },
      { status: 201 },
    );
  } catch (err) {
    return labApiErrorResponse(err);
  }
}
