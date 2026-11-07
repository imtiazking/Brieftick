import { NextResponse } from 'next/server';
import { requireRiContext } from '@/lib/ri/context';
import { labApiErrorResponse } from '@/lib/ri/lab-api/errors';
import { assertLabConnectedWrite } from '@/lib/ri/lab-api/lab-connected-writes';
import { mapPublicationDetailToLabView } from '@/lib/ri/lab-api/lab-publication-view';
import { getPublicationDetail } from '@/lib/ri/services/publications';
import { upsertOrganisationTriage } from '@/lib/ri/services/triage';

type Params = { params: Promise<{ id: string }> };

function mapIntakeAction(action: string): {
  triageStatus: string;
  relevanceStatus?: string | null;
} {
  switch (action) {
    case 'accept':
      return { triageStatus: 'TRIAGED', relevanceStatus: 'RELEVANT' };
    case 'not-relevant':
      return { triageStatus: 'CLOSED', relevanceStatus: 'NOT_RELEVANT' };
    case 'escalate':
      return { triageStatus: 'IN_REVIEW', relevanceStatus: 'RELEVANT' };
    case 'request-review':
      return { triageStatus: 'IN_REVIEW', relevanceStatus: 'UNASSESSED' };
    case 'assign':
      return { triageStatus: 'IN_REVIEW' };
    default:
      throw new Error('invalid_action');
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id: publicationId } = await params;
    const ctx = await requireRiContext('triage:write');
    assertLabConnectedWrite(ctx.role, 'triage:write');
    const body = (await request.json()) as {
      action?: string;
      assignedTo?: string | null;
      materiality?: string | null;
      expectedUpdatedAt?: string | null;
      triageStatus?: string;
      relevanceStatus?: string | null;
    };

    let triageStatus = body.triageStatus;
    let relevanceStatus = body.relevanceStatus;
    if (body.action) {
      const mapped = mapIntakeAction(body.action);
      triageStatus = mapped.triageStatus;
      relevanceStatus = mapped.relevanceStatus ?? relevanceStatus;
    }
    if (!triageStatus) {
      return NextResponse.json({ error: 'triage_status_required' }, { status: 400 });
    }

    await upsertOrganisationTriage(ctx.supabase, {
      organisationId: ctx.organisationId,
      publicationId,
      userId: ctx.userId,
      triageStatus,
      relevanceStatus: relevanceStatus ?? null,
      materiality: body.materiality ?? null,
      assignedTo: body.assignedTo ?? null,
      expectedUpdatedAt: body.expectedUpdatedAt ?? null,
    });

    const detail = await getPublicationDetail(ctx.supabase, ctx.organisationId, publicationId);
    const labPublication = mapPublicationDetailToLabView(detail);
    return NextResponse.json({ ok: true, labPublication, detail });
  } catch (err) {
    return labApiErrorResponse(err);
  }
}
