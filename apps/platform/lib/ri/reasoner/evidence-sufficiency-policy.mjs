/**
 * Stage C — deterministic post-verification regulatory response policy (Phase 2C.2 design).
 * Applies after claim verification; does not invent unresolved aspects.
 */

/**
 * @param {{
 *   responseState?: string,
 *   sufficiencyOverall?: string,
 *   verifiedClaimCount?: number,
 *   failedClaimCount?: number,
 *   unresolvedAspects?: string[],
 *   questionCoverage?: 'KNOWN' | 'UNKNOWN',
 *   regulatoryIndexAbsent?: boolean,
 *   requiredHandbookModuleAbsent?: boolean,
 * }} input
 */
export function resolveFinalRegulatoryStatus(input) {
  const {
    responseState,
    sufficiencyOverall,
    verifiedClaimCount = 0,
    unresolvedAspects = [],
    questionCoverage = 'UNKNOWN',
    regulatoryIndexAbsent = false,
    requiredHandbookModuleAbsent = false,
  } = input;

  const reviewHold = { regulatoryReview: { required: true, holdPresentation: true } };

  if (regulatoryIndexAbsent) {
    return {
      status: 'INSUFFICIENT_EVIDENCE',
      ...reviewHold,
      reason: 'REGULATORY_INDEX_ABSENT',
    };
  }

  if (requiredHandbookModuleAbsent) {
    return {
      status: 'INSUFFICIENT_EVIDENCE',
      ...reviewHold,
      reason: 'REQUIRED_HANDBOOK_SOURCE_ABSENT',
    };
  }

  const hasSupported = verifiedClaimCount > 0;
  const hasUnresolved = unresolvedAspects.length > 0;

  if (responseState === 'INSUFFICIENT_EVIDENCE' || sufficiencyOverall === 'NO_SUPPORT') {
    return { status: 'INSUFFICIENT_EVIDENCE', ...reviewHold, reason: 'NO_SUPPORT' };
  }

  if (sufficiencyOverall === 'RELATED_CONTEXT_ONLY') {
    return { status: 'INSUFFICIENT_EVIDENCE', ...reviewHold, reason: 'RELATED_ONLY' };
  }

  if (questionCoverage === 'UNKNOWN') {
    if (!hasSupported && !hasUnresolved) {
      return { status: 'INSUFFICIENT_EVIDENCE', ...reviewHold, reason: 'UNKNOWN_COVERAGE_UNVERIFIED' };
    }
    if (hasSupported && hasUnresolved) {
      return { status: 'PARTIAL_ANSWER', ...reviewHold, reason: 'PARTIAL_UNKNOWN_COVERAGE' };
    }
    if (hasSupported && !hasUnresolved) {
      return { status: 'INSUFFICIENT_EVIDENCE', ...reviewHold, reason: 'UNKNOWN_COVERAGE_NO_INVENTED_GAPS' };
    }
  }

  if (hasSupported && hasUnresolved) {
    return { status: 'PARTIAL_ANSWER', regulatoryReview: { required: true, holdPresentation: false }, reason: 'PARTIAL' };
  }

  if (hasSupported && sufficiencyOverall === 'PARTIAL_SUPPORT') {
    return {
      status: 'PARTIAL_ANSWER',
      regulatoryReview: { required: true, holdPresentation: false },
      reason: 'PARTIAL_SUPPORT',
    };
  }

  if (hasSupported && !hasUnresolved && sufficiencyOverall === 'DIRECT_SUPPORT') {
    return { status: 'ANSWERED', regulatoryReview: { required: false, holdPresentation: false }, reason: 'ANSWERED' };
  }

  if (responseState === 'PARTIAL_ANSWER') {
    return { status: 'PARTIAL_ANSWER', ...reviewHold, reason: 'MODEL_PARTIAL' };
  }

  return { status: 'INSUFFICIENT_EVIDENCE', ...reviewHold, reason: 'DEFAULT_FAIL_CLOSED' };
}