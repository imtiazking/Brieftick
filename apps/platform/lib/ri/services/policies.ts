import type { SupabaseClient } from '@supabase/supabase-js';
import { assertRowInOrganisation } from '@/lib/ri/db-guard';
import { RiNotFoundError } from '@/lib/ri/errors';
import { parseOptionalDate, parseOptionalText, parseRequiredText } from '@/lib/ri/validation';

export async function listPolicies(supabase: SupabaseClient, organisationId: string) {
  const { data, error } = await supabase
    .from('policies')
    .select('id, name, version, status, owner_user_id, next_review_date')
    .eq('organisation_id', organisationId)
    .order('name');
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createPolicy(
  supabase: SupabaseClient,
  organisationId: string,
  userId: string,
  fields: Record<string, unknown>,
) {
  const { data, error } = await supabase
    .from('policies')
    .insert({
      organisation_id: organisationId,
      name: parseRequiredText(fields.name, 'name', 500),
      description: parseOptionalText(fields.description, 8000),
      owner_user_id: userId,
      version: parseOptionalText(fields.version, 50) ?? '1.0',
      status: parseOptionalText(fields.status, 50) ?? 'DRAFT',
      last_reviewed_at: null,
      next_review_date: parseOptionalDate(fields.next_review_date),
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function getPolicyDetail(
  supabase: SupabaseClient,
  organisationId: string,
  policyId: string,
) {
  await assertRowInOrganisation(supabase, 'policies', policyId, organisationId);
  const { data, error } = await supabase
    .from('policies')
    .select('*')
    .eq('id', policyId)
    .eq('organisation_id', organisationId)
    .single();
  if (error) throw new Error(error.message);
  const { data: obLinks } = await supabase
    .from('obligation_policy_links')
    .select('obligation:regulatory_obligations(id, obligation_statement, status)')
    .eq('organisation_id', organisationId)
    .eq('policy_id', policyId);
  return {
    policy: data,
    obligations: (obLinks ?? []).map((r) => {
      const o = Array.isArray(r.obligation) ? r.obligation[0] : r.obligation;
      return o;
    }),
  };
}

export async function updatePolicy(
  supabase: SupabaseClient,
  organisationId: string,
  policyId: string,
  fields: Record<string, unknown>,
  expectedUpdatedAt?: string | null,
) {
  await assertRowInOrganisation(supabase, 'policies', policyId, organisationId);
  const { data: existing } = await supabase.from('policies').select('updated_at').eq('id', policyId).single();
  if (!existing) throw new RiNotFoundError();
  if (expectedUpdatedAt && new Date(existing.updated_at).getTime() !== new Date(expectedUpdatedAt).getTime()) {
    throw new Error('stale_record');
  }
  const update: Record<string, unknown> = {};
  if ('name' in fields) update.name = parseRequiredText(fields.name, 'name', 500);
  if ('description' in fields) update.description = parseOptionalText(fields.description, 8000);
  if ('version' in fields) update.version = parseOptionalText(fields.version, 50);
  if ('status' in fields) update.status = parseOptionalText(fields.status, 50);
  if ('next_review_date' in fields) update.next_review_date = parseOptionalDate(fields.next_review_date);
  const { data, error } = await supabase
    .from('policies')
    .update(update)
    .eq('id', policyId)
    .eq('organisation_id', organisationId)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}
