/**
 * Regulatory classification policy and obligation conversion eligibility.
 *
 * The canonical code vocabulary and its legal status are fixed here and in
 * public.ri_classification_code_legal_status(); a regulator policy may describe codes, route them and switch
 * conversion OFF, but can never enable conversion for a code whose legal status is not binding or evidential.
 * public.ri_submit_ai_finding_review and public.ri_guard_obligation_classification remain authoritative; this
 * module mirrors them for the API view, payload validation and tests.
 */
import {
  NON_OPERATIVE_PROVISION_FUNCTIONS,
  evaluateProvisionEligibility,
  parseProvisionReference,
} from './provision-eligibility.mjs';

export const TRIAGE_QUEUES = Object.freeze({
  OBLIGATION: 'OBLIGATION_TRIAGE',
  NON_OBLIGATION: 'NON_OBLIGATION_TRIAGE',
  EXCEPTION: 'EXCEPTION_TRIAGE',
});

export const LEGAL_STATUSES = Object.freeze(['binding', 'evidential', 'non_binding', 'interpretive', 'repealed', 'unknown']);
const CONVERTIBLE_LEGAL_STATUSES = new Set(['binding', 'evidential']);

/** code → fixed legal status and the legacy finding classification column value. */
export const CANONICAL_CLASSIFICATION_CODES = Object.freeze({
  R: { legalStatus: 'binding', findingClassification: 'binding_requirement' },
  E: { legalStatus: 'evidential', findingClassification: 'binding_requirement' },
  D: { legalStatus: 'binding', findingClassification: 'binding_requirement' },
  P: { legalStatus: 'binding', findingClassification: 'binding_requirement' },
  UK: { legalStatus: 'binding', findingClassification: 'binding_requirement' },
  EU: { legalStatus: 'binding', findingClassification: 'binding_requirement' },
  TS: { legalStatus: 'binding', findingClassification: 'binding_requirement' },
  G: { legalStatus: 'non_binding', findingClassification: 'non_binding_guidance' },
  C: { legalStatus: 'non_binding', findingClassification: 'non_binding_guidance' },
  GBR: { legalStatus: 'non_binding', findingClassification: 'guidance_on_requirement' },
  REC: { legalStatus: 'non_binding', findingClassification: 'non_binding_guidance' },
  NBE: { legalStatus: 'non_binding', findingClassification: 'non_binding_guidance' },
  CONS: { legalStatus: 'non_binding', findingClassification: 'non_binding_guidance' },
  PERM: { legalStatus: 'non_binding', findingClassification: 'permission' },
  DEF: { legalStatus: 'interpretive', findingClassification: 'definition' },
  EXEMPT: { legalStatus: 'non_binding', findingClassification: 'scope_exclusion' },
  SH: { legalStatus: 'non_binding', findingClassification: 'safe_harbour' },
  GP: { legalStatus: 'non_binding', findingClassification: 'non_binding_guidance' },
  EXPL: { legalStatus: 'interpretive', findingClassification: 'explanatory_statement' },
  REPEALED: { legalStatus: 'repealed', findingClassification: null },
  UNKNOWN: { legalStatus: 'unknown', findingClassification: null },
});

/** Publication types that are never a binding source, whatever a regulator policy adds. */
export const MANDATORY_NON_BINDING_PUBLICATION_TYPES = Object.freeze([
  'finalised_guidance',
  'guidance',
  'consultation_paper',
  'discussion_paper',
  'feedback_statement',
  'news',
  'press_release',
  'speech',
]);

/** Model bindingNature labels that contradict a binding or evidential code. */
const NON_BINDING_MODEL_LABELS = new Set(['guidance', 'consultation_proposal', 'explanatory_commentary']);

export const MIN_RECLASSIFICATION_EVIDENCE_LENGTH = 20;

export const DISPOSITIONS = Object.freeze({
  CONVERT: 'CONVERT_TO_DRAFT_OBLIGATION',
  LINK: 'LINK_TO_EXISTING_OBLIGATION',
  SUPPORTING: 'SUPPORTING_INFORMATION',
  HORIZON: 'HORIZON_SCANNING',
  ARCHIVE: 'ARCHIVE',
  RECLASSIFY: 'RECLASSIFICATION_REQUESTED',
});

