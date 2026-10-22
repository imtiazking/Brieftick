import type { SupabaseClient } from '@supabase/supabase-js';
import { assertRowInOrganisation } from '@/lib/ri/db-guard';
import { parseOptionalText, parseRequiredText } from '@/lib/ri/validation';

export async function listControls(supabase: SupabaseClient, organisationId: string) {
  const { data, error } = await supabase
    .from('controls')
    .select('id, name, control_type, effectiveness, testing_status, status')
    .eq('organisation_id', organisationId)
    .order('name');
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createControl(
  supabase: SupabaseClient,
  organisationId: string,
  userId: string,
  fields: Record<string, unknown>,
) {
  const { data, error } = await supabase
    .from('controls')
    .insert({
      organisation_id: organisationId,
      name: parseRequiredText(fields.name, 'name', 500),
      description: parseOptionalText(fields.description, 8000),
      owner_user_id: userId,
      control_type: parseOptionalText(fields.control_type, 200),
      frequency: parseOptionalText(fields.frequency, 200),
      nature: parseOptionalText(fields.nature, 200),
      execution_type: parseOptionalText(fields.execution_type, 200),
      effectiveness: parseOptionalText(fields.effectiveness, 200),
      testing_status: parseOptionalText(fields.testing_status, 200),
      status: parseOptionalText(fields.status, 50) ?? 'ACTIVE',
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
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
  const { data: existing } = await supabase.from('controls').select('updated_at').eq('id', controlId).single();
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
