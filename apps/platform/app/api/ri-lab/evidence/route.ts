import { NextResponse } from 'next/server';
import { requireRiContext } from '@/lib/ri/context';
import { labApiErrorResponse } from '@/lib/ri/lab-api/errors';
import { parseLabEvidenceCreateBody } from '@/lib/ri/lab-api/lab-link-write';
import { assertLabEvidenceWritesEnabled } from '@/lib/ri/lab-api/lab-connected-writes';
import { createEvidence, listEvidence } from '@/lib/ri/services/evidence';
import { mapEvidenceRowToLabView } from '@/lib/ri/lab-api/lab-governance-view';

export async function GET() {
  try {
    const ctx = await requireRiContext('evidence:read');
    const rows = await listEvidence(ctx.supabase, ctx.organisationId);
    return NextResponse.json({
      ok: true,
      evidence: rows.map((r) => mapEvidenceRowToLabView(r as Record<string, unknown>)),
    });
  } catch (err) {
    return labApiErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireRiContext('evidence:write');
    assertLabEvidenceWritesEnabled(ctx.role);
    const fields = parseLabEvidenceCreateBody(await request.json());
    const row = await createEvidence(ctx.supabase, {
      organisationId: ctx.organisationId,
      userId: ctx.userId,
      role: ctx.role,
      fields,
    });
    return NextResponse.json(
      { ok: true, evidence: mapEvidenceRowToLabView(row as Record<string, unknown>) },
      { status: 201 },
    );
  } catch (err) {
    return labApiErrorResponse(err);
  }
}
