import type { SupabaseClient } from '@supabase/supabase-js';
import type { PlatformRole } from '@/lib/roles';
import { canRi } from '@/lib/ri/permissions';
import { assertImpactApproverSoD } from '@/lib/ri/separation-of-duties';
import { recordWorkflowEvent } from '@/lib/ri/workflow-events';
import { parseOptionalText, parseRequiredText } from '@/lib/ri/validation';
import { assertRowInOrganisation } from '@/lib/ri/db-guard';
import { RiConflictError } from '@/lib/ri/errors';

export type PendingGovernanceItem = {
  id: string;
  kind: 'impact_assessment' | 'applicability_assessment';
  title: string;
  status: string;
  submittedAt: string | null;
  ownerUserId: string | null;
  publicationId?: string | null;
  regulatoryChangeId?: string | null;
  /** Used for operational dataScope filtering (not shown in lab UI). */
  businessImpact?: string | null;
  changeExternalKey?: string | null;
  publicationDataOrigin?: string | null;
};

export async function listPendingGovernanceItems(
  supabase: SupabaseClient,
  organisationId: string,
): Promise<PendingGovernanceItem[]> {
  const [impacts, applicability] = await Promise.all([
    supabase
      .from('impact_assessments')
      .select(
        'id, status, submitted_at, owner_user_id, regulatory_change_id, business_impact, change:regulatory_changes(title, external_key)',
      )
      .eq('organisation_id', organisationId)
      .eq('status', 'IN_REVIEW'),
    supabase
      .from('applicability_assessments')
      .select(
        'id, status, submitted_at, submitted_by, publication_id, recommendation, publication:regulatory_publications(title, data_origin)',
      )
      .eq('organisation_id', organisationId)
      .eq('status', 'IN_REVIEW'),
  ]);

  const items: PendingGovernanceItem[] = [];
  for (const row of impacts.data ?? []) {
    const change = Array.isArray(row.change) ? row.change[0] : row.change;
    items.push({
      id: row.id,
      kind: 'impact_assessment',
      title: String(change?.title ?? 'Impact assessment'),
      status: row.status,
      submittedAt: row.submitted_at,
      ownerUserId: row.owner_user_id,
      regulatoryChangeId: row.regulatory_change_id,
      businessImpact: row.business_impact ?? null,
      changeExternalKey: change?.external_key ?? null,
    });
  }
  for (const row of applicability.data ?? []) {
    const pub = Array.isArray(row.publication) ? row.publication[0] : row.publication;
    items.push({
      id: row.id,
      kind: 'applicability_assessment',
      title: String(pub?.title ?? 'Applicability assessment'),
      status: row.status,
      submittedAt: row.submitted_at,
      ownerUserId: row.submitted_by,
      publicationId: row.publication_id,
      publicationDataOrigin: pub?.data_origin ?? null,
    });
  }
  return items;
}

