import type { SupabaseClient } from '@supabase/supabase-js';
import type { PlatformRole } from '@/lib/roles';
import { assertRowInOrganisation } from '@/lib/ri/db-guard';
import { LAB_PROVENANCE_LOCKED_KEY } from '@/lib/ri/lab-api/change-create-provenance';
import { parseChangeCreateMode } from '@/lib/ri/lab-api/change-create-provenance';
import {
  assuranceLabProvenanceInputFromRow,
  classifyAssuranceForLab,
  resolveAssuranceCreateMetadata,
} from '@/lib/ri/lab-api/risk-control-lab-provenance';
import { RiConflictError } from '@/lib/ri/errors';
import {
  assertGovernanceActionAllowed,
  requiredStatusForGovernanceAction,
} from '@/lib/ri/governance-draft-workflow-guards.mjs';
import { linkAssuranceControl } from '@/lib/ri/links';
import { canRi } from '@/lib/ri/permissions';
import { assertImpactApproverSoD } from '@/lib/ri/separation-of-duties';
import { recordWorkflowEvent } from '@/lib/ri/workflow-events';
import {
  parseAssuranceResult,
  parseOptionalDate,
  parseOptionalText,
  parseRequiredText,
  parseUuid,
} from '@/lib/ri/validation';

const LOCKED_METADATA_KEYS = new Set([
  'recordProvenance',
  'record_provenance',
  LAB_PROVENANCE_LOCKED_KEY,
  'labCreationMode',
  'labProvenanceRecordedAt',
  'labProvenanceRecordedByUserId',
  'parentControlId',
  'metadata',
]);

