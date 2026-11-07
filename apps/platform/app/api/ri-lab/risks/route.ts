import { NextResponse } from 'next/server';
import { requireRiContext } from '@/lib/ri/context';
import { labApiErrorResponse } from '@/lib/ri/lab-api/errors';
import { parseLabRiskCreateBody } from '@/lib/ri/lab-api/lab-link-write';
import { assertLabRiskWritesEnabled } from '@/lib/ri/lab-api/lab-connected-writes';
import { createRisk, listRisks } from '@/lib/ri/services/risks';
import { mapRiskRowToLabView } from '@/lib/ri/lab-api/lab-governance-view';

export async function GET() {
  try {
    const ctx = await requireRiContext('risk:read');
    const rows = await listRisks(ctx.supabase, ctx.organisationId);
    return NextResponse.json({
      ok: true,
      risks: rows.map((r) => mapRiskRowToLabView(r as Record<string, unknown>)),
    });
  } catch (err) {
    return labApiErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireRiContext('risk:write');
    assertLabRiskWritesEnabled(ctx.role);
    const fields = parseLabRiskCreateBody(await request.json());
    const row = await createRisk(ctx.supabase, {
      organisationId: ctx.organisationId,
      userId: ctx.userId,
      role: ctx.role,
      fields,
    });
    return NextResponse.json(
      { ok: true, risk: mapRiskRowToLabView(row as Record<string, unknown>) },
      { status: 201 },
    );
  } catch (err) {
    return labApiErrorResponse(err);
  }
}
