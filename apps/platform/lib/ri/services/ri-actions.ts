import type { SupabaseClient } from '@supabase/supabase-js';
import { isActionOverdue } from '@/lib/ri/action-overdue';
import { assertRowInOrganisation } from '@/lib/ri/db-guard';
import { recordWorkflowEvent } from '@/lib/ri/workflow-events';
import { parseOptionalDate, parseOptionalText, parseRequiredText } from '@/lib/ri/validation';

export async function listRiActions(supabase: SupabaseClient, organisationId: string) {
  const { data, error } = await supabase
    .from('actions')
    .select('id, title, status, priority, due_date, escalation_status, owner_user_id')
    .eq('organisation_id', organisationId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((a) => ({
    ...a,
    overdue: isActionOverdue(a.due_date, a.status),
  }));
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
  },
) {
  const { data, error } = await supabase
    .from('actions')
    .insert({
      organisation_id: params.organisationId,
      title: parseRequiredText(params.title, 'title', 500),
      description: parseOptionalText(params.description, 8000),
      source_type: parseRequiredText(params.sourceType, 'source_type', 100),
      owner_user_id: params.userId,
      priority: parseOptionalText(params.priority, 100),
      due_date: parseOptionalDate(params.dueDate),
      status: 'OPEN',
    })
    .select()
    .single();
  if (error) throw new Error(error.message);

  if (params.obligationId) {
    await assertRowInOrganisation(
      supabase,
      'regulatory_obligations',
      params.obligationId,
      params.organisationId,
    );
    await supabase.from('action_obligation_links').insert({
      organisation_id: params.organisationId,
      action_id: data.id,
      obligation_id: params.obligationId,
    });
  }
  if (params.controlId) {
    await assertRowInOrganisation(supabase, 'controls', params.controlId, params.organisationId);
    await supabase.from('action_control_gap_links').insert({
      organisation_id: params.organisationId,
      action_id: data.id,
      control_id: params.controlId,
    });
  }
  if (params.impactId) {
    await assertRowInOrganisation(
      supabase,
      'impact_assessments',
      params.impactId,
      params.organisationId,
    );
    await supabase.from('action_impact_assessment_links').insert({
      organisation_id: params.organisationId,
      action_id: data.id,
      impact_assessment_id: params.impactId,
    });
  }

  await recordWorkflowEvent(supabase, {
    organisationId: params.organisationId,
    entityType: 'action',
    entityId: data.id,
    eventType: 'ACTION_CREATED',
    actorUserId: params.userId,
    toStatus: 'OPEN',
  });
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
  const { data: findings } = await supabase
    .from('finding_action_links')
    .select('finding:findings(id, title)')
    .eq('organisation_id', organisationId)
    .eq('action_id', actionId);
  return {
    action: { ...data, overdue: isActionOverdue(data.due_date, data.status) },
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
    .select('status, updated_at, owner_user_id')
    .eq('id', params.actionId)
    .single();
  if (!existing) throw new Error('not_found');
  if (
    params.expectedUpdatedAt &&
    new Date(existing.updated_at).getTime() !== new Date(params.expectedUpdatedAt).getTime()
  ) {
    throw new Error('stale_record');
  }
  const update: Record<string, unknown> = {};
  if ('title' in params.fields) update.title = parseRequiredText(params.fields.title, 'title', 500);
  if ('description' in params.fields) update.description = parseOptionalText(params.fields.description, 8000);
  if ('priority' in params.fields) update.priority = parseOptionalText(params.fields.priority, 100);
  if ('due_date' in params.fields) update.due_date = parseOptionalDate(params.fields.due_date);
  if ('escalation_status' in params.fields) {
    update.escalation_status = parseOptionalText(params.fields.escalation_status, 100);
  }
  if ('status' in params.fields) {
    const next = parseOptionalText(params.fields.status, 50) ?? existing.status;
    update.status = next;
    if (next === 'COMPLETE' || next === 'CLOSED') {
      update.completed_at = new Date().toISOString();
    }
    await recordWorkflowEvent(supabase, {
      organisationId: params.organisationId,
      entityType: 'action',
      entityId: params.actionId,
      eventType: 'ACTION_STATUS_CHANGED',
      actorUserId: params.userId,
      fromStatus: existing.status,
      toStatus: next,
    });
  }
  if ('assign_owner' in params.fields && params.fields.assign_owner === 'self') {
    update.owner_user_id = params.userId;
    await recordWorkflowEvent(supabase, {
      organisationId: params.organisationId,
      entityType: 'action',
      entityId: params.actionId,
      eventType: 'ACTION_ASSIGNED',
      actorUserId: params.userId,
      metadata: { owner_user_id: params.userId },
    });
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
