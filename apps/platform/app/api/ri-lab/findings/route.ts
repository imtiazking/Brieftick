import { NextResponse } from 'next/server';
import { requireRiContext } from '@/lib/ri/context';
import { labApiErrorResponse } from '@/lib/ri/lab-api/errors';
import { mapFindingRowToLabView } from '@/lib/ri/lab-api/lab-governance-view';
import { assertLabFindingWritesEnabled } from '@/lib/ri/lab-api/lab-connected-writes';
import { parseLabFindingCreateBody } from '@/lib/ri/lab-api/lab-link-write';
import { createFinding, getFindingDetail, listFindings } from '@/lib/ri/services/findings';

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
    const fields = parseLabFindingCreateBody(await request.json());
    const row = await createFinding(ctx.supabase, {
      organisationId: ctx.organisationId,
      userId: ctx.userId,
      role: ctx.role,
      fields,
    });
    const detail = await getFindingDetail(ctx.supabase, ctx.organisationId, String(row.id));
    const finding = mapFindingRowToLabView(detail.finding as Record<string, unknown>);
    const linkedControls = (detail.controls ?? []).map((c) => ({
      id: String(c.id),
      name: String(c.name ?? ''),
    }));
    return NextResponse.json(
      {
        ok: true,
        finding: {
          ...finding,
          controlIds: linkedControls.map((c) => c.id),
          linkedControls,
          parentRiskId: finding.parentRiskId ?? null,
        },
        linkedControls,
        parentRiskId: finding.parentRiskId ?? null,
      },
      { status: 201 },
    );
  } catch (err) {
    return labApiErrorResponse(err);
  }
}
