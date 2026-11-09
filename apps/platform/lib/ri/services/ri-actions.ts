import type { SupabaseClient } from '@supabase/supabase-js';
import type { PlatformRole } from '@/lib/roles';
import {
  actionOwnerValueEqual,
  actionStatusValueEqual,
  planActionPatchAuditEvents,
} from '@/lib/ri/action-update-audit';
import { isActionOverdue } from '@/lib/ri/action-overdue';
import { assertRowInOrganisation } from '@/lib/ri/db-guard';
import {
  buildActionCreateIdempotencyKey,
  findLabActionByCreateIdempotencyKey,
  LAB_ACTION_CREATE_IDEMPOTENCY_KEY,
} from '@/lib/ri/lab-api/lab-action-idempotency';
import { resolveActionCreateMetadata } from '@/lib/ri/lab-api/action-lab-provenance';
import type { ChangeCreateMode } from '@/lib/ri/lab-api/change-create-provenance';
import { LAB_PROVENANCE_LOCKED_KEY } from '@/lib/ri/lab-api/change-create-provenance';
import { recordWorkflowEvent } from '@/lib/ri/workflow-events';
import { parseOptionalDate, parseOptionalText, parseRequiredText } from '@/lib/ri/validation';

export async function listRiActions(supabase: SupabaseClient, organisationId: string) {
  const { data, error } = await supabase
    .from('actions')
    .select(
      'id, title, description, status, priority, due_date, escalation_status, owner_user_id, updated_at, metadata',
    )
    .eq('organisation_id', organisationId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((a) => ({
    ...a,
    overdue: isActionOverdue(a.due_date, a.status),
  }));
}

export async function createLabRiAction(
  supabase: SupabaseClient,
  params: {
    organisationId: string;
    userId: string;
    role: PlatformRole;
    title: string;
    sourceType: string;
    description?: string | null;
    priority?: string | null;
    dueDate?: string | null;
    ownerUserId?: string | null;
    creationMode: ChangeCreateMode;
    obligationId?: string | null;
    controlId?: string | null;
    riskId?: string | null;
    idempotencyKey?: string | null;
  },
) {
  const idempotencyKey = buildActionCreateIdempotencyKey({
    organisationId: params.organisationId,
    title: params.title,
    creationMode: params.creationMode,
    obligationId: params.obligationId ?? null,
    controlId: params.controlId ?? null,
    riskId: params.riskId ?? null,
    ownerUserId: params.ownerUserId ?? null,
    dueDate: params.dueDate ?? null,
    clientKey: params.idempotencyKey ?? null,
  });
  const existing = await findLabActionByCreateIdempotencyKey(
    supabase,
    params.organisationId,
    idempotencyKey,
  );
  if (existing) {
    return { row: existing, replayed: true as const };
  }

  const { metadata } = await resolveActionCreateMetadata({
    supabase,
    organisationId: params.organisationId,
    actorUserId: params.userId,
    role: params.role,
    creationMode: params.creationMode,
    obligationId: params.obligationId ?? null,
    controlId: params.controlId ?? null,
    riskId: params.riskId ?? null,
  });
  const mergedMetadata = {
    ...metadata,
    [LAB_ACTION_CREATE_IDEMPOTENCY_KEY]: idempotencyKey,
  };
  const row = await createRiAction(supabase, {
    organisationId: params.organisationId,
    userId: params.userId,
    title: params.title,
    sourceType: params.sourceType,
    description: params.description,
    priority: params.priority,
    dueDate: params.dueDate,
    obligationId: params.obligationId,
    controlId: params.controlId,
    metadata: mergedMetadata,
    ownerUserId: params.ownerUserId,
  });
  return { row, replayed: false as const };
}

export async function createRiAction(
  supabase: SupabaseClient,
  params: {
    organisationId: string;
    userId: string;
    title: string;
    sourceType: string;
    description?: string | null;
    priority?: string | null;
    dueDate?: string | null;
    obligationId?: string | null;
    controlId?: string | null;
    impactId?: string | null;
    metadata?: Record<string, unknown>;
    ownerUserId?: string | null;
  },
) {
  const insertMetadata =
    params.metadata && typeof params.metadata === 'object' ? { ...params.metadata } : {};
  const { data, error } = await supabase
    .from('actions')
    .insert({
      organisation_id: params.organisationId,
      title: parseRequiredText(params.title, 'title', 500),
      description: parseOptionalText(params.description, 8000),
      source_type: parseRequiredText(params.sourceType, 'source_type', 100),
      owner_user_id: params.ownerUserId ?? params.userId,
      metadata: insertMetadata,
      priority: parseOptionalText(params.priority, 100),
      due_date: parseOptionalDate(params.dueDate),
      status: 'OPEN',
    })
    .select()
    .single();
  if (error) throw new Error(error.message);

  const rollbackAction = async () => {
    await supabase
      .from('action_obligation_links')
      .delete()
      .eq('action_id', data.id)
      .eq('organisation_id', params.organisationId);
    await supabase
      .from('action_control_gap_links')
      .delete()
      .eq('action_id', data.id)
      .eq('organisation_id', params.organisationId);
    await supabase
      .from('action_impact_assessment_links')
      .delete()
      .eq('action_id', data.id)
      .eq('organisation_id', params.organisationId);
    await supabase.from('actions').delete().eq('id', data.id).eq('organisation_id', params.organisationId);
  };

  try {
    if (params.obligationId) {
      await assertRowInOrganisation(
        supabase,
        'regulatory_obligations',
        params.obligationId,
        params.organisationId,
      );
      const { error: linkErr } = await supabase.from('action_obligation_links').insert({
        organisation_id: params.organisationId,
        action_id: data.id,
        obligation_id: params.obligationId,
      });
      if (linkErr) throw new Error(linkErr.message);
    }
    if (params.controlId) {
      await assertRowInOrganisation(supabase, 'controls', params.controlId, params.organisationId);
      const { error: linkErr } = await supabase.from('action_control_gap_links').insert({
        organisation_id: params.organisationId,
        action_id: data.id,
        control_id: params.controlId,
      });
      if (linkErr) throw new Error(linkErr.message);
    }
    if (params.impactId) {
      await assertRowInOrganisation(
        supabase,
        'impact_assessments',
        params.impactId,
        params.organisationId,
      );
      const { error: linkErr } = await supabase.from('action_impact_assessment_links').insert({
        organisation_id: params.organisationId,
        action_id: data.id,
        impact_assessment_id: params.impactId,
      });
      if (linkErr) throw new Error(linkErr.message);
    }

    await recordWorkflowEvent(supabase, {
      organisationId: params.organisationId,
      entityType: 'action',
      entityId: data.id,
      eventType: 'ACTION_CREATED',
      actorUserId: params.userId,
      toStatus: 'OPEN',
    });
  } catch (linkOrAuditErr) {
    await rollbackAction();
    throw linkOrAuditErr;
  }
  return data;
}

export async function getRiActionDetail(
  supabase: SupabaseClient,
  organisationId: string,
  actionId: string,
) {
  await assertRowInOrganisation(supabase, 'actions', actionId, organisationId);
  const { data, error } = await supabase
    .from('actions')
    .select('*')
    .eq('id', actionId)
    .eq('organisation_id', organisationId)
    .single();
  if (error) throw new Error(error.message);
  const { data: evidence } = await supabase
    .from('evidence_action_links')
    .select('evidence:evidence_items(id, title)')
    .eq('organisation_id', organisationId)
    .eq('action_id', actionId);
  const { data: obligations } = await supabase
    .from('action_obligation_links')
    .select('obligation:regulatory_obligations(id, obligation_statement)')
    .eq('organisation_id', organisationId)
    .eq('action_id', actionId);
  const { data: controls } = await supabase
    .from('action_control_gap_links')
    .select('control:controls(id, name)')
    .eq('organisation_id', organisationId)
    .eq('action_id', actionId);
  const { data: findings } = await supabase
    .from('finding_action_links')
    .select('finding:findings(id, title)')
    .eq('organisation_id', organisationId)
    .eq('action_id', actionId);
  return {
    action: { ...data, overdue: isActionOverdue(data.due_date, data.status) },
    obligations: (obligations ?? [])
      .map((o) => (Array.isArray(o.obligation) ? o.obligation[0] : o.obligation))
      .filter(Boolean),
    controls: (controls ?? [])
      .map((c) => (Array.isArray(c.control) ? c.control[0] : c.control))
      .filter(Boolean),
    evidence: (evidence ?? []).map((e) => (Array.isArray(e.evidence) ? e.evidence[0] : e.evidence)),
    findings: (findings ?? []).map((f) => (Array.isArray(f.finding) ? f.finding[0] : f.finding)),
  };
}

export async function updateRiAction(
  supabase: SupabaseClient,
  params: {
    organisationId: string;
    actionId: string;
    userId: string;
    fields: Record<string, unknown>;
    expectedUpdatedAt?: string | null;
  },
) {
  await assertRowInOrganisation(supabase, 'actions', params.actionId, params.organisationId);
  const { data: existing } = await supabase
    .from('actions')
    .select(
      'title, description, status, priority, due_date, escalation_status, updated_at, owner_user_id, metadata',
    )
    .eq('id', params.actionId)
    .single();
  if (!existing) throw new Error('not_found');
  if (
    params.expectedUpdatedAt &&
    new Date(existing.updated_at).getTime() !== new Date(params.expectedUpdatedAt).getTime()
  ) {
    throw new Error('stale_record');
  }
  if (
    existing?.metadata &&
    typeof existing.metadata === 'object' &&
    (existing.metadata as Record<string, unknown>)[LAB_PROVENANCE_LOCKED_KEY] === true
  ) {
    for (const k of ['metadata', 'recordProvenance', 'record_provenance', LAB_PROVENANCE_LOCKED_KEY]) {
      if (k in params.fields) throw new Error('provenance_locked');
    }
  }
  const parsedOwnerInPatch =
    'owner_user_id' in params.fields && params.fields.owner_user_id
      ? parseRequiredText(params.fields.owner_user_id, 'owner_user_id', 128)
      : undefined;
  const parsedStatusInPatch = 'status' in params.fields
    ? (parseOptionalText(params.fields.status, 50) ?? existing.status)
    : undefined;
  const assignOwnerSelf =
    'assign_owner' in params.fields && params.fields.assign_owner === 'self' ? params.userId : undefined;

  const auditPlan = planActionPatchAuditEvents({
    existingStatus: existing.status,
    existingOwnerUserId: existing.owner_user_id,
    requestedStatus: parsedStatusInPatch,
    requestedOwnerUserId: parsedOwnerInPatch,
    assignOwnerSelfUserId: assignOwnerSelf,
  });

  const update: Record<string, unknown> = {};
  if ('title' in params.fields) {
    const next = parseRequiredText(params.fields.title, 'title', 500);
    if (next !== existing.title) update.title = next;
  }
  if (parsedOwnerInPatch !== undefined && !actionOwnerValueEqual(existing.owner_user_id, parsedOwnerInPatch)) {
    update.owner_user_id = parsedOwnerInPatch;
  }
  if ('description' in params.fields) {
    const next = parseOptionalText(params.fields.description, 8000);
    const prev = existing.description ?? null;
    if (next !== prev) update.description = next;
  }
  if ('priority' in params.fields) {
    const next = parseOptionalText(params.fields.priority, 100);
    const prev = existing.priority ?? null;
    if (next !== prev) update.priority = next;
  }
  if ('due_date' in params.fields) {
    const next = parseOptionalDate(params.fields.due_date);
    const prev = existing.due_date ?? null;
    if (next !== prev) update.due_date = next;
  }
  if ('escalation_status' in params.fields) {
    const next = parseOptionalText(params.fields.escalation_status, 100);
    const prev = existing.escalation_status ?? null;
    if (next !== prev) update.escalation_status = next;
  }
  if (parsedStatusInPatch !== undefined && !actionStatusValueEqual(existing.status, parsedStatusInPatch)) {
    update.status = parsedStatusInPatch;
    if (parsedStatusInPatch === 'COMPLETE' || parsedStatusInPatch === 'CLOSED') {
      update.completed_at = new Date().toISOString();
    }
  }
  if (assignOwnerSelf !== undefined && !actionOwnerValueEqual(existing.owner_user_id, assignOwnerSelf)) {
    update.owner_user_id = assignOwnerSelf;
  }

  if (auditPlan.emitOwnerAssigned && auditPlan.assigneeUserId) {
    await recordWorkflowEvent(supabase, {
      organisationId: params.organisationId,
      entityType: 'action',
      entityId: params.actionId,
      eventType: 'ACTION_ASSIGNED',
      actorUserId: params.userId,
      metadata: { owner_user_id: auditPlan.assigneeUserId },
    });
  }
  if (auditPlan.emitStatusChanged && auditPlan.statusTo) {
    await recordWorkflowEvent(supabase, {
      organisationId: params.organisationId,
      entityType: 'action',
      entityId: params.actionId,
      eventType: 'ACTION_STATUS_CHANGED',
      actorUserId: params.userId,
      fromStatus: auditPlan.statusFrom,
      toStatus: auditPlan.statusTo,
    });
  }

  if (!Object.keys(update).length) {
    const { data: current, error: readErr } = await supabase
      .from('actions')
      .select()
      .eq('id', params.actionId)
      .eq('organisation_id', params.organisationId)
      .single();
    if (readErr) throw new Error(readErr.message);
    return { ...current, overdue: isActionOverdue(current.due_date, current.status) };
  }

  const { data, error } = await supabase
    .from('actions')
    .update(update)
    .eq('id', params.actionId)
    .eq('organisation_id', params.organisationId)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return { ...data, overdue: isActionOverdue(data.due_date, data.status) };
}
