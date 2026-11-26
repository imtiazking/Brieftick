/**
 * Rating policy for AI-drafted risks. A rating is never defaulted and never invented:
 *  - inherent: kept only with a documented rationale, always labelled provisional;
 *  - residual: UNASSESSED unless control-effectiveness evidence is actually supplied.
 */

export const RISK_RATING_POLICY_VERSION = 'risk-rating-policy-v1';
export const RATING_LEVELS = Object.freeze(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
export const UNASSESSED = 'UNASSESSED';
export const MIN_RATIONALE_CHARS = 40;

function level(value) {
  const v = String(value ?? '').toUpperCase().replace(/[^A-Z]/g, '');
  return RATING_LEVELS.includes(v) ? v : null;
}

function text(v) {
  return typeof v === 'string' ? v.trim() : '';
}

/**
 * @param {Record<string, any>} proposal one riskProposals[] item
 * @param {{ controlEffectivenessEvidence?: Array<{ controlId: string, result: string }> | null }} [org]
 */
export function applyRiskRatingPolicy(proposal, org = {}) {
  const inherent = level(proposal?.inherent_risk ?? proposal?.inherentRisk);
  const inherentRationale = text(proposal?.inherent_rationale ?? proposal?.inherentRationale);
  const residual = level(proposal?.residual_risk ?? proposal?.residualRisk);
  const residualRationale = text(proposal?.residual_rationale ?? proposal?.residualRationale);
  const evidence = Array.isArray(org.controlEffectivenessEvidence) ? org.controlEffectivenessEvidence.filter((e) => e?.controlId && e?.result) : [];

  const out = { notes: [] };
  if (inherent && inherentRationale.length >= MIN_RATIONALE_CHARS) {
    out.inherent_risk = `${inherent} (provisional)`;
    out.inherentStatus = 'AI_PROVISIONAL_REASONED';
    out.inherentRationale = inherentRationale.slice(0, 1500);
  } else {
    out.inherent_risk = UNASSESSED;
    out.inherentStatus = 'UNASSESSED';
    out.inherentRationale = null;
    out.notes.push(inherent ? 'inherent_rating_discarded_no_documented_rationale' : 'inherent_rating_missing_or_invalid');
  }
  if (evidence.length && residual && residualRationale.length >= MIN_RATIONALE_CHARS) {
    out.residual_risk = `${residual} (provisional)`;
    out.residualStatus = 'AI_PROVISIONAL_REASONED_WITH_CONTROL_EVIDENCE';
    out.residualRationale = residualRationale.slice(0, 1500);
    out.controlEvidenceRefs = evidence.map((e) => e.controlId);
  } else {
    out.residual_risk = UNASSESSED;
    out.residualStatus = 'UNASSESSED_NO_CONTROL_EFFECTIVENESS_EVIDENCE';
    out.residualRationale = null;
    out.controlEvidenceRefs = [];
    if (residual) out.notes.push('model_residual_rating_discarded_no_control_effectiveness_evidence');
  }
  out.policyVersion = RISK_RATING_POLICY_VERSION;
  return out;
}
