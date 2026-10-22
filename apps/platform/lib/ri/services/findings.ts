import type { SupabaseClient } from '@supabase/supabase-js';
import { assertRowInOrganisation } from '@/lib/ri/db-guard';
import { recordWorkflowEvent } from '@/lib/ri/workflow-events';
import { parseOptionalDate, parseOptionalText, parseRequiredText } from '@/lib/ri/validation';

export async function listFindings(supabase: SupabaseClient, organisationId: string) {
  const { data, error } = await supabase
    .from('findings')
    .select('id, title, severity, status, due_date, owner_user_id')
    .eq('organisation_id', organisationId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createFinding(
  supabase: SupabaseClient,
  organisationId: string,
  userId: string,
  fields: Record<string, unknown>,
) {
  const { data, error } = await supabase
    .from('findings')
    .insert({
      organisation_id: organisationId,
      title: parseRequiredText(fields.title, 'title', 500),
      description: parseOptionalText(fields.description, 8000),
      severity: parseRequiredText(fields.severity, 'severity', 50),
      status: 'OPEN',
      owner_user_id: userId,
      due_date: parseOptionalDate(fields.due_date),
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  await recordWorkflowEvent(supabase, {
    organisationId,
    entityType: 'finding',
    entityId: data.id,
    eventType: 'FINDING_CREATED',
    actorUserId: userId,
    toStatus: 'OPEN',
  });
  return data;
}

export async function getFindingDetail(
  supabase: SupabaseClient,
  organisationId: string,
  findingId: string,
) {
  await assertRowInOrganisation(supabase, 'findings', findingId, organisationId);
  const { data, error } = await supabase
    .from('findings')
    .select('*')
    .eq('id', findingId)
    .eq('organisation_id', organisationId)
    .single();
  if (error) throw new Error(error.message);
  const [controls, actions, assurance] = await Promise.all([
    supabase
      .from('finding_control_links')
      .select('control:controls(id, name)')
      .eq('organisation_id', organisationId)
      .eq('finding_id', findingId),
    supabase
      .from('finding_action_links')
      .select('action:actions(id, title)')
      .eq('organisation_id', organisationId)
      .eq('finding_id', findingId),
    supabase
      .from('finding_assurance_review_links')
      .select('assurance:assurance_reviews(id, result)')
      .eq('organisation_id', organisationId)
      .eq('finding_id', findingId),
  ]);
  return {
    finding: data,
    controls: (controls.data ?? []).map((r) => (Array.isArray(r.control) ? r.control[0] : r.control)),
    actions: (actions.data ?? []).map((r) => (Array.isArray(r.action) ? r.action[0] : r.action)),
    assurance: (assurance.data ?? []).map((r) =>
      Array.isArray(r.assurance) ? r.assurance[0] : r.assurance,
    ),
  };
}

export async function updateFinding(
  supabase: SupabaseClient,
  params: {
    organisationId: string;
    findingId: string;
    userId: string;
    fields: Record<string, unknown>;
    expectedUpdatedAt?: string | null;
  },
) {
  await assertRowInOrganisation(supabase, 'findings', params.findingId, params.organisationId);
  const { data: existing } = await supabase
    .from('findings')
    .select('status, updated_at')
    .eq('id', params.findingId)
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
  if ('severity' in params.fields) update.severity = parseRequiredText(params.fields.severity, 'severity', 50);
  if ('due_date' in params.fields) update.due_date = parseOptionalDate(params.fields.due_date);
  if ('status' in params.fields) {
    const next = parseOptionalText(params.fields.status, 50) ?? existing.status;
    update.status = next;
    if (next === 'CLOSED') update.closed_at = new Date().toISOString();
    await recordWorkflowEvent(supabase, {
      organisationId: params.organisationId,
      entityType: 'finding',
      entityId: params.findingId,
      eventType: 'FINDING_STATUS_CHANGED',
      actorUserId: params.userId,
      fromStatus: existing.status,
      toStatus: next,
    });
  }
  const { data, error } = await supabase
    .from('findings')
    .update(update)
    .eq('id', params.findingId)
    .eq('organisation_id', params.organisationId)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}
