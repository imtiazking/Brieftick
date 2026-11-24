/**
 * Evidence-backed classification of persisted finding-review decisions.
 * Reviewer account names alone are never sufficient for "genuine" regulatory verification.
 */

export const DECISION_PROVENANCE = Object.freeze({
  GENUINE_HUMAN_REVIEW_EVIDENCED: 'GENUINE_HUMAN_REVIEW_EVIDENCED',
  AUTOMATED_UAT_DECISION: 'AUTOMATED_UAT_DECISION',
  MANUAL_TEST_DECISION: 'MANUAL_TEST_DECISION',
  HISTORICAL_LEGACY: 'HISTORICAL_LEGACY_DECISION',
  INSUFFICIENT_PROVENANCE: 'INSUFFICIENT_PROVENANCE',
  UNREVIEWED: 'UNREVIEWED',
});

export const VERIFICATION_TIER = Object.freeze({
  UNREVIEWED: 'unreviewed',
  TECHNICAL_UAT: 'technical_uat',
  STAGING_TEST: 'staging_test',
  REGULATORY_HUMAN: 'regulatory_human',
  INSUFFICIENT: 'insufficient',
});

/**
 * @param {{
 *   decision?: string | null;
 *   evidence_pathway?: string | null;
 *   quotation_verification_id?: string | null;
 *   legal_basis?: string | null;
 *   verified_quotation?: string | null;
 *   provision_reference?: string | null;
 *   reviewer_comment?: string | null;
 *   quotation_page?: number | null;
 *   reviewer_user_id?: string | null;
 *   analysis_review_id?: string | null;
 *   created_at?: string | null;
 *   disposition?: string | null;
 *   regulatory_classification_code?: string | null;
 * }} recorded
 * @param {{ stagingTenant?: boolean; reviewerRole?: string | null }} context
 */
