import { NextResponse } from 'next/server';
import { requireRiContext } from '@/lib/ri/context';
import { labApiErrorResponse } from '@/lib/ri/lab-api/errors';
import { mapAssuranceRowToLabView } from '@/lib/ri/lab-api/lab-governance-view';
import { assertLabConnectedWrite } from '@/lib/ri/lab-api/lab-connected-writes';
import { parseLabAssuranceCreateBody } from '@/lib/ri/lab-api/lab-link-write';
import { createAssuranceReview, getAssuranceDetail, listAssuranceReviews } from '@/lib/ri/services/assurance';

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
    const fields = parseLabAssuranceCreateBody(await request.json());
    const row = await createAssuranceReview(ctx.supabase, {
      organisationId: ctx.organisationId,
      userId: ctx.userId,
      role: ctx.role,
      fields,
      defaultCreationMode: 'uat_authorised',
    });
    const detail = await getAssuranceDetail(ctx.supabase, ctx.organisationId, String(row.id));
    const assurance = mapAssuranceRowToLabView(detail.review as Record<string, unknown>);
    const linkedControls = (detail.controls ?? []).map((c) => ({
      id: String(c.id),
      name: String(c.name ?? ''),
    }));
    return NextResponse.json(
      {
        ok: true,
        assuranceReview: {
          ...assurance,
          controlIds: linkedControls.map((c) => c.id),
          linkedControls,
        },
        linkedControls,
      },
      { status: 201 },
    );
  } catch (err) {
    return labApiErrorResponse(err);
  }
}
