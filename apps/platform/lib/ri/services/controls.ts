import type { SupabaseClient } from '@supabase/supabase-js';
import type { PlatformRole } from '@/lib/roles';
import { assertRowInOrganisation } from '@/lib/ri/db-guard';
import { RiConflictError } from '@/lib/ri/errors';
import {
  assertGovernanceActionAllowed,
  requiredStatusForGovernanceAction,
} from '@/lib/ri/governance-draft-workflow-guards.mjs';
import { canRi } from '@/lib/ri/permissions';
import { assertImpactApproverSoD } from '@/lib/ri/separation-of-duties';
import { ensureAssurancePlanFromApprovedControl } from '@/lib/ri/services/control-assurance-downstream';
import { parseOptionalText, parseRequiredText } from '@/lib/ri/validation';
import { parseUuid } from '@/lib/ri/validation';
import { LAB_PROVENANCE_LOCKED_KEY } from '@/lib/ri/lab-api/change-create-provenance';
import { parseCreationModeField, resolveControlCreateMetadata } from '@/lib/ri/lab-api/risk-control-lab-provenance';
import { workflowMetadataForProvenance } from '@/lib/ri/record-provenance';
import { recordWorkflowEvent } from '@/lib/ri/workflow-events';

const LOCKED_METADATA_KEYS = new Set([
  'recordProvenance',
  'record_provenance',
  LAB_PROVENANCE_LOCKED_KEY,
  'labCreationMode',
  'labProvenanceRecordedAt',
  'labProvenanceRecordedByUserId',
  'parentRiskIds',
  'parentControlId',
]);

