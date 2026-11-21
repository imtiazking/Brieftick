import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  CANONICAL_CLASSIFICATION_CODES,
  MANDATORY_NON_BINDING_PUBLICATION_TYPES,
  TRIAGE_QUEUES,
  validateClassificationPolicy,
} from '@/lib/ri/classification/regulatory-classification-policy.mjs';
import { RiConflictError, RiNotFoundError, RiValidationError } from '@/lib/ri/errors';

/**
 * Classification policy administration. Every write goes through the database RPCs
 * (ri_propose / ri_activate / ri_withdraw_classification_policy), which enforce the platform-operator
 * check, legal constraints, maker-checker and the append-only audit history; validation here only gives
 * earlier, readable errors.
 */

export type PolicyEntryInput = {
  code: string;
  description: string;
  conversionEnabled: boolean;
  destinationQueue: string;
  supportingObligationLinkRequired: boolean;
};

export type ProposePolicyInput = {
  regulatorKey: string;
  effectiveFrom: string;
  nonBindingPublicationTypes: string[];
  entries: PolicyEntryInput[];
  changeReason: string;
};

export function isClassificationPolicyAdminWriteEnabled() {
  return process.env.RI_CLASSIFICATION_POLICY_ADMIN_WRITES_ENABLED === 'true';
}

const REGULATOR_KEY = /^REG-[A-Z0-9-]{2,40}$/;
const PUBLICATION_TYPE = /^[a-z][a-z0-9_]{1,60}$/;
const MIN_REASON = 10;

const RPC_ERRORS: Record<string, () => Error> = {
  classification_policy_operator_required: () => new Error('insufficient_role'),
  segregation_of_duties: () => new Error('segregation_of_duties'),
  not_found: () => new RiNotFoundError('not_found'),
  classification_policy_transition_invalid: () => new RiConflictError('classification_policy_transition_invalid'),
  classification_policy_not_yet_effective: () => new RiConflictError('classification_policy_not_yet_effective'),
  classification_policy_draft_outdated: () => new RiConflictError('classification_policy_draft_outdated'),
  classification_policy_unknown_entry_required: () => new RiValidationError('unknown_entry_required'),
  classification_policy_reason_required: () => new RiValidationError('change_reason_required'),
  classification_policy_entries_required: () => new RiValidationError('entries_required'),
};

function mapRpcError(error: { message?: string; code?: string }): Error {
  const message = (error.message || '').trim();
  const known = RPC_ERRORS[message];
  if (known) return known();
  if (error.code === '23514' || error.code === '23502' || error.code === '23505') {
    return new RiValidationError(`classification_policy_constraint:${message.slice(0, 120)}`);
  }
  return new Error(`classification_policy_admin_failed:${message.slice(0, 160)}`);
}

export function classificationVocabulary() {
  return {
    codes: Object.entries(CANONICAL_CLASSIFICATION_CODES).map(([code, v]) => ({ code, legalStatus: v.legalStatus })),
    convertibleLegalStatuses: ['binding', 'evidential'],
    queues: Object.values(TRIAGE_QUEUES),
    mandatoryNonBindingPublicationTypes: [...MANDATORY_NON_BINDING_PUBLICATION_TYPES],
  };
}

export async function loadClassificationPolicyAdmin(supabase: SupabaseClient, { operator }: { operator: boolean }) {
  const [regulators, policies, entries] = await Promise.all([
    supabase.from('regulators').select('external_key, name, acronym').order('external_key'),
    supabase
      .from('regulatory_classification_policies')
      .select(
        'id, regulator_key, policy_version, effective_from, status, non_binding_publication_types, change_reason, created_by_user_id, approved_by_user_id, approved_at, created_at',
      )
      .order('regulator_key')
      .order('policy_version', { ascending: false }),
    supabase
      .from('regulatory_classification_policy_entries')
      .select(
        'policy_id, code, description, legal_status, conversion_enabled, destination_queue, human_review_required, supporting_obligation_link_required',
      )
      .order('code'),
  ]);
  for (const r of [regulators, policies, entries]) {
    if (r.error) throw new Error(`classification_policy_admin_load_failed:${r.error.message.slice(0, 120)}`);
  }
  let events: unknown[] = [];
  if (operator) {
    const ev = await supabase
      .from('regulatory_classification_policy_events')
      .select('policy_id, event_type, actor, detail, created_at')
      .order('created_at', { ascending: false })
      .limit(500);
    if (ev.error) throw new Error(`classification_policy_admin_load_failed:${ev.error.message.slice(0, 120)}`);
    events = ev.data ?? [];
  }
  const entriesByPolicy = new Map<string, unknown[]>();
  for (const e of (entries.data ?? []) as Array<Record<string, unknown>>) {
    const list = entriesByPolicy.get(e.policy_id as string) ?? [];
    list.push({
      code: e.code,
      description: e.description,
      legalStatus: e.legal_status,
      conversionEnabled: e.conversion_enabled,
      destinationQueue: e.destination_queue,
      humanReviewRequired: e.human_review_required,
      supportingObligationLinkRequired: e.supporting_obligation_link_required,
    });
    entriesByPolicy.set(e.policy_id as string, list);
  }
  return {
    operator,
    vocabulary: classificationVocabulary(),
    regulators: (regulators.data ?? []).map((r) => ({ key: r.external_key, name: r.name, acronym: r.acronym })),
    policies: ((policies.data ?? []) as Array<Record<string, unknown>>).map((p) => ({
      id: p.id,
      regulatorKey: p.regulator_key,
      policyVersion: p.policy_version,
      effectiveFrom: p.effective_from,
      status: p.status,
      nonBindingPublicationTypes: p.non_binding_publication_types ?? [],
      changeReason: p.change_reason,
      createdBy: p.created_by_user_id,
      approvedBy: p.approved_by_user_id,
      approvedAt: p.approved_at,
      createdAt: p.created_at,
      entries: entriesByPolicy.get(p.id as string) ?? [],
    })),
    events,
  };
}

