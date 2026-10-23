/**
 * Obligation-scoped evidence / assurance attribution (Ask RI predicates & executor).
 */
import {
  actionObligationId,
  evidenceAttributedToObligation,
  assuranceFindingsForObligation,
  inheritedEvidenceViaControl,
} from './ri-canonical-links.js';

export { actionObligationId };

/** Direct canonical attribution: evidence.obligationId only. */
export function directEvidenceIds(state, obligationId) {
  return evidenceAttributedToObligation(state, obligationId);
}

/** @deprecated use directEvidenceIds — alias for predicates */
export function attributableEvidenceIds(state, obligationId) {
  return directEvidenceIds(state, obligationId);
}

export function inheritedEvidenceSupportNotes(state, obligationId) {
  return inheritedEvidenceViaControl(state, obligationId);
}

export { inheritedEvidenceViaControl };

/** Explicit path: obligation ← sourced action ← finding linked to action. */
export function attributableAssuranceFindingIds(state, obligationId) {
  return assuranceFindingsForObligation(state, obligationId);
}

export function evaluateObligationExistencePredicate(state, obligationIds, predicate) {
  const qualifying = [];
  const evidenceByObligation = {};
  const findingsByObligation = {};
  for (const oid of obligationIds) {
    const evidenceIds = directEvidenceIds(state, oid);
    const findingIds = attributableAssuranceFindingIds(state, oid);
    evidenceByObligation[oid] = evidenceIds;
    findingsByObligation[oid] = findingIds;
    const hasEvidence = predicate.requireEvidence ? evidenceIds.length > 0 : true;
    const noFindings = predicate.requireZeroAssuranceFindings ? findingIds.length === 0 : true;
    if (hasEvidence && noFindings) qualifying.push(oid);
  }
  return { qualifying, evidenceByObligation, findingsByObligation };
}
