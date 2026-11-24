/**
 * Human-readable verification presentation counts for Obligation Triage (read model only).
 */

/**
 * @param {Array<{
 *   humanVerification?: string;
 *   hasPersistedDecision?: boolean;
 *   decisionProvenance?: { countsAsGenuineHumanVerification?: boolean; countsAsUatOrTest?: boolean };
 *   reVerificationRequired?: boolean;
 * }>} items
 */
export function countVerificationPresentation(items) {
  const counts = {
    ALL: items.length,
    AWAITING_FIRST_REVIEW: 0,
    GENUINE_REGULATORY_VERIFIED: 0,
    UAT_VERIFIED: 0,
    NEEDS_FURTHER_INVESTIGATION: 0,
    REJECTED_UAT: 0,
    REJECTED_REGULATORY: 0,
    RE_VERIFICATION_REQUIRED: 0,
  };
  for (const item of items) {
    const hv = item.humanVerification || 'UNVERIFIED';
    const prov = item.decisionProvenance;
    if (!item.hasPersistedDecision) {
      counts.AWAITING_FIRST_REVIEW += 1;
    }
    if (item.reVerificationRequired) counts.RE_VERIFICATION_REQUIRED += 1;
    if (hv === 'NEEDS_REVIEW' || hv === 'RE_VERIFICATION_REQUIRED') {
      if (item.hasPersistedDecision) counts.NEEDS_FURTHER_INVESTIGATION += 1;
    }
    if (hv === 'VERIFIED') {
      if (prov?.countsAsGenuineHumanVerification) counts.GENUINE_REGULATORY_VERIFIED += 1;
      else counts.UAT_VERIFIED += 1;
    }
    if (hv === 'REJECTED') {
      if (prov?.countsAsUatOrTest) counts.REJECTED_UAT += 1;
      else counts.REJECTED_REGULATORY += 1;
    }
  }
  return counts;
}

export const PRESENTATION_LABELS = Object.freeze({
  AWAITING_FIRST_REVIEW: 'Awaiting first human review',
  GENUINE_REGULATORY_VERIFIED: 'Regulatory verified',
  UAT_VERIFIED: 'Verified during UAT',
  NEEDS_FURTHER_INVESTIGATION: 'Needs further investigation',
  REJECTED_UAT: 'Rejected during UAT',
  REJECTED_REGULATORY: 'Rejected (regulatory review)',
  RE_VERIFICATION_REQUIRED: 'Re-verification required',
});