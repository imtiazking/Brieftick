import type { SupabaseClient } from '@supabase/supabase-js';
import type { PlatformRole } from '@/lib/roles';
import { assertRowInOrganisation } from '@/lib/ri/db-guard';
import { canRi } from '@/lib/ri/permissions';
import { assertImpactApproverSoD } from '@/lib/ri/separation-of-duties';
import { assertActiveOrganisationAssignee } from '@/lib/ri/organisation-assignee';
import { recordWorkflowEvent } from '@/lib/ri/workflow-events';
import {
  buildLockedChildMetadataFromParentChange,
  workflowMetadataForChildRecordCreate,
} from '@/lib/ri/lab-api/child-record-provenance';
import { fanOutTenantNotification } from '@/lib/ri/services/tenant-notification-fanout';
import { RiConflictError } from '@/lib/ri/errors';
import {
  assertImpactActionAllowed,
  requiredStatusForImpactAction,
} from '@/lib/ri/impact-workflow-guards.mjs';
import { parseOptionalDate, parseOptionalText, parseUuid } from '@/lib/ri/validation';

export async function listImpactAssessments(supabase: SupabaseClient, organisationId: string) {
  const { data, error } = await supabase
    .from('impact_assessments')
    .select(
      `
      id, status, materiality, due_date, owner_user_id, regulatory_change_id, metadata,
      change:regulatory_changes(id, title, description, external_key, origin, publication_id, metadata)
    `,
    )
    .eq('organisation_id', organisationId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createImpactAssessment(
  supabase: SupabaseClient,
  params: {
    organisationId: string;
    regulatoryChangeId: string;
    userId: string;
    role: PlatformRole;
  },
) {
  const changeId = parseUuid(params.regulatoryChangeId, 'regulatory_change_id');
  await assertRowInOrganisation(supabase, 'regulatory_changes', changeId, params.organisationId);
  const { data: change } = await supabase
    .from('regulatory_changes')
    .select('id, title, description, external_key, origin, publication_id, metadata')
    .eq('id', changeId)
    .single();
  if (!change) throw new Error('not_found');

  const { metadata: rowMetadata, recordProvenance, labClass } = buildLockedChildMetadataFromParentChange({
    parentChange: change,
    actorUserId: params.userId,
  });

  const { data, error } = await supabase
    .from('impact_assessments')
    .insert({
      organisation_id: params.organisationId,
      regulatory_change_id: changeId,
      status: 'DRAFT',
      owner_user_id: params.userId,
      metadata: rowMetadata,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);

  const { count: existingCreatedEvents } = await supabase
    .from('workflow_events')
    .select('id', { count: 'exact', head: true })
    .eq('organisation_id', params.organisationId)
    .eq('entity_type', 'impact_assessment')
    .eq('entity_id', data.id)
    .eq('event_type', 'IMPACT_CREATED');
  if (!existingCreatedEvents) {
    await recordWorkflowEvent(supabase, {
      organisationId: params.organisationId,
      entityType: 'impact_assessment',
      entityId: data.id,
      eventType: 'IMPACT_CREATED',
      actorUserId: params.userId,
      toStatus: 'DRAFT',
      metadata: {
        ...workflowMetadataForChildRecordCreate({
          recordProvenance,
          parentChangeId: changeId,
          actorUserId: params.userId,
          labClass,
        }),
        impactAssessmentId: data.id,
        organisationId: params.organisationId,
        parentRegulatoryChangeId: changeId,
      },
    });
  }

  return data;
}

export async function getImpactDetail(
  supabase: SupabaseClient,
  organisationId: string,
  impactId: string,
) {
  await assertRowInOrganisation(supabase, 'impact_assessments', impactId, organisationId);
  const { data, error } = await supabase
    .from('impact_assessments')
    .select(
      `
      *,
      change:regulatory_changes(
        id, title, publication_id, description, external_key, origin, metadata,
        publication:regulatory_publications(id, title)
      )
    `,
    )
    .eq('id', impactId)
    .eq('organisation_id', organisationId)
    .single();
  if (error) throw new Error(error.message);

  const { data: dimensions } = await supabase
    .from('impact_assessment_business_areas')
    .select('business_area')
    .eq('impact_assessment_id', impactId)
    .eq('organisation_id', organisationId);

  return { impact: data, businessAreas: dimensions?.map((d) => d.business_area) ?? [] };
}

export async function updateImpactAssessment(
  supabase: SupabaseClient,
  params: {
    organisationId: string;
    impactId: string;
    userId: string;
    role: PlatformRole;
    fields: Record<string, unknown>;
    expectedUpdatedAt?: string | null;
  },
) {
  await assertRowInOrganisation(
    supabase,
    'impact_assessments',
    params.impactId,
    params.organisationId,
  );

  const { data: existing } = await supabase
    .from('impact_assessments')
    .select('status, updated_at, reviewer_user_id, approver_user_id, owner_user_id')
    .eq('id', params.impactId)
    .single();
  if (!existing) throw new Error('not_found');

  if (
    params.expectedUpdatedAt &&
    new Date(existing.updated_at).getTime() !== new Date(params.expectedUpdatedAt).getTime()
  ) {
    throw new Error('stale_record');
  }

  const update: Record<string, unknown> = {};
  for (const key of [
    'business_impact',
    'operational_impact',
    'technology_impact',
    'compliance_impact',
    'financial_impact',
    'implementation_complexity',
    'materiality',
  ]) {
    if (key in params.fields) {
      update[key] = parseOptionalText(params.fields[key], 8000);
    }
  }
  if ('due_date' in params.fields) {
    update.due_date = parseOptionalDate(params.fields.due_date);
  }
  if ('owner_user_id' in params.fields && !params.fields.action) {
    const assignee = await assertActiveOrganisationAssignee(
      supabase,
      params.organisationId,
      String(params.fields.owner_user_id),
    );
    update.owner_user_id = assignee.clerkUserId;
  }

  type PendingWorkflowEvent = {
    eventType: 'IMPACT_SUBMITTED' | 'IMPACT_APPROVED' | 'IMPACT_REJECTED';
    fromStatus: string;
    toStatus: string;
  };
  let pendingEvent: PendingWorkflowEvent | null = null;
  let requiredCurrentStatus: string | null = null;

  if (params.fields.action === 'submit') {
    if (!canRi(params.role, 'impact:submit')) throw new Error('insufficient_role');
    try {
      assertImpactActionAllowed('submit', existing.status);
    } catch {
      throw new RiConflictError('impact_invalid_transition');
    }
    requiredCurrentStatus = requiredStatusForImpactAction('submit', existing.status);
    update.status = 'IN_REVIEW';
    update.submitted_at = new Date().toISOString();
    pendingEvent = {
      eventType: 'IMPACT_SUBMITTED',
      fromStatus: existing.status,
      toStatus: 'IN_REVIEW',
    };
  } else if (params.fields.action === 'approve') {
    if (!canRi(params.role, 'impact:approve')) throw new Error('insufficient_role');
    try {
      assertImpactActionAllowed('approve', existing.status);
    } catch {
      throw new RiConflictError('impact_invalid_transition');
    }
    assertImpactApproverSoD({
      ownerUserId: existing.owner_user_id,
      approverUserId: params.userId,
    });
    requiredCurrentStatus = requiredStatusForImpactAction('approve', existing.status);
    update.status = 'APPROVED';
    update.approver_user_id = params.userId;
    update.approved_at = new Date().toISOString();
    pendingEvent = {
      eventType: 'IMPACT_APPROVED',
      fromStatus: existing.status,
      toStatus: 'APPROVED',
    };
  } else if (params.fields.action === 'reject') {
    if (!canRi(params.role, 'impact:approve')) throw new Error('insufficient_role');
    try {
      assertImpactActionAllowed('reject', existing.status);
    } catch {
      throw new RiConflictError('impact_invalid_transition');
    }
    requiredCurrentStatus = requiredStatusForImpactAction('reject', existing.status);
    update.status = 'REJECTED';
    update.approver_user_id = params.userId;
    pendingEvent = {
      eventType: 'IMPACT_REJECTED',
      fromStatus: existing.status,
      toStatus: 'REJECTED',
    };
  } else if (params.fields.action === 'mark_reviewed') {
    if (!canRi(params.role, 'impact:review')) throw new Error('insufficient_role');
    update.reviewer_user_id = params.userId;
  } else {
    if (!canRi(params.role, 'impact:write')) throw new Error('insufficient_role');
    if (['APPROVED', 'REJECTED'].includes(existing.status)) {
      throw new Error('impact_locked');
    }
  }

  let query = supabase
    .from('impact_assessments')
    .update(update)
    .eq('id', params.impactId)
    .eq('organisation_id', params.organisationId);
  if (requiredCurrentStatus) {
    query = query.eq('status', requiredCurrentStatus);
  }
  const { data, error } = await query.select().maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) {
    throw new RiConflictError('impact_invalid_transition');
  }

  if (pendingEvent) {
    await recordWorkflowEvent(supabase, {
      organisationId: params.organisationId,
      entityType: 'impact_assessment',
      entityId: params.impactId,
      eventType: pendingEvent.eventType,
      actorUserId: params.userId,
      fromStatus: pendingEvent.fromStatus,
      toStatus: pendingEvent.toStatus,
    });
    if (pendingEvent.eventType === 'IMPACT_SUBMITTED') {
      const fanOut = await fanOutTenantNotification(supabase, {
        organisationId: params.organisationId,
        createdByUserId: params.userId,
        notificationType: 'APPROVAL_REQUEST',
        severity: 'HIGH',
        title: 'Impact assessment awaiting approval',
        message: 'An impact assessment was submitted for checker approval.',
        entityType: 'impact_assessment',
        entityId: params.impactId,
        linkPath: `#/assessment/${params.impactId}`,
        workflowEntityType: 'impact_assessment',
        workflowEntityId: params.impactId,
      });
      if (!fanOut.delivered && !fanOut.retryQueued) {
        console.error('[impact] notification_fan_out_unrecoverable', {
          impactId: params.impactId,
          reason: fanOut.reason,
        });
      }
    }
  }

  if (
    'owner_user_id' in update &&
    data.owner_user_id &&
    data.owner_user_id !== existing.owner_user_id
  ) {
    await recordWorkflowEvent(supabase, {
      organisationId: params.organisationId,
      entityType: 'impact_assessment',
      entityId: params.impactId,
      eventType: 'IMPACT_OWNER_ASSIGNED',
      actorUserId: params.userId,
      metadata: {
        from_owner_user_id: existing.owner_user_id,
        to_owner_user_id: data.owner_user_id,
      },
    });
  }

  if (params.fields.business_areas !== undefined) {
    const areas = String(params.fields.business_areas)
      .split(/[,;\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
    const { error: deleteAreasError } = await supabase
      .from('impact_assessment_business_areas')
      .delete()
      .eq('impact_assessment_id', params.impactId)
      .eq('organisation_id', params.organisationId);
    if (deleteAreasError) throw new Error(deleteAreasError.message);
    if (areas.length) {
      const { error: insertAreasError } = await supabase.from('impact_assessment_business_areas').insert(
        areas.map((business_area) => ({
          organisation_id: params.organisationId,
          impact_assessment_id: params.impactId,
          business_area,
        })),
      );
      if (insertAreasError) throw new Error(insertAreasError.message);
    }
  }

  return data;
}