export const QUEUE_ACTIONS = Object.freeze({
  [TRIAGE_QUEUES.OBLIGATION]: [
    'review',
    'assess_applicability',
    'verify_legal_basis',
    DISPOSITIONS.CONVERT,
    DISPOSITIONS.LINK,
    'reclassify',
    'reject',
  ],
  [TRIAGE_QUEUES.NON_OBLIGATION]: [
    'review',
    DISPOSITIONS.LINK,
    DISPOSITIONS.SUPPORTING,
    DISPOSITIONS.HORIZON,
    DISPOSITIONS.ARCHIVE,
    DISPOSITIONS.RECLASSIFY,
  ],
  [TRIAGE_QUEUES.EXCEPTION]: [
    'review',
    'reclassify',
    DISPOSITIONS.RECLASSIFY,
    DISPOSITIONS.LINK,
    DISPOSITIONS.SUPPORTING,
    DISPOSITIONS.ARCHIVE,
    'reject',
  ],
});

const entry = (code, description, conversionEnabled, destinationQueue, extra = {}) => ({
  code,
  description,
  legalStatus: CANONICAL_CLASSIFICATION_CODES[code].legalStatus,
  conversionEnabled,
  destinationQueue,
  humanReviewRequired: true,
  supportingObligationLinkRequired: code === 'E',
  ...extra,
});

const A = TRIAGE_QUEUES.OBLIGATION;
const B = TRIAGE_QUEUES.NON_OBLIGATION;
const X = TRIAGE_QUEUES.EXCEPTION;

/** FCA Handbook "C": market abuse conclusive provisions (MAR). Binding FCA conduct rules are classified R. */
export const C_DESCRIPTION = 'Conduct — market abuse conclusive provisions (FCA Handbook MAR); binding conduct rules are R';

/** Mirrors the seed in migration 20261121180000. */
export const FCA_POLICY_V1 = Object.freeze({
  regulatorKey: 'REG-FCA',
  policyVersion: 1,
  effectiveFrom: '2026-11-21',
  nonBindingPublicationTypes: [...MANDATORY_NON_BINDING_PUBLICATION_TYPES],
  entries: [
    entry('R', 'Rule', true, A),
    entry('E', 'Evidential provision (must be linked to the binding provision it evidences)', true, A),
    entry('D', 'Direction', true, A),
    entry('P', 'Principle', true, A),
    entry('UK', 'UK legislation', true, A),
    entry('EU', 'Applicable EU legislation', true, A),
    entry('TS', 'Binding technical standards', true, A),
    entry('G', 'Guidance', false, B),
    entry('C', C_DESCRIPTION, false, B),
    entry('GBR', 'Guidance on binding requirements', false, B),
    entry('REC', 'Recommendations', false, B),
    entry('NBE', 'Non-binding expectations', false, B),
    entry('CONS', 'Consultation proposals', false, B),
    entry('PERM', 'Permissions', false, B),
    entry('DEF', 'Definitions', false, B),
    entry('EXEMPT', 'Exemptions', false, B),
    entry('SH', 'Safe harbours', false, B),
    entry('GP', 'Good practice', false, B),
    entry('EXPL', 'Explanatory statements', false, B),
    entry('REPEALED', 'Repealed requirements', false, B),
    entry('UNKNOWN', 'Unknown classification', false, X),
  ],
});

/**
 * Mandatory legal validation for a policy. Returns a list of violations (empty when valid).
 * @param {{ regulatorKey?: string, policyVersion?: number, effectiveFrom?: string, nonBindingPublicationTypes?: string[], entries?: any[] }} policy
 */
