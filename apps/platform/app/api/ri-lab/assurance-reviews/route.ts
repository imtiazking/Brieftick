import { NextResponse } from 'next/server';
import { requireRiContext } from '@/lib/ri/context';
import { labApiErrorResponse } from '@/lib/ri/lab-api/errors';
import { mapAssuranceRowToLabView } from '@/lib/ri/lab-api/lab-governance-view';
import { assertLabConnectedWrite } from '@/lib/ri/lab-api/lab-connected-writes';
import { createAssuranceReview, listAssuranceReviews } from '@/lib/ri/services/assurance';

export async function GET() {
  try {
    const ctx = await requireRiContext('assurance:read');
    const rows = await listAssuranceReviews(ctx.supabase, ctx.organisationId);
    return NextResponse.json({
      ok: true,
      assuranceReviews: rows.map((r) => mapAssuranceRowToLabView(r as Record<string, unknown>)),
    });
  } catch (err) {
    return labApiErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireRiContext('assurance:write');
    assertLabConnectedWrite(ctx.role, 'assurance:write');
    const fields = (await request.json()) as Record<string, unknown>;
    const row = await createAssuranceReview(
      ctx.supabase,
      ctx.organisationId,
      ctx.userId,
      fields,
    );
    return NextResponse.json(
      { ok: true, assuranceReview: mapAssuranceRowToLabView(row as Record<string, unknown>) },
      { status: 201 },
    );
  } catch (err) {
    return labApiErrorResponse(err);
  }
}
