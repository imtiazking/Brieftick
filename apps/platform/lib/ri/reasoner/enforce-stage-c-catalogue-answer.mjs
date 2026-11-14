import { resolveFinalRegulatoryStatus } from './evidence-sufficiency-policy.mjs';

/**
 * Apply Stage C policy to production catalogue Ask RI answers (deterministic path).
 */
export function enforceStageCCatalogueAnswer(result) {
  if (!result || typeof result !== 'object') return result;
  const exec = result.execution || {};
  const mustNotBind = exec.mustNotPresentAsBindingObligation === true;
  const citationCount = Array.isArray(result.citations) ? result.citations.length : 0;
  const hasUnresolved = Boolean(exec.humanReviewStatus && exec.humanReviewStatus !== 'NOT_REQUIRED');

  const sufficiency =
    result.status === 'INSUFFICIENT_EVIDENCE' || citationCount === 0
      ? 'NO_SUPPORT'
      : citationCount > 0 && mustNotBind
        ? 'PARTIAL_SUPPORT'
        : 'DIRECT_SUPPORT';

  const policy = resolveFinalRegulatoryStatus({
    responseState: result.status === 'ANSWERED' ? 'ANSWERED' : 'INSUFFICIENT_EVIDENCE',
    sufficiencyOverall: sufficiency,
    verifiedClaimCount: citationCount > 0 ? 1 : 0,
    unresolvedAspects: hasUnresolved ? ['catalogue_human_review'] : [],
    questionCoverage: citationCount > 0 ? 'KNOWN' : 'UNKNOWN',
    regulatoryIndexAbsent: false,
  });

  let status = policy.status;
  if (mustNotBind && status === 'ANSWERED' && result.status === 'ANSWERED') {
    status = 'PARTIAL_ANSWER';
  }
  if (result.status === 'UNRESOLVED' || result.status === 'FAILED') {
    status = result.status;
  }

  return {
    ...result,
    status,
    stageC: {
      applied: true,
      policyReason: policy.reason,
      regulatoryReview: policy.regulatoryReview,
      mustNotPresentAsBindingObligation: mustNotBind,
    },
  };
}