export function validateClassificationPolicy(policy) {
  const errors = [];
  if (!policy || typeof policy !== 'object') return ['policy_invalid'];
  if (!policy.regulatorKey) errors.push('regulator_required');
  if (!Number.isInteger(policy.policyVersion) || policy.policyVersion < 1) errors.push('policy_version_invalid');
  if (!policy.effectiveFrom || Number.isNaN(Date.parse(policy.effectiveFrom))) errors.push('effective_date_invalid');
  const types = new Set((policy.nonBindingPublicationTypes || []).map((t) => String(t).toLowerCase()));
  for (const t of MANDATORY_NON_BINDING_PUBLICATION_TYPES) {
    if (!types.has(t)) errors.push(`non_binding_publication_type_required:${t}`);
  }
  const seen = new Set();
  for (const e of policy.entries || []) {
    const canonical = CANONICAL_CLASSIFICATION_CODES[e?.code];
    if (!canonical) {
      errors.push(`code_not_canonical:${e?.code}`);
      continue;
    }
    if (seen.has(e.code)) errors.push(`code_duplicated:${e.code}`);
    seen.add(e.code);
    if (e.legalStatus !== canonical.legalStatus) errors.push(`legal_status_fixed:${e.code}`);
    if (!String(e.description || '').trim()) errors.push(`description_required:${e.code}`);
    if (e.conversionEnabled === true) {
      if (!CONVERTIBLE_LEGAL_STATUSES.has(canonical.legalStatus)) errors.push(`conversion_not_permitted:${e.code}`);
      if (e.destinationQueue !== TRIAGE_QUEUES.OBLIGATION) errors.push(`conversion_requires_obligation_queue:${e.code}`);
      if (e.humanReviewRequired !== true) errors.push(`human_review_required:${e.code}`);
    } else if (e.destinationQueue === TRIAGE_QUEUES.OBLIGATION) {
      errors.push(`obligation_queue_requires_conversion:${e.code}`);
    } else if (![TRIAGE_QUEUES.NON_OBLIGATION, TRIAGE_QUEUES.EXCEPTION].includes(e.destinationQueue)) {
      errors.push(`destination_queue_invalid:${e.code}`);
    }
    if (canonical.legalStatus === 'evidential' && e.supportingObligationLinkRequired !== true) {
      errors.push(`supporting_link_required:${e.code}`);
    }
    if (e.code === 'UNKNOWN' && (e.conversionEnabled !== false || e.destinationQueue !== TRIAGE_QUEUES.EXCEPTION)) {
      errors.push('unknown_must_route_to_exception');
    }
  }
  if (!seen.has('UNKNOWN')) errors.push('unknown_entry_required');
  return errors;
}

export function policyEntry(policy, code) {
  if (!policy || !code) return null;
  return (policy.entries || []).find((e) => e.code === code) || null;
}

export function isNonBindingSource(policy, publicationType) {
  const type = String(publicationType || '').toLowerCase();
  if (!type) return false;
  const configured = (policy?.nonBindingPublicationTypes || []).map((t) => String(t).toLowerCase());
  return MANDATORY_NON_BINDING_PUBLICATION_TYPES.includes(type) || configured.includes(type);
}

/** bindingNature labels of model candidates that share a cited source section with the finding. */
export function modelLabelsForFinding(finding, candidates) {
  const sections = new Set(finding?.sourceSectionIds || []);
  const labels = new Set();
  for (const c of candidates || []) {
    if (!c?.bindingNature) continue;
    if ((c.sourceSectionIds || []).some((s) => sections.has(s))) labels.add(String(c.bindingNature));
  }
  return [...labels].sort();
}

/**
 * Routes a finding to exactly one triage queue and states whether DRAFT conversion is permitted.
 * AI confidence is deliberately not an input.
 *
 * @param {{
 *   policy: any,
 *   publicationType?: string | null,
 *   finding: { citationStatus?: string, modelLabels?: string[] },
 *   proposal?: {
 *     code?: string | null,
 *     legalBasis?: string | null,
 *     quotation?: string | null,
 *     quotationPage?: number | null,
 *     supportingObligationId?: string | null,
 *     supportingFindingId?: string | null,
 *     reclassificationEvidence?: string | null,
 *   } | null,
 * }} input
 */
