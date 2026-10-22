import type { SupabaseClient } from '@supabase/supabase-js';
import { assertRowInOrganisation } from '@/lib/ri/db-guard';
import { parseOptionalText, parseRequiredText } from '@/lib/ri/validation';

export async function listEvidence(supabase: SupabaseClient, organisationId: string) {
  const { data, error } = await supabase
    .from('evidence_items')
    .select('id, title, evidence_type, source_hash, created_at')
    .eq('organisation_id', organisationId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createEvidence(
  supabase: SupabaseClient,
  organisationId: string,
  userId: string,
  fields: Record<string, unknown>,
) {
  const { data, error } = await supabase
    .from('evidence_items')
    .insert({
      organisation_id: organisationId,
      title: parseRequiredText(fields.title, 'title', 500),
      evidence_type: parseRequiredText(fields.evidence_type, 'evidence_type', 200),
      description: parseOptionalText(fields.description, 8000),
      source_url: parseOptionalText(fields.source_url, 2000),
      source_hash: parseOptionalText(fields.source_hash, 200),
      uploaded_by: userId,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function getEvidenceDetail(
  supabase: SupabaseClient,
  organisationId: string,
  evidenceId: string,
) {
  await assertRowInOrganisation(supabase, 'evidence_items', evidenceId, organisationId);
  const { data, error } = await supabase
    .from('evidence_items')
    .select('*')
    .eq('id', evidenceId)
    .eq('organisation_id', organisationId)
    .single();
  if (error) throw new Error(error.message);
  const [ob, ctrl, act] = await Promise.all([
    supabase
      .from('evidence_obligation_links')
      .select('obligation:regulatory_obligations(id, obligation_statement)')
      .eq('organisation_id', organisationId)
      .eq('evidence_id', evidenceId),
    supabase
      .from('evidence_control_links')
      .select('control:controls(id, name)')
      .eq('organisation_id', organisationId)
      .eq('evidence_id', evidenceId),
    supabase
      .from('evidence_action_links')
      .select('action:actions(id, title)')
      .eq('organisation_id', organisationId)
      .eq('evidence_id', evidenceId),
  ]);
  return {
    evidence: data,
    obligations: (ob.data ?? []).map((r) => (Array.isArray(r.obligation) ? r.obligation[0] : r.obligation)),
    controls: (ctrl.data ?? []).map((r) => (Array.isArray(r.control) ? r.control[0] : r.control)),
    actions: (act.data ?? []).map((r) => (Array.isArray(r.action) ? r.action[0] : r.action)),
  };
}
