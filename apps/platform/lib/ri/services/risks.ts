import type { SupabaseClient } from '@supabase/supabase-js';
import { assertRowInOrganisation } from '@/lib/ri/db-guard';
import { parseOptionalDate, parseOptionalText, parseRequiredText } from '@/lib/ri/validation';

export async function listRisks(supabase: SupabaseClient, organisationId: string) {
  const { data, error } = await supabase
    .from('risks')
    .select('id, title, category, inherent_risk, residual_risk, status, review_date')
    .eq('organisation_id', organisationId)
    .order('title');
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createRisk(
  supabase: SupabaseClient,
  organisationId: string,
  userId: string,
  fields: Record<string, unknown>,
) {
  const { data, error } = await supabase
    .from('risks')
    .insert({
      organisation_id: organisationId,
      title: parseRequiredText(fields.title, 'title', 500),
      description: parseOptionalText(fields.description, 8000),
      category: parseOptionalText(fields.category, 200),
      owner_user_id: userId,
      inherent_risk: parseOptionalText(fields.inherent_risk, 100),
      residual_risk: parseOptionalText(fields.residual_risk, 100),
      status: parseOptionalText(fields.status, 50) ?? 'OPEN',
      review_date: parseOptionalDate(fields.review_date),
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function getRiskDetail(supabase: SupabaseClient, organisationId: string, riskId: string) {
  await assertRowInOrganisation(supabase, 'risks', riskId, organisationId);
  const { data, error } = await supabase
    .from('risks')
    .select('*')
    .eq('id', riskId)
    .eq('organisation_id', organisationId)
    .single();
  if (error) throw new Error(error.message);
  const { data: ob } = await supabase
    .from('obligation_risk_links')
    .select('obligation:regulatory_obligations(id, obligation_statement)')
    .eq('organisation_id', organisationId)
    .eq('risk_id', riskId);
  const { data: ctrl } = await supabase
    .from('risk_control_links')
    .select('control:controls(id, name)')
    .eq('organisation_id', organisationId)
    .eq('risk_id', riskId);
  return {
    risk: data,
    obligations: (ob ?? []).map((r) => (Array.isArray(r.obligation) ? r.obligation[0] : r.obligation)),
    controls: (ctrl ?? []).map((r) => (Array.isArray(r.control) ? r.control[0] : r.control)),
  };
}

export async function updateRisk(
  supabase: SupabaseClient,
  organisationId: string,
  riskId: string,
  fields: Record<string, unknown>,
  expectedUpdatedAt?: string | null,
) {
  await assertRowInOrganisation(supabase, 'risks', riskId, organisationId);
  const { data: existing } = await supabase.from('risks').select('updated_at').eq('id', riskId).single();
  if (expectedUpdatedAt && existing && new Date(existing.updated_at).getTime() !== new Date(expectedUpdatedAt).getTime()) {
    throw new Error('stale_record');
  }
  const update: Record<string, unknown> = {};
  if ('title' in fields) update.title = parseRequiredText(fields.title, 'title', 500);
  if ('description' in fields) update.description = parseOptionalText(fields.description, 8000);
  if ('category' in fields) update.category = parseOptionalText(fields.category, 200);
  if ('inherent_risk' in fields) update.inherent_risk = parseOptionalText(fields.inherent_risk, 100);
  if ('residual_risk' in fields) update.residual_risk = parseOptionalText(fields.residual_risk, 100);
  if ('status' in fields) update.status = parseOptionalText(fields.status, 50);
  if ('review_date' in fields) update.review_date = parseOptionalDate(fields.review_date);
  const { data, error } = await supabase
    .from('risks')
    .update(update)
    .eq('id', riskId)
    .eq('organisation_id', organisationId)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}