export async function listAssuranceReviews(supabase: SupabaseClient, organisationId: string) {
  const { data, error } = await supabase
    .from('assurance_reviews')
    .select('id, review_type, result, review_date, reviewer_user_id, notes, metadata, updated_at')
    .eq('organisation_id', organisationId)
    .order('review_date', { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createAssuranceReview(
  supabase: SupabaseClient,
  params: {
    organisationId: string;
    userId: string;
    role: PlatformRole;
    fields: Record<string, unknown>;
    defaultCreationMode?: 'operational' | 'uat_authorised';
  },
) {
  const raw = { ...params.fields };
  if ('metadata' in raw || 'recordProvenance' in raw) {
    throw new Error('client_provenance_rejected');
  }
  const controlIdRaw = raw.controlId ?? raw.control_id;
  const controlId =
    controlIdRaw === null || controlIdRaw === undefined || controlIdRaw === ''
      ? null
      : parseUuid(controlIdRaw, 'control_id');
  const creationMode = parseChangeCreateMode(raw.creationMode, {
    defaultMode: params.defaultCreationMode ?? 'operational',
  });
  const { metadata } = await resolveAssuranceCreateMetadata({
    supabase,
    organisationId: params.organisationId,
    actorUserId: params.userId,
    role: params.role,
    creationMode,
    controlId,
  });
  for (const k of Object.keys(raw)) {
    if (LOCKED_METADATA_KEYS.has(k)) throw new Error('provenance_locked');
  }
  const result = parseAssuranceResult(raw.result);
  const { data, error } = await supabase
    .from('assurance_reviews')
    .insert({
      organisation_id: params.organisationId,
      review_type: parseRequiredText(raw.review_type, 'review_type', 200),
      result,
      reviewer_user_id: params.userId,
      review_date: parseOptionalDate(raw.review_date) ?? new Date().toISOString().slice(0, 10),
      next_review_date: parseOptionalDate(raw.next_review_date),
      notes: parseOptionalText(raw.notes, 8000),
      metadata,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  await recordWorkflowEvent(supabase, {
    organisationId: params.organisationId,
    entityType: 'assurance_review',
    entityId: data.id,
    eventType: 'ASSURANCE_REVIEW_CREATED',
    actorUserId: params.userId,
    toStatus: result,
    metadata: controlId ? { control_id: controlId } : {},
  });
  if (controlId) {
    await linkAssuranceControl(supabase, params.organisationId, data.id, controlId, params.userId);
  }
  return data;
}

export async function updateAssuranceReview(
  supabase: SupabaseClient,
  params: {
    organisationId: string;
    assuranceId: string;
    userId: string;
    fields: Record<string, unknown>;
    expectedUpdatedAt?: string | null;
  },
) {
  await assertRowInOrganisation(supabase, 'assurance_reviews', params.assuranceId, params.organisationId);
  const { data: existing, error: loadErr } = await supabase
    .from('assurance_reviews')
    .select('result, notes, updated_at')
    .eq('id', params.assuranceId)
    .eq('organisation_id', params.organisationId)
    .single();
  if (loadErr || !existing) throw new Error('not_found');
  if (
    params.expectedUpdatedAt &&
    new Date(existing.updated_at).getTime() !== new Date(params.expectedUpdatedAt).getTime()
  ) {
    throw new Error('stale_record');
  }
  const update: Record<string, unknown> = {};
  if ('result' in params.fields) {
    update.result = parseAssuranceResult(params.fields.result);
  }
  if ('notes' in params.fields) {
    update.notes = parseOptionalText(params.fields.notes, 8000);
  }
  if (!Object.keys(update).length) throw new Error('missing_patch_fields');
  const { data, error } = await supabase
    .from('assurance_reviews')
    .update(update)
    .eq('id', params.assuranceId)
    .eq('organisation_id', params.organisationId)
    .select()
    .single();
  if (error) throw new Error(error.message);
  if ('result' in update && String(update.result) !== String(existing.result)) {
    await recordWorkflowEvent(supabase, {
      organisationId: params.organisationId,
      entityType: 'assurance_review',
      entityId: params.assuranceId,
      eventType: 'ASSURANCE_RESULT_CHANGED',
      actorUserId: params.userId,
      fromStatus: String(existing.result),
      toStatus: String(update.result),
    });
  }
  return data;
}

export async function getAssuranceDetail(
  supabase: SupabaseClient,
  organisationId: string,
  assuranceId: string,
) {
  await assertRowInOrganisation(supabase, 'assurance_reviews', assuranceId, organisationId);
  const { data, error } = await supabase
    .from('assurance_reviews')
    .select('*')
    .eq('id', assuranceId)
    .eq('organisation_id', organisationId)
    .single();
  if (error) throw new Error(error.message);
  const [controls, obligations, findings] = await Promise.all([
    supabase
      .from('assurance_review_control_links')
      .select('control:controls(id, name, effectiveness)')
      .eq('organisation_id', organisationId)
      .eq('assurance_review_id', assuranceId),
    supabase
      .from('assurance_review_obligation_links')
      .select('obligation:regulatory_obligations(id, obligation_statement)')
      .eq('organisation_id', organisationId)
      .eq('assurance_review_id', assuranceId),
    supabase
      .from('finding_assurance_review_links')
      .select('finding:findings(id, title, severity)')
      .eq('organisation_id', organisationId)
      .eq('assurance_review_id', assuranceId),
  ]);
  return {
    review: data,
    controls: (controls.data ?? []).map((r) => (Array.isArray(r.control) ? r.control[0] : r.control)),
    obligations: (obligations.data ?? []).map((r) =>
      Array.isArray(r.obligation) ? r.obligation[0] : r.obligation,
    ),
    findings: (findings.data ?? []).map((r) => (Array.isArray(r.finding) ? r.finding[0] : r.finding)),
    labClass: classifyAssuranceForLab(assuranceLabProvenanceInputFromRow(data)),
  };
}

function assuranceWorkflowStatus(metadata: Record<string, unknown> | null | undefined): string {
  const m = metadata && typeof metadata === 'object' ? metadata : {};
  return String(m.assuranceStatus || (m.stage5PrimaryPlan ? 'DRAFT' : 'OPEN'));
}

export async function updateAssuranceWithGovernance(
  supabase: SupabaseClient,
  params: {
    organisationId: string;
    assuranceId: string;
    userId: string;
    role: PlatformRole;
    fields: Record<string, unknown>;
    expectedUpdatedAt?: string | null;
  },
) {
  await assertRowInOrganisation(supabase, 'assurance_reviews', params.assuranceId, params.organisationId);
  const { data: existing, error: loadErr } = await supabase
    .from('assurance_reviews')
    .select('result, notes, updated_at, reviewer_user_id, metadata')
    .eq('id', params.assuranceId)
    .eq('organisation_id', params.organisationId)
    .single();
  if (loadErr || !existing) throw new Error('not_found');

  const wfStatus = assuranceWorkflowStatus(existing.metadata as Record<string, unknown>);
  if (
    params.expectedUpdatedAt &&
    new Date(existing.updated_at).getTime() !== new Date(params.expectedUpdatedAt).getTime()
  ) {
    throw new Error('stale_record');
  }

  if (!params.fields.action) {
    return updateAssuranceReview(supabase, {
      organisationId: params.organisationId,
      assuranceId: params.assuranceId,
      userId: params.userId,
      fields: params.fields,
      expectedUpdatedAt: params.expectedUpdatedAt,
    });
  }

  const meta = { ...(existing.metadata as Record<string, unknown>) };
  const update: Record<string, unknown> = { metadata: meta };
  let pendingEvent: {
    eventType: 'ASSURANCE_PLAN_SUBMITTED' | 'ASSURANCE_CLOSED';
    fromStatus: string;
    toStatus: string;
  } | null = null;
  let requiredMetaStatus: string | null = null;

  if (params.fields.action === 'submit') {
    if (!canRi(params.role, 'assurance:submit')) throw new Error('insufficient_role');
    try {
      assertGovernanceActionAllowed('submit', wfStatus);
    } catch {
      throw new RiConflictError('assurance_invalid_transition');
    }
    requiredMetaStatus = requiredStatusForGovernanceAction('submit', wfStatus);
    meta.assuranceStatus = 'IN_REVIEW';
    pendingEvent = { eventType: 'ASSURANCE_PLAN_SUBMITTED', fromStatus: wfStatus, toStatus: 'IN_REVIEW' };
  } else if (params.fields.action === 'approve') {
    if (!canRi(params.role, 'assurance:approve')) throw new Error('insufficient_role');
    try {
      assertGovernanceActionAllowed('approve', wfStatus);
    } catch {
      throw new RiConflictError('assurance_invalid_transition');
    }
    assertImpactApproverSoD({
      ownerUserId: existing.reviewer_user_id,
      approverUserId: params.userId,
    });
    requiredMetaStatus = requiredStatusForGovernanceAction('approve', wfStatus);
    const nextResult = params.fields.result ? parseAssuranceResult(params.fields.result) : 'PASS';
    if (nextResult === 'NOT_TESTED') {
      throw new RiConflictError('assurance_close_requires_result');
    }
    update.result = nextResult;
    meta.assuranceStatus = 'CLOSED';
    pendingEvent = { eventType: 'ASSURANCE_CLOSED', fromStatus: wfStatus, toStatus: 'CLOSED' };
  } else {
    throw new Error('invalid_action');
  }

  if (requiredMetaStatus && wfStatus !== requiredMetaStatus) {
    throw new RiConflictError('assurance_invalid_transition');
  }

  const { data, error } = await supabase
    .from('assurance_reviews')
    .update(update)
    .eq('id', params.assuranceId)
    .eq('organisation_id', params.organisationId)
    .select()
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new RiConflictError('assurance_invalid_transition');

  if (pendingEvent) {
    await recordWorkflowEvent(supabase, {
      organisationId: params.organisationId,
      entityType: 'assurance_review',
      entityId: params.assuranceId,
      eventType: pendingEvent.eventType,
      actorUserId: params.userId,
      fromStatus: pendingEvent.fromStatus,
      toStatus: pendingEvent.toStatus,
    });
    if (pendingEvent.eventType === 'ASSURANCE_CLOSED') {
      const obligationId = meta.sourceRegulatoryObligationId;
      if (typeof obligationId === 'string') {
        await recordWorkflowEvent(supabase, {
          organisationId: params.organisationId,
          entityType: 'regulatory_obligation',
          entityId: obligationId,
          eventType: 'COMPLIANCE_LIFECYCLE_CLOSED',
          actorUserId: params.userId,
          toStatus: 'CLOSED',
          metadata: {
            assuranceReviewId: params.assuranceId,
            assuranceResult: update.result,
            contractVersion: '2026-11-25',
          },
        });
      }
    }
  }
  return data;
}