export function evaluateFindingTriage({ policy, publicationType = null, finding, proposal = null }) {
  const reasons = [];
  const modelLabels = finding?.modelLabels || [];
  const citationVerified = finding?.citationStatus === 'VERIFIED';
  if (!policy) {
    return result(TRIAGE_QUEUES.EXCEPTION, ['policy_unavailable'], null, true);
  }

  if (!proposal?.code) {
    // Provisional routing before a human has classified the finding.
    if (!citationVerified) reasons.push('unverified_citation');
    const binding = modelLabels.includes('binding_requirement');
    const nonBinding = modelLabels.some((l) => NON_BINDING_MODEL_LABELS.has(l));
    if (binding && nonBinding) reasons.push('conflicting_classifications');
    if (!binding && !nonBinding) reasons.push('unknown_classification');
    if (binding && !nonBinding && isNonBindingSource(policy, publicationType)) reasons.push('binding_code_from_non_binding_source');
    if (reasons.length) return result(TRIAGE_QUEUES.EXCEPTION, reasons, null, true);
    return result(binding ? TRIAGE_QUEUES.OBLIGATION : TRIAGE_QUEUES.NON_OBLIGATION, [], null, true);
  }

  const e = policyEntry(policy, proposal.code);
  if (!e || e.code === 'UNKNOWN') return result(TRIAGE_QUEUES.EXCEPTION, ['unknown_classification'], e, false);
  if (!citationVerified) reasons.push('unverified_citation');

  const nonOperative = e.conversionEnabled && NON_OPERATIVE_PROVISION_FUNCTIONS.includes(proposal.provisionFunction);
  if (e.conversionEnabled && !nonOperative) {
    if (String(proposal.legalBasis ?? '').trim().length < 3) reasons.push('missing_legal_basis');
    if (String(proposal.quotation ?? '').trim().length < 20 || !Number.isInteger(proposal.quotationPage)) {
      reasons.push('insufficient_evidence');
    }
    if (isNonBindingSource(policy, publicationType)) reasons.push('binding_code_from_non_binding_source');
    const contradicted = modelLabels.some((l) => NON_BINDING_MODEL_LABELS.has(l));
    const evidence = String(proposal.reclassificationEvidence ?? '').trim();
    if (contradicted && evidence.length < MIN_RECLASSIFICATION_EVIDENCE_LENGTH) reasons.push('conflicting_classifications');
    if (e.supportingObligationLinkRequired && !proposal.supportingObligationId && !proposal.supportingFindingId) {
      reasons.push('missing_binding_link');
    }
    const core = parseProvisionReference(proposal.provisionReference)?.core ?? null;
    const onPage = (finding?.sections || []).filter((s) => s.pageNumber === proposal.quotationPage);
    const section =
      onPage.find((s) => core && (s.provisionsSetOut || []).includes(core)) ||
      onPage.find((s) => s.inLegalInstrument === true) ||
      onPage[0] ||
      null;
    reasons.push(
      ...evaluateProvisionEligibility({
        code: e.code,
        legalStatus: e.legalStatus,
        provisionReference: proposal.provisionReference,
        provisionFunction: proposal.provisionFunction,
        quotation: proposal.quotation,
        section,
      }).reasons,
    );
  }

  if (reasons.length) return result(TRIAGE_QUEUES.EXCEPTION, reasons, e, false);
  if (nonOperative) return { ...result(TRIAGE_QUEUES.NON_OBLIGATION, [], e, false), nonOperativeProvision: true };
  if (e.conversionEnabled) return result(TRIAGE_QUEUES.OBLIGATION, [], e, false);
  return result(e.destinationQueue, [], e, false);
}

function result(queue, reasons, e, provisional) {
  return {
    queue,
    provisional,
    exceptionReasons: reasons,
    conversionEligible: queue === TRIAGE_QUEUES.OBLIGATION && !provisional && Boolean(e?.conversionEnabled),
    code: e?.code ?? null,
    legalStatus: e?.legalStatus ?? null,
    allowedActions: QUEUE_ACTIONS[queue],
  };
}