export async function listControls(supabase: SupabaseClient, organisationId: string) {
  const { data, error } = await supabase
    .from('controls')
    .select('id, name, control_type, effectiveness, testing_status, status, updated_at, metadata')
    .eq('organisation_id', organisationId)
    .order('name');
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createControl(
  supabase: SupabaseClient,
  params: {
    organisationId: string;
    userId: string;
    role: PlatformRole;
    fields: Record<string, unknown>;
  },
) {
  const raw = { ...params.fields };
  if ('metadata' in raw || 'recordProvenance' in raw) {
    throw new Error('client_provenance_rejected');
  }
  const riskIdRaw = raw.riskId ?? raw.risk_id;
  const riskId =
    riskIdRaw === null || riskIdRaw === undefined || riskIdRaw === ''
      ? null
      : parseUuid(riskIdRaw, 'risk_id');

  const creationMode = parseCreationModeField(raw.creationMode);
  const { metadata, recordProvenance, labClass } = await resolveControlCreateMetadata({
    supabase,
    organisationId: params.organisationId,
    actorUserId: params.userId,
    role: params.role,
    creationMode,
    riskId,
  });

  const { data, error } = await supabase
    .from('controls')
    .insert({
      organisation_id: params.organisationId,
      name: parseRequiredText(raw.name, 'name', 500),
      description: parseOptionalText(raw.description, 8000),
      owner_user_id: params.userId,
      control_type: parseOptionalText(raw.control_type, 200),
      frequency: parseOptionalText(raw.frequency, 200),
      nature: parseOptionalText(raw.nature, 200),
      execution_type: parseOptionalText(raw.execution_type, 200),
      effectiveness: parseOptionalText(raw.effectiveness, 200),
      testing_status: parseOptionalText(raw.testing_status, 200),
      status: parseOptionalText(raw.status, 50) ?? 'ACTIVE',
      metadata,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);

  const { count: existingCreatedEvents } = await supabase
    .from('workflow_events')
    .select('id', { count: 'exact', head: true })
    .eq('organisation_id', params.organisationId)
    .eq('entity_type', 'control')
    .eq('entity_id', data.id)
    .eq('event_type', 'CONTROL_CREATED');
  if (!existingCreatedEvents) {
    await recordWorkflowEvent(supabase, {
      organisationId: params.organisationId,
      entityType: 'control',
      entityId: data.id,
      eventType: 'CONTROL_CREATED',
      actorUserId: params.userId,
      toStatus: data.status as string,
      metadata: {
        ...workflowMetadataForProvenance(recordProvenance),
        organisationId: params.organisationId,
        controlId: data.id,
        labClass,
      },
    });
  }

  return data;
}

export async function getControlDetail(
  supabase: SupabaseClient,
  organisationId: string,
  controlId: string,
) {
  await assertRowInOrganisation(supabase, 'controls', controlId, organisationId);
  const { data, error } = await supabase
    .from('controls')
    .select('*')
    .eq('id', controlId)
    .eq('organisation_id', organisationId)
    .single();
  if (error) throw new Error(error.message);

  const [risks, obligations, evidence, findings, actions, assurance] = await Promise.all([
    supabase
      .from('risk_control_links')
      .select('risk:risks(id, title)')
      .eq('organisation_id', organisationId)
      .eq('control_id', controlId),
    supabase
      .from('obligation_control_links')
      .select('obligation:regulatory_obligations(id, obligation_statement)')
      .eq('organisation_id', organisationId)
      .eq('control_id', controlId),
    supabase
      .from('evidence_control_links')
      .select('evidence:evidence_items(id, title, evidence_type)')
      .eq('organisation_id', organisationId)
      .eq('control_id', controlId),
    supabase
      .from('finding_control_links')
      .select('finding:findings(id, title, severity, status)')
      .eq('organisation_id', organisationId)
      .eq('control_id', controlId),
    supabase
      .from('action_control_gap_links')
      .select('action:actions(id, title, status, due_date)')
      .eq('organisation_id', organisationId)
      .eq('control_id', controlId),
    supabase
      .from('assurance_review_control_links')
      .select('assurance:assurance_reviews(id, review_type, result, review_date)')
      .eq('organisation_id', organisationId)
      .eq('control_id', controlId),
  ]);

  const mapJoin = (rows: { [k: string]: unknown }[] | null, key: string) =>
    (rows ?? []).map((r) => (Array.isArray(r[key]) ? r[key][0] : r[key]));

  return {
    control: data,
    risks: mapJoin(risks.data as { risk: unknown }[], 'risk'),
    obligations: mapJoin(obligations.data as { obligation: unknown }[], 'obligation'),
    evidence: mapJoin(evidence.data as { evidence: unknown }[], 'evidence'),
    findings: mapJoin(findings.data as { finding: unknown }[], 'finding'),
    actions: mapJoin(actions.data as { action: unknown }[], 'action'),
    assurance: mapJoin(assurance.data as { assurance: unknown }[], 'assurance'),
  };
}

export async function updateControl(
  supabase: SupabaseClient,
  organisationId: string,
  controlId: string,
  fields: Record<string, unknown>,
  expectedUpdatedAt?: string | null,
) {
  await assertRowInOrganisation(supabase, 'controls', controlId, organisationId);
  for (const k of Object.keys(fields)) {
    if (LOCKED_METADATA_KEYS.has(k)) {
      throw new Error('provenance_locked');
    }
  }
  const { data: existing } = await supabase
    .from('controls')
    .select('updated_at, metadata')
    .eq('id', controlId)
    .single();
  if (expectedUpdatedAt && existing && new Date(existing.updated_at).getTime() !== new Date(expectedUpdatedAt).getTime()) {
    throw new Error('stale_record');
  }
  const update: Record<string, unknown> = {};
  for (const key of [
    'name',
    'description',
    'control_type',
    'frequency',
    'nature',
    'execution_type',
    'effectiveness',
    'testing_status',
    'status',
  ]) {
    if (key in fields) {
      update[key] =
        key === 'name'
          ? parseRequiredText(fields[key], 'name', 500)
          : parseOptionalText(fields[key], key === 'description' ? 8000 : 200);
    }
  }
  const { data, error } = await supabase
    .from('controls')
    .update(update)
    .eq('id', controlId)
    .eq('organisation_id', organisationId)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateControlWithGovernance(
  supabase: SupabaseClient,
  params: {
    organisationId: string;
    controlId: string;
    userId: string;
    role: PlatformRole;
    fields: Record<string, unknown>;
    expectedUpdatedAt?: string | null;
  },
) {
  if (!params.fields.action) {
    return updateControl(
      supabase,
      params.organisationId,
      params.controlId,
      params.fields,
      params.expectedUpdatedAt,
    );
  }

  await assertRowInOrganisation(supabase, 'controls', params.controlId, params.organisationId);
  const { data: existing } = await supabase
    .from('controls')
    .select('status, updated_at, owner_user_id')
    .eq('id', params.controlId)
    .eq('organisation_id', params.organisationId)
    .single();
  if (!existing) throw new Error('not_found');

  if (
    params.expectedUpdatedAt &&
    new Date(existing.updated_at).getTime() !== new Date(params.expectedUpdatedAt).getTime()
  ) {
    throw new Error('stale_record');
  }

  const update: Record<string, unknown> = {};
  let pendingEvent: {
    eventType: 'CONTROL_SUBMITTED' | 'CONTROL_MAPPING_APPROVED' | 'CONTROL_MAPPING_REJECTED';
    fromStatus: string;
    toStatus: string;
  } | null = null;
  let requiredCurrentStatus: string | null = null;

  if (params.fields.action === 'submit') {
    if (!canRi(params.role, 'control:submit')) throw new Error('insufficient_role');
    try {
      assertGovernanceActionAllowed('submit', existing.status);
    } catch {
      throw new RiConflictError('control_invalid_transition');
    }
    requiredCurrentStatus = requiredStatusForGovernanceAction('submit', existing.status);
    update.status = 'IN_REVIEW';
    pendingEvent = { eventType: 'CONTROL_SUBMITTED', fromStatus: existing.status, toStatus: 'IN_REVIEW' };
  } else if (params.fields.action === 'approve') {
    if (!canRi(params.role, 'control:approve')) throw new Error('insufficient_role');
    try {
      assertGovernanceActionAllowed('approve', existing.status);
    } catch {
      throw new RiConflictError('control_invalid_transition');
    }
    assertImpactApproverSoD({ ownerUserId: existing.owner_user_id, approverUserId: params.userId });
    requiredCurrentStatus = requiredStatusForGovernanceAction('approve', existing.status);
    update.status = 'ACTIVE';
    pendingEvent = {
      eventType: 'CONTROL_MAPPING_APPROVED',
      fromStatus: existing.status,
      toStatus: 'ACTIVE',
    };
  } else if (params.fields.action === 'reject') {
    if (!canRi(params.role, 'control:approve')) throw new Error('insufficient_role');
    try {
      assertGovernanceActionAllowed('reject', existing.status);
    } catch {
      throw new RiConflictError('control_invalid_transition');
    }
    requiredCurrentStatus = requiredStatusForGovernanceAction('reject', existing.status);
    update.status = 'DRAFT';
    pendingEvent = {
      eventType: 'CONTROL_MAPPING_REJECTED',
      fromStatus: existing.status,
      toStatus: 'DRAFT',
    };
  } else {
    throw new Error('invalid_action');
  }

  let query = supabase
    .from('controls')
    .update(update)
    .eq('id', params.controlId)
    .eq('organisation_id', params.organisationId);
  if (requiredCurrentStatus) query = query.eq('status', requiredCurrentStatus);
  const { data, error } = await query.select().maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new RiConflictError('control_invalid_transition');

  if (pendingEvent) {
    await recordWorkflowEvent(supabase, {
      organisationId: params.organisationId,
      entityType: 'control',
      entityId: params.controlId,
      eventType: pendingEvent.eventType,
      actorUserId: params.userId,
      fromStatus: pendingEvent.fromStatus,
      toStatus: pendingEvent.toStatus,
    });
    if (pendingEvent.eventType === 'CONTROL_MAPPING_APPROVED') {
      const { count: priorReady } = await supabase
        .from('workflow_events')
        .select('id', { count: 'exact', head: true })
        .eq('organisation_id', params.organisationId)
        .eq('entity_type', 'control')
        .eq('entity_id', params.controlId)
        .eq('event_type', 'STAGE5_ASSURANCE_READY');
      if (!priorReady) {
        await recordWorkflowEvent(supabase, {
          organisationId: params.organisationId,
          entityType: 'control',
          entityId: params.controlId,
          eventType: 'STAGE5_ASSURANCE_READY',
          actorUserId: params.userId,
          fromStatus: 'IN_REVIEW',
          toStatus: 'ACTIVE',
          metadata: { contractVersion: '2026-11-25', stage: 5, nextWorkflow: 'AI_CONTROL_ASSURANCE' },
        });
      }
      await ensureAssurancePlanFromApprovedControl(supabase, {
        organisationId: params.organisationId,
        controlId: params.controlId,
        actorUserId: params.userId,
      });
    }
  }
  return data;
}
