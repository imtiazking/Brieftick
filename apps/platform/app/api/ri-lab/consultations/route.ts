import { NextResponse } from 'next/server';
import { requireRiContext } from '@/lib/ri/context';
import { labApiErrorResponse } from '@/lib/ri/lab-api/errors';
import { assertCanRi } from '@/lib/ri/permissions';
import {
  buildConsultationLabViews,
  listConsultationTracking,
  upsertConsultationTracking,
  isConsultationPublication,
} from '@/lib/ri/services/consultations';
import { listPublicationsForOrganisation } from '@/lib/ri/services/publications';
import { listChanges } from '@/lib/ri/services/changes';
import { recordWorkflowEvent } from '@/lib/ri/workflow-events';

export async function GET() {
  try {
    const ctx = await requireRiContext('ri:read');
    const [publications, tracking, changes] = await Promise.all([
      listPublicationsForOrganisation(ctx.supabase, ctx.organisationId),
      listConsultationTracking(ctx.supabase, ctx.organisationId),
      listChanges(ctx.supabase, ctx.organisationId),
    ]);
    const changeByPub = new Map<string, string[]>();
    for (const c of changes) {
      const pub = Array.isArray(c.publication) ? c.publication[0] : c.publication;
      const pid = pub?.id as string | undefined;
      if (!pid) continue;
      const list = changeByPub.get(pid) || [];
      list.push(c.id);
      changeByPub.set(pid, list);
    }
    const views = await buildConsultationLabViews(
      ctx.supabase,
      ctx.organisationId,
      publications.filter((p) => isConsultationPublication(p.publication_type)),
      tracking,
      changeByPub,
    );
    return NextResponse.json({ ok: true, consultations: views, total: views.length });
  } catch (err) {
    return labApiErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireRiContext('triage:write');
    assertCanRi(ctx.role, 'triage:write');
    const body = await request.json().catch(() => ({}));
    const publicationId = String(body.publicationId || '').trim();
    if (!publicationId) {
      return NextResponse.json({ ok: false, error: 'publication_id_required' }, { status: 400 });
    }
    const row = await upsertConsultationTracking(ctx.supabase, {
      organisationId: ctx.organisationId,
      userId: ctx.userId,
      publicationId,
      status: body.status ? String(body.status) : undefined,
      ownerUserId: body.ownerUserId ? String(body.ownerUserId) : null,
      internalResponseDeadline: body.internalResponseDeadline ? String(body.internalResponseDeadline) : null,
      internalDecision: body.internalDecision ? String(body.internalDecision) : null,
      responsePreparationStatus: body.responsePreparationStatus
        ? String(body.responsePreparationStatus)
        : null,
      submissionStatus: body.submissionStatus ? String(body.submissionStatus) : null,
      organisationalRelevance: body.organisationalRelevance ? String(body.organisationalRelevance) : null,
      notes: body.notes ? String(body.notes) : null,
    });
    await recordWorkflowEvent(ctx.supabase, {
      organisationId: ctx.organisationId,
      entityType: 'consultation_tracking',
      entityId: row.id,
      eventType: 'CONSULTATION_TRACKING_UPDATED',
      actorUserId: ctx.userId,
      payload: {
        publicationId,
        status: row.status,
        ownerUserId: row.owner_user_id,
        internalResponseDeadline: row.internal_response_deadline,
      },
    });
    return NextResponse.json({ ok: true, tracking: row });
  } catch (err) {
    return labApiErrorResponse(err);
  }
}