/** Normalises and validates a proposal; throws RiValidationError listing every violation. */
export function normaliseProposal(input: ProposePolicyInput) {
  const regulatorKey = String(input?.regulatorKey ?? '').trim();
  const changeReason = String(input?.changeReason ?? '').trim();
  const effectiveFrom = String(input?.effectiveFrom ?? '').trim();
  const types = [
    ...new Set(
      [...(Array.isArray(input?.nonBindingPublicationTypes) ? input.nonBindingPublicationTypes : []), ...MANDATORY_NON_BINDING_PUBLICATION_TYPES]
        .map((t) => String(t).trim().toLowerCase())
        .filter(Boolean),
    ),
  ].sort();
  const entries = (Array.isArray(input?.entries) ? input.entries : []).map((e) => {
    const code = String(e?.code ?? '').trim();
    const canonical = (CANONICAL_CLASSIFICATION_CODES as Record<string, { legalStatus: string }>)[code];
    return {
      code,
      description: String(e?.description ?? '').trim(),
      legalStatus: canonical?.legalStatus ?? null,
      conversionEnabled: e?.conversionEnabled === true,
      destinationQueue: String(e?.destinationQueue ?? '').trim(),
      humanReviewRequired: true,
      supportingObligationLinkRequired: e?.supportingObligationLinkRequired === true,
    };
  });
  const errors: string[] = [];
  if (!REGULATOR_KEY.test(regulatorKey)) errors.push('regulator_invalid');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) errors.push('effective_date_invalid');
  if (changeReason.length < MIN_REASON) errors.push('change_reason_required');
  for (const t of types) if (!PUBLICATION_TYPE.test(t)) errors.push(`publication_type_invalid:${t.slice(0, 40)}`);
  errors.push(
    ...validateClassificationPolicy({ regulatorKey, policyVersion: 1, effectiveFrom, nonBindingPublicationTypes: types, entries }),
  );
  if (errors.length) throw new RiValidationError(errors.join(','));
  return { regulatorKey, effectiveFrom, nonBindingPublicationTypes: types, entries, changeReason };
}

export async function proposeClassificationPolicy(supabase: SupabaseClient, input: ProposePolicyInput) {
  const p = normaliseProposal(input);
  const { data: regulator, error: regError } = await supabase
    .from('regulators')
    .select('external_key')
    .eq('external_key', p.regulatorKey)
    .maybeSingle();
  if (regError) throw new Error(`classification_policy_admin_failed:${regError.message.slice(0, 120)}`);
  if (!regulator) throw new RiValidationError('regulator_unknown');
  const { data, error } = await supabase.rpc('ri_propose_classification_policy', {
    p_regulator_key: p.regulatorKey,
    p_effective_from: p.effectiveFrom,
    p_non_binding_publication_types: p.nonBindingPublicationTypes,
    p_entries: p.entries,
    p_change_reason: p.changeReason,
  });
  if (error) throw mapRpcError(error);
  return { policyId: data as string };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function activateClassificationPolicy(supabase: SupabaseClient, policyId: string) {
  if (!UUID.test(String(policyId))) throw new RiValidationError('policy_id_invalid');
  const { error } = await supabase.rpc('ri_activate_classification_policy', { p_policy_id: policyId });
  if (error) throw mapRpcError(error);
  return { policyId };
}

export async function withdrawClassificationPolicy(supabase: SupabaseClient, policyId: string, reason: string) {
  if (!UUID.test(String(policyId))) throw new RiValidationError('policy_id_invalid');
  if (String(reason ?? '').trim().length < MIN_REASON) throw new RiValidationError('change_reason_required');
  const { error } = await supabase.rpc('ri_withdraw_classification_policy', {
    p_policy_id: policyId,
    p_reason: String(reason).trim(),
  });
  if (error) throw mapRpcError(error);
  return { policyId };
}
