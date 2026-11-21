import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

export type ClassificationPolicyEntry = {
  code: string;
  description: string;
  legalStatus: string;
  conversionEnabled: boolean;
  destinationQueue: string;
  humanReviewRequired: boolean;
  supportingObligationLinkRequired: boolean;
};

export type ClassificationPolicy = {
  id: string;
  regulatorKey: string;
  policyVersion: number;
  effectiveFrom: string;
  approvedAt: string | null;
  nonBindingPublicationTypes: string[];
  entries: ClassificationPolicyEntry[];
};

type PolicyRow = {
  id: string;
  regulator_key: string;
  policy_version: number;
  effective_from: string;
  approved_at: string | null;
  non_binding_publication_types: string[];
};

type EntryRow = {
  code: string;
  description: string;
  legal_status: string;
  conversion_enabled: boolean;
  destination_queue: string;
  human_review_required: boolean;
  supporting_obligation_link_required: boolean;
};

/** Active policy for a regulator (regulators.external_key), or null — callers must fail closed on null. */
export async function loadActiveClassificationPolicy(
  supabase: SupabaseClient,
  regulatorKey: string | null,
): Promise<ClassificationPolicy | null> {
  if (!regulatorKey) return null;
  const { data, error } = await supabase
    .from('regulatory_classification_policies')
    .select('id, regulator_key, policy_version, effective_from, approved_at, non_binding_publication_types')
    .eq('regulator_key', regulatorKey)
    .eq('status', 'ACTIVE')
    .maybeSingle();
  if (error) throw new Error(`classification_policy_load_failed:${error.message.slice(0, 120)}`);
  const row = data as PolicyRow | null;
  if (!row) return null;
  const { data: entryData, error: entryError } = await supabase
    .from('regulatory_classification_policy_entries')
    .select(
      'code, description, legal_status, conversion_enabled, destination_queue, human_review_required, supporting_obligation_link_required',
    )
    .eq('policy_id', row.id)
    .order('code', { ascending: true });
  if (entryError) throw new Error(`classification_policy_load_failed:${entryError.message.slice(0, 120)}`);
  const entries = (entryData ?? []) as EntryRow[];
  if (entries.length === 0) return null;
  return {
    id: row.id,
    regulatorKey: row.regulator_key,
    policyVersion: row.policy_version,
    effectiveFrom: row.effective_from,
    approvedAt: row.approved_at,
    nonBindingPublicationTypes: row.non_binding_publication_types ?? [],
    entries: entries.map((e) => ({
      code: e.code,
      description: e.description,
      legalStatus: e.legal_status,
      conversionEnabled: e.conversion_enabled,
      destinationQueue: e.destination_queue,
      humanReviewRequired: e.human_review_required,
      supportingObligationLinkRequired: e.supporting_obligation_link_required,
    })),
  };
}

/** Regulator and publication type that decide which policy and source rules apply to a publication. */
export async function loadPublicationClassificationContext(
  supabase: SupabaseClient,
  publicationId: string | null,
): Promise<{ regulatorKey: string | null; publicationType: string | null }> {
  if (!publicationId) return { regulatorKey: null, publicationType: null };
  const { data, error } = await supabase
    .from('regulatory_publications')
    .select('publication_type, regulator_id')
    .eq('id', publicationId)
    .maybeSingle();
  if (error) throw new Error(`publication_classification_context_failed:${error.message.slice(0, 120)}`);
  const row = data as { publication_type: string | null; regulator_id: string | null } | null;
  if (!row?.regulator_id) return { regulatorKey: null, publicationType: row?.publication_type ?? null };
  const { data: regulator, error: regulatorError } = await supabase
    .from('regulators')
    .select('external_key')
    .eq('id', row.regulator_id)
    .maybeSingle();
  if (regulatorError) throw new Error(`publication_classification_context_failed:${regulatorError.message.slice(0, 120)}`);
  return {
    regulatorKey: (regulator as { external_key: string } | null)?.external_key ?? null,
    publicationType: row.publication_type ?? null,
  };
}