export async function patchApplicabilityAssessment(
  supabase: SupabaseClient,
  params: {
    organisationId: string;
    assessmentId: string;
    userId: string;
    role: PlatformRole;
    fields: Record<string, unknown>;
    expectedUpdatedAt?: string | null;
  },
) {
  await assertRowInOrganisation(
    supabase,
    'applicability_assessments',
    params.assessmentId,
    params.organisationId,
  );
  const { data: existing, error: loadError } = await supabase
    .from('applicability_assessments')
    .select('*')
    .eq('id', params.assessmentId)
    .eq('organisation_id', params.organisationId)
    .single();
  if (loadError) throw new Error(loadError.message);

  if (
    params.expectedUpdatedAt &&
    new Date(existing.updated_at).getTime() !== new Date(params.expectedUpdatedAt).getTime()
  ) {
    throw new Error('stale_record');
  }

  const update: Record<string, unknown> = {};
  if ('rationale' in params.fields) {
    update.rationale = parseOptionalText(params.fields.rationale, 12000);
  }
  if ('override_reason' in params.fields) {
    update.override_reason = parseOptionalText(params.fields.override_reason, 4000);
  }

  type PendingEvent = {
    eventType: 'APPLICABILITY_SUBMITTED' | 'APPLICABILITY_APPROVED' | 'APPLICABILITY_REJECTED';
    fromStatus: string;
    toStatus: string;
  };
  let pending: PendingEvent | null = null;
  let requiredStatus: string | null = null;

  const action = params.fields.action ? String(params.fields.action) : null;
  if (action === 'submit') {
    if (!canRi(params.role, 'applicability:write')) throw new Error('insufficient_role');
    if (!['DRAFT', 'REJECTED'].includes(existing.status)) {
      throw new RiConflictError('applicability_invalid_transition');
    }
    requiredStatus = existing.status;
    update.status = 'IN_REVIEW';
    update.submitted_by = params.userId;
    update.submitted_at = new Date().toISOString();
    pending = { eventType: 'APPLICABILITY_SUBMITTED', fromStatus: existing.status, toStatus: 'IN_REVIEW' };
  } else if (action === 'approve') {
    if (!canRi(params.role, 'impact:approve')) throw new Error('insufficient_role');
    if (existing.status !== 'IN_REVIEW') throw new RiConflictError('applicability_invalid_transition');
    assertImpactApproverSoD({
      ownerUserId: existing.submitted_by,
      approverUserId: params.userId,
    });
    requiredStatus = 'IN_REVIEW';
    update.status = 'APPROVED';
    update.reviewed_by = params.userId;
    update.reviewed_at = new Date().toISOString();
    pending = { eventType: 'APPLICABILITY_APPROVED', fromStatus: 'IN_REVIEW', toStatus: 'APPROVED' };
  } else if (action === 'reject') {
    if (!canRi(params.role, 'impact:approve')) throw new Error('insufficient_role');
    if (existing.status !== 'IN_REVIEW') throw new RiConflictError('applicability_invalid_transition');
    requiredStatus = 'IN_REVIEW';
    update.status = 'REJECTED';
    update.reviewed_by = params.userId;
    update.reviewed_at = new Date().toISOString();
    const comments = parseOptionalText(params.fields.decisionComments ?? params.fields.rationale, 12000);
    if (comments) update.rationale = comments;
    pending = { eventType: 'APPLICABILITY_REJECTED', fromStatus: 'IN_REVIEW', toStatus: 'REJECTED' };
  } else if (action) {
    throw new Error('invalid_action');
  }

  if (!Object.keys(update).length) throw new Error('missing_patch_fields');

  let query = supabase
    .from('applicability_assessments')
    .update(update)
    .eq('id', params.assessmentId)
    .eq('organisation_id', params.organisationId);
  if (requiredStatus) query = query.eq('status', requiredStatus);
  const { data: row, error } = await query.select().single();
  if (error) throw new Error(error.message);

  if (pending) {
    await recordWorkflowEvent(supabase, {
      organisationId: params.organisationId,
      entityType: 'applicability_assessment',
      entityId: params.assessmentId,
      eventType: pending.eventType,
      actorUserId: params.userId,
      fromStatus: pending.fromStatus,
      toStatus: pending.toStatus,
      metadata: action === 'reject' ? { decisionComments: update.rationale } : undefined,
    });
  }

  return row;
}

export async function assignApplicabilityReviewer(
  supabase: SupabaseClient,
  params: {
    organisationId: string;
    assessmentId: string;
    reviewerUserId: string;
    userId: string;
  },
) {
  await assertRowInOrganisation(
    supabase,
    'applicability_assessments',
    params.assessmentId,
    params.organisationId,
  );
  const reviewer = parseRequiredText(params.reviewerUserId, 'reviewer_user_id', 200);
  const { data, error } = await supabase
    .from('applicability_assessments')
    .update({ reviewed_by: reviewer })
    .eq('id', params.assessmentId)
    .eq('organisation_id', params.organisationId)
    .select()
    .single();
  if (error) throw new Error(error.message);
  await recordWorkflowEvent(supabase, {
    organisationId: params.organisationId,
    entityType: 'applicability_assessment',
    entityId: params.assessmentId,
    eventType: 'APPLICABILITY_DECIDED',
    actorUserId: params.userId,
    metadata: { reviewer_user_id: reviewer, assignment: true },
  });
  return data;
}
