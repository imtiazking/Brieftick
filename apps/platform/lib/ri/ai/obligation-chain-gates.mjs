/**
 * Publication → obligation chain gates (pure; callers load the rows).
 *
 * Chain: publication → UC-RI-002 change (accepted, DRAFT) → applicability assessment (APPROVED)
 *        → UC-RI-005 extraction targeted at that change → independent review → DRAFT obligations
 *        → existing obligation approval workflow.
 */

export const OBLIGATION_CHAIN_ERRORS = Object.freeze({
  PARENT_CHANGE_REQUIRED: 'obligation_extraction_requires_parent_change',
  PARENT_CHANGE_NOT_FOUND: 'obligation_extraction_parent_change_not_found',
  PARENT_CHANGE_PUBLICATION_MISMATCH: 'obligation_extraction_parent_change_publication_mismatch',
  APPLICABILITY_NOT_ASSESSED: 'obligation_extraction_applicability_not_assessed',
  APPLICABILITY_NOT_APPROVED: 'obligation_extraction_applicability_not_approved',
  PUBLICATION_NOT_APPLICABLE: 'obligation_extraction_publication_not_applicable',
});

export const OBLIGATION_SKIP_REASONS = Object.freeze({
  NO_CITATION: 'no_citation_record',
  CITATION_NOT_VERIFIED: 'citation_not_verified',
  NO_STATEMENT: 'candidate_missing_statement',
  NO_PARENT_CHANGE: 'no_parent_change',
  PARENT_CHANGE_NOT_IN_ORG: 'parent_change_not_in_organisation',
});

const APPLICABLE_RECOMMENDATIONS = new Set(['APPLICABLE', 'POSSIBLY_APPLICABLE']);

/**
 * @param {{ targetChangeId?: string | null, change?: { id: string, publication_id?: string | null } | null, publicationId: string }} p
 * @returns {{ ok: true } | { ok: false, code: string }}
 */
export function assessObligationExtractionTarget(p) {
  if (!p.targetChangeId) return { ok: false, code: OBLIGATION_CHAIN_ERRORS.PARENT_CHANGE_REQUIRED };
  if (!p.change) return { ok: false, code: OBLIGATION_CHAIN_ERRORS.PARENT_CHANGE_NOT_FOUND };
  if (p.change.publication_id && p.change.publication_id !== p.publicationId) {
    return { ok: false, code: OBLIGATION_CHAIN_ERRORS.PARENT_CHANGE_PUBLICATION_MISMATCH };
  }
  return { ok: true };
}

/**
 * Latest applicability assessment for (organisation, publication) must be APPROVED and not NOT_APPLICABLE.
 * @param {{ status?: string, recommendation?: string } | null | undefined} assessment
 * @returns {{ ok: true } | { ok: false, code: string }}
 */
export function assessApplicabilityGate(assessment) {
  if (!assessment) return { ok: false, code: OBLIGATION_CHAIN_ERRORS.APPLICABILITY_NOT_ASSESSED };
  if (assessment.status !== 'APPROVED') {
    return { ok: false, code: OBLIGATION_CHAIN_ERRORS.APPLICABILITY_NOT_APPROVED };
  }
  if (!APPLICABLE_RECOMMENDATIONS.has(String(assessment.recommendation))) {
    return { ok: false, code: OBLIGATION_CHAIN_ERRORS.PUBLICATION_NOT_APPLICABLE };
  }
  return { ok: true };
}

/**
 * Why an accepted UC-RI-005 candidate cannot become a DRAFT obligation (null = materialisable).
 * @param {{ citation?: { citation_status?: string } | null, statement?: string | null, changeId?: string | null, changeInOrg?: boolean }} p
 */
export function obligationCandidateSkipReason(p) {
  if (!p.citation) return OBLIGATION_SKIP_REASONS.NO_CITATION;
  if (p.citation.citation_status !== 'VERIFIED' && p.citation.citation_status !== 'PARTIAL') {
    return OBLIGATION_SKIP_REASONS.CITATION_NOT_VERIFIED;
  }
  if (!p.statement) return OBLIGATION_SKIP_REASONS.NO_STATEMENT;
  if (!p.changeId) return OBLIGATION_SKIP_REASONS.NO_PARENT_CHANGE;
  if (p.changeInOrg === false) return OBLIGATION_SKIP_REASONS.PARENT_CHANGE_NOT_IN_ORG;
  return null;
}