export function classifyFindingDecisionProvenance(recorded, context = {}) {
  if (!recorded?.analysis_review_id || !recorded?.reviewer_user_id) {
    return {
      provenanceClass: DECISION_PROVENANCE.UNREVIEWED,
      verificationTier: VERIFICATION_TIER.UNREVIEWED,
      countsAsGenuineHumanVerification: false,
      countsAsUatOrTest: false,
      label: 'Not reviewed',
      detail: 'No immutable finding-review decision row.',
    };
  }

  const pathway = String(recorded.evidence_pathway || '').trim();
  const hasQuoteVerification = Boolean(recorded.quotation_verification_id);
  const hasLegalBasis = Boolean(String(recorded.legal_basis || '').trim());
  const hasQuotation = Boolean(String(recorded.verified_quotation || '').trim());
  const hasProvision = Boolean(String(recorded.provision_reference || '').trim());
  const hasJustification = Boolean(String(recorded.reviewer_comment || '').trim());
  const hasPage = Number.isInteger(recorded.quotation_page);
  const accepted = recorded.decision === 'ACCEPTED';
  const rejected = recorded.decision === 'REJECTED';

  if (pathway === 'human_verified_uat') {
    return {
      provenanceClass: DECISION_PROVENANCE.AUTOMATED_UAT_DECISION,
      verificationTier: VERIFICATION_TIER.TECHNICAL_UAT,
      countsAsGenuineHumanVerification: false,
      countsAsUatOrTest: true,
      label: 'UAT / test pathway',
      detail:
        'Persisted under human_verified_uat evidence pathway. Technical review only — not legal or regulatory sign-off.',
    };
  }

  const evidenceComplete =
    hasQuoteVerification && hasLegalBasis && hasQuotation && hasProvision && hasJustification && hasPage;

  if (pathway === 'production_grounded' && evidenceComplete && accepted) {
    if (context.stagingTenant) {
      return {
        provenanceClass: DECISION_PROVENANCE.MANUAL_TEST_DECISION,
        verificationTier: VERIFICATION_TIER.STAGING_TEST,
        countsAsGenuineHumanVerification: false,
        countsAsUatOrTest: true,
        label: 'Staging test (grounded evidence)',
        detail:
          'Production-grounded quotation verification on authorised staging tenant. Substantiated workflow evidence, not production legal verification.',
      };
    }
    return {
      provenanceClass: DECISION_PROVENANCE.GENUINE_HUMAN_REVIEW_EVIDENCED,
      verificationTier: VERIFICATION_TIER.REGULATORY_HUMAN,
      countsAsGenuineHumanVerification: true,
      countsAsUatOrTest: false,
      label: 'Regulatory human review',
      detail: 'Grounded quotation verification with legal basis, provision reference and reviewer justification.',
    };
  }

  if (rejected && hasJustification) {
    if (pathway === 'human_verified_uat' || context.stagingTenant) {
      return {
        provenanceClass: DECISION_PROVENANCE.MANUAL_TEST_DECISION,
        verificationTier: VERIFICATION_TIER.STAGING_TEST,
        countsAsGenuineHumanVerification: false,
        countsAsUatOrTest: true,
        label: 'Staging test rejection',
        detail: 'Rejected finding with reviewer justification on staging/UAT pathway.',
      };
    }
    return {
      provenanceClass: DECISION_PROVENANCE.HISTORICAL_LEGACY,
      verificationTier: VERIFICATION_TIER.REGULATORY_HUMAN,
      countsAsGenuineHumanVerification: false,
      countsAsUatOrTest: false,
      label: 'Historical rejection',
      detail: 'Rejected with justification; not a positive regulatory verification.',
    };
  }

  if (accepted && recorded.disposition === 'RECLASSIFICATION_REQUESTED') {
    return {
      provenanceClass: DECISION_PROVENANCE.MANUAL_TEST_DECISION,
      verificationTier: VERIFICATION_TIER.STAGING_TEST,
      countsAsGenuineHumanVerification: false,
      countsAsUatOrTest: true,
      label: 'Needs review / reclassification',
      detail: 'Accepted with reclassification requested — further investigation required before regulatory verification.',
    };
  }

  if (!evidenceComplete && (accepted || rejected)) {
    return {
      provenanceClass: DECISION_PROVENANCE.INSUFFICIENT_PROVENANCE,
      verificationTier: VERIFICATION_TIER.INSUFFICIENT,
      countsAsGenuineHumanVerification: false,
      countsAsUatOrTest: false,
      label: 'Insufficient provenance',
      detail: 'Decision row present but mandatory evidence fields are incomplete for regulatory verification.',
    };
  }

  return {
    provenanceClass: DECISION_PROVENANCE.HISTORICAL_LEGACY,
    verificationTier: VERIFICATION_TIER.INSUFFICIENT,
    countsAsGenuineHumanVerification: false,
    countsAsUatOrTest: Boolean(context.stagingTenant),
    label: context.stagingTenant ? 'Staging legacy decision' : 'Historical decision',
    detail: 'Legacy or partially documented decision; treat as audit record only.',
  };
}

/** @param {Array<{ humanVerification?: string; decisionProvenance?: { countsAsGenuineHumanVerification?: boolean; countsAsUatOrTest?: boolean } }>} items */
export function countVerificationWithProvenance(items) {
  const counts = {
    ALL: items.length,
    UNVERIFIED: 0,
    VERIFIED: 0,
    VERIFIED_UAT: 0,
    NEEDS_REVIEW: 0,
    REJECTED: 0,
    RE_VERIFICATION_REQUIRED: 0,
    UAT_TEST: 0,
    GENUINE_VERIFIED: 0,
  };
  for (const item of items) {
    const hv = item.humanVerification || 'UNVERIFIED';
    const prov = item.decisionProvenance;
    if (prov?.countsAsUatOrTest) counts.UAT_TEST += 1;
    if (hv === 'UNVERIFIED') counts.UNVERIFIED += 1;
    else if (hv === 'RE_VERIFICATION_REQUIRED') {
      counts.RE_VERIFICATION_REQUIRED += 1;
      counts.NEEDS_REVIEW += 1;
    } else if (hv === 'NEEDS_REVIEW') counts.NEEDS_REVIEW += 1;
    else if (hv === 'REJECTED') counts.REJECTED += 1;
    else if (hv === 'VERIFIED') {
      if (prov?.countsAsGenuineHumanVerification) {
        counts.VERIFIED += 1;
        counts.GENUINE_VERIFIED += 1;
      } else {
        counts.VERIFIED_UAT += 1;
      }
    }
  }
  return counts;
}