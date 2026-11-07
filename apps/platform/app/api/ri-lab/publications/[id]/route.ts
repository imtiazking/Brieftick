import { NextResponse } from 'next/server';
import { requireRiContext } from '@/lib/ri/context';
import { getPublicationDetail } from '@/lib/ri/services/publications';
import { saveApplicabilityAssessment } from '@/lib/ri/services/applicability';
import { labApiErrorResponse } from '@/lib/ri/lab-api/errors';
import { parseLabApplicabilityPatchBody } from '@/lib/ri/lab-api/lab-link-write';
import { assertLabConnectedWrite } from '@/lib/ri/lab-api/lab-connected-writes';
import { sanitizeLabRecord } from '@/lib/ri/lab-api/sanitize';
import { mapPublicationDetailToLabView } from '@/lib/ri/lab-api/lab-publication-view';
import { RiNotFoundError } from '@/lib/ri/errors';

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const ctx = await requireRiContext('ri:read');
    const detail = await getPublicationDetail(ctx.supabase, ctx.organisationId, id);
    const labPublication = mapPublicationDetailToLabView(detail);
    const sanitizedDetail = sanitizeLabRecord(detail as Record<string, unknown>);
    return NextResponse.json({
      ok: true,
      labPublication,
      display: labPublication.display,
      detail: sanitizedDetail,
      /** @deprecated use labPublication + detail */
      publication: sanitizedDetail,
    });
  } catch (err) {
    if (err instanceof RiNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    return labApiErrorResponse(err);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const ctx = await requireRiContext('applicability:write');
    assertLabConnectedWrite(ctx.role, 'applicability:write');
    const patch = parseLabApplicabilityPatchBody(await request.json());
    await saveApplicabilityAssessment(ctx.supabase, {
      organisationId: ctx.organisationId,
      publicationId: id,
      userId: ctx.userId,
      assessmentId: patch.assessmentId,
      recommendation: patch.recommendation,
      rationale: patch.rationale,
      status: patch.status,
      expectedUpdatedAt: patch.expectedUpdatedAt,
    });
    const detail = await getPublicationDetail(ctx.supabase, ctx.organisationId, id);
    const labPublication = mapPublicationDetailToLabView(detail);
    return NextResponse.json({ ok: true, labPublication, detail: sanitizeLabRecord(detail as Record<string, unknown>) });
  } catch (err) {
    return labApiErrorResponse(err);
  }
}