const REASON_ERRORS = {
  unknown_classification: 'finding_classification_unknown',
  unverified_citation: 'finding_citation_unverified',
  missing_legal_basis: 'finding_legal_basis_required',
  insufficient_evidence: 'finding_quotation_required',
  conflicting_classifications: 'finding_classification_conflict',
  binding_code_from_non_binding_source: 'finding_source_not_binding',
  missing_binding_link: 'finding_binding_link_required',
  policy_unavailable: 'classification_policy_unavailable',
  provision_function_required: 'finding_provision_function_required',
  provision_reference_required: 'finding_provision_reference_required',
  provision_not_in_instrument: 'finding_provision_outside_instrument',
  provision_not_set_out_in_section: 'finding_provision_not_in_cited_section',
  provision_not_operative: 'finding_provision_not_operative',
};

/** Error code for a refused conversion, `<code>:<findingNumber>`. */
export function conversionRefusal(evaluation, findingNumber) {
  if (evaluation.conversionEligible) return null;
  const reason = evaluation.exceptionReasons[0] ?? (evaluation.nonOperativeProvision ? 'provision_not_operative' : null);
  const code = reason ? REASON_ERRORS[reason] : 'finding_conversion_not_permitted';
  return code === 'classification_policy_unavailable' ? code : `${code}:${findingNumber}`;
}

/** Reporting split: independently binding obligations vs evidential compliance requirements. */
export function obligationLegalCategory(obligation) {
  const status = obligation?.metadata?.legalStatus;
  if (status === 'binding') return 'binding';
  if (status === 'evidential') return 'evidential';
  return 'unclassified';
}

/**
 * Official sources a binding provision must be verified against (mirrors ri_authoritative_source_url_ok).
 * Guidance text is never an authoritative source for a binding classification.
 */
export const AUTHORITATIVE_SOURCE_PATTERN = /^https:\/\/(www\.)?(legislation\.gov\.uk|handbook\.fca\.org\.uk|eur-lex\.europa\.eu)\//i;
export const MIN_AUTHORITATIVE_QUOTATION_LENGTH = 20;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Manual obligations follow the same classification policy as AI conversions, verified against the
 * authoritative provision itself. Mirrors ri_guard_obligation_classification for MANUAL inserts.
 *
 * @param {{
 *   policy: any,
 *   input: {
 *     code?: string | null,
 *     legalBasis?: string | null,
 *     authoritativeProvision?: { reference?: string | null, sourceUrl?: string | null, quotation?: string | null } | null,
 *     supportsObligationId?: string | null,
 *   },
 * }} p
 * @returns {{ ok: true, entry: any } | { ok: false, error: string }}
 */
export function validateManualObligationClassification({ policy, input }) {
  const code = String(input?.code ?? '').trim();
  if (!code) return { ok: false, error: 'obligation_classification_required' };
  if (!policy) return { ok: false, error: 'classification_policy_unavailable' };
  const e = policyEntry(policy, code);
  if (!e || !CANONICAL_CLASSIFICATION_CODES[code]) return { ok: false, error: 'obligation_classification_unknown' };
  if (!e.conversionEnabled || !CONVERTIBLE_LEGAL_STATUSES.has(e.legalStatus)) {
    return { ok: false, error: `obligation_conversion_not_permitted:${code}` };
  }
  if (String(input.legalBasis ?? '').trim().length < 3) return { ok: false, error: 'obligation_legal_basis_required' };
  const ap = input.authoritativeProvision;
  if (
    !ap ||
    String(ap.reference ?? '').trim().length < 3 ||
    String(ap.quotation ?? '').trim().length < MIN_AUTHORITATIVE_QUOTATION_LENGTH
  ) {
    return { ok: false, error: 'obligation_authoritative_provision_required' };
  }
  if (!AUTHORITATIVE_SOURCE_PATTERN.test(String(ap.sourceUrl ?? '').trim())) {
    return { ok: false, error: 'obligation_authoritative_source_invalid' };
  }
  const link = String(input.supportsObligationId ?? '').trim();
  if (e.supportingObligationLinkRequired && !UUID_PATTERN.test(link)) {
    return { ok: false, error: 'obligation_binding_link_required' };
  }
  if (!e.supportingObligationLinkRequired && link) return { ok: false, error: 'obligation_binding_link_not_applicable' };
  return { ok: true, entry: e };
}
