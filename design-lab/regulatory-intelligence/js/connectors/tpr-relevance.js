/** Deterministic TPR relevance (no AI). */

const TERMS = ['pension', 'scheme', 'trustee', 'governance', 'funding', 'enrolment', 'contribution', 'member', 'code'];

export function assessTprRelevance(item) {
  const title = (item.title || '').toLowerCase();
  const path = (item.path || '').toLowerCase();
  const matched = TERMS.filter((t) => title.includes(t) || path.includes(t));
  if (item.documentType === 'TPR_CODE' || path.includes('code-of-practice')) {
    return {
      relevanceStatus: 'MAPPED_BY_CONFIGURATION',
      relevanceReason: 'Official TPR Code path — mapped to Pension Providers (not legal applicability)',
      matchedSignals: ['code-of-practice'],
    };
  }
  if (!matched.length) {
    return { relevanceStatus: 'REVIEW_REQUIRED', relevanceReason: 'Human review required', matchedSignals: [] };
  }
  return {
    relevanceStatus: 'POTENTIALLY_RELEVANT',
    relevanceReason: 'Mapped by configuration (keyword — not legal applicability)',
    matchedSignals: matched,
  };
}
