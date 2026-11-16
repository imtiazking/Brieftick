/**
 * Deterministic evidence limitation / abstention diagnostics (fail-closed).
 * Codes align with programme taxonomy — do not duplicate policy reason strings lightly.
 */
import { requiredHandbookModulesUnmapped } from './assess-evidence-question-coverage.mjs';

/** @typedef {'REQUIRED_SOURCE_NOT_INDEXED' | 'REQUIRED_SOURCE_NOT_RETRIEVED' | 'EVIDENCE_CONTEXT_TRUNCATED' | 'PARTIAL_EVIDENCE_CONFIRMED' | 'COVERAGE_UNCONFIRMED'} EvidenceLimitationCode */

/**
 * @param {{
 *   coverageAssessment?: object,
 *   retrieval?: object,
 *   bundle?: object,
 *   policyReason?: string,
 *   verifiedClaimCount?: number,
 *   unresolvedAspects?: string[],
 *   questionCoverage?: string,
 * }} input
 * @returns {{ code: EvidenceLimitationCode, detail: string, policyReasonAlias?: string }}
 */
export function deriveEvidenceLimitationDiagnostic(input) {
  const {
    coverageAssessment,
    retrieval,
    bundle,
    policyReason,
    verifiedClaimCount = 0,
    unresolvedAspects = [],
    questionCoverage = coverageAssessment?.questionCoverage || bundle?.questionCoverage || 'UNKNOWN',
  } = input;

  const reasons = coverageAssessment?.reasons || [];
  const refBlocked = retrieval?.referenceValidation?.blockSemanticSelection;
  const noRanked = !(retrieval?.allRankedChunks || []).length;
  const handbookUnmapped = requiredHandbookModulesUnmapped(coverageAssessment);

  if (refBlocked || noRanked || handbookUnmapped || reasons.some((r) => String(r).startsWith('source_absent'))) {
    return {
      code: 'REQUIRED_SOURCE_NOT_INDEXED',
      detail: handbookUnmapped
        ? 'required_handbook_module_not_in_authorised_corpus'
        : refBlocked
          ? 'reference_not_in_catalogue'
          : noRanked
            ? 'no_retrieval_match'
            : 'source_absent',
      policyReasonAlias: policyReason === 'REQUIRED_HANDBOOK_SOURCE_ABSENT' ? policyReason : undefined,
    };
  }

  const hasSupported = verifiedClaimCount > 0;
  const hasUnresolved = unresolvedAspects.length > 0;
  const excluded = bundle?.excludedChunks?.length ?? 0;
  const truncated = Boolean(bundle?.contextLimitationNote);

  if (
    hasSupported &&
    hasUnresolved &&
    questionCoverage === 'KNOWN' &&
    !handbookUnmapped
  ) {
    const anc = truncated || excluded > 0 ? 'with_context_budget_exclusion' : 'verified_claims_with_disclosed_gaps';
    return { code: 'PARTIAL_EVIDENCE_CONFIRMED', detail: anc };
  }

  if (truncated || excluded > 0) {
    return {
      code: 'EVIDENCE_CONTEXT_TRUNCATED',
      detail: truncated ? 'context_budget_exclusion' : `excluded_chunks:${excluded}`,
    };
  }

  if (policyReason === 'REQUIRED_HANDBOOK_SOURCE_ABSENT') {
    return { code: 'REQUIRED_SOURCE_NOT_INDEXED', detail: 'stage_c_handbook_absent' };
  }

  const ranked = retrieval?.allRankedChunks || [];
  const chunksInBundle = bundle?.evidenceChunks?.length ?? 0;
  if (ranked.length > 0 && chunksInBundle === 0) {
    return { code: 'REQUIRED_SOURCE_NOT_RETRIEVED', detail: 'retrieval_without_usable_bundle' };
  }

  if (questionCoverage === 'UNKNOWN') {
    return { code: 'COVERAGE_UNCONFIRMED', detail: reasons.join(';') || 'unknown_coverage' };
  }

  if (hasSupported && hasUnresolved) {
    return { code: 'PARTIAL_EVIDENCE_CONFIRMED', detail: 'partial_with_known_coverage' };
  }

  return { code: 'COVERAGE_UNCONFIRMED', detail: 'default_unconfirmed' };
}

/**
 * Outcome buckets for engineering metrics (not regulatory accuracy).
 */
export function classifyPolicyOutcomeBucket(status, diagnosticCode) {
  if (status === 'INSUFFICIENT_EVIDENCE' && diagnosticCode === 'REQUIRED_SOURCE_NOT_INDEXED') {
    return 'correct_abstention_missing_source';
  }
  if (status === 'INSUFFICIENT_EVIDENCE') return 'abstention_other';
  if (status === 'PARTIAL_ANSWER' && diagnosticCode === 'PARTIAL_EVIDENCE_CONFIRMED') return 'correct_partial';
  if (status === 'PARTIAL_ANSWER') return 'partial_other';
  if (status === 'ANSWERED') return 'full_answer';
  return 'other';
}