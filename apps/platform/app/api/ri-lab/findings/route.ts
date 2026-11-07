import { NextResponse } from 'next/server';
import { requireRiContext } from '@/lib/ri/context';
import { labApiErrorResponse } from '@/lib/ri/lab-api/errors';
import { mapFindingRowToLabView } from '@/lib/ri/lab-api/lab-governance-view';
import { assertLabFindingWritesEnabled } from '@/lib/ri/lab-api/lab-connected-writes';
import { createFinding, listFindings } from '@/lib/ri/services/findings';

export async function GET() {
  try {
    const ctx = await requireRiContext('finding:read');
    const rows = await listFindings(ctx.supabase, ctx.organisationId);
    const findings = rows.map((r) => mapFindingRowToLabView(r as Record<string, unknown>));
    return NextResponse.json({ ok: true, total: findings.length, findings, tenantScope: true });
  } catch (err) {
    return labApiErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireRiContext('finding:write');
    assertLabFindingWritesEnabled(ctx.role);
    const body = (await request.json()) as Record<string, unknown>;
    const row = await createFinding(ctx.supabase, ctx.organisationId, ctx.userId, body);
    return NextResponse.json(
      { ok: true, finding: mapFindingRowToLabView(row as Record<string, unknown>) },
      { status: 201 },
    );
  } catch (err) {
    return labApiErrorResponse(err);
  }
}
