/** Deterministic financial-services relevance (no AI). */

const KEYWORDS = [
  'financial',
  'bank',
  'payment',
  'pension',
  'insurance',
  'credit',
  'money',
  'investment',
  'mortgage',
  'fca',
  'pra',
  'consumer',
  'electronic money',
  'crypto',
  'sanction',
];

export function assessLegislationRelevance(item) {
  const title = (item.title || '').toLowerCase();
  const matched = KEYWORDS.filter((k) => title.includes(k));
  if (!matched.length) {
    return { relevanceStatus: 'NOT_RELEVANT', relevanceReason: 'No configured financial-services keyword match', matchedSignals: [] };
  }
  return {
    relevanceStatus: 'POTENTIALLY_RELEVANT',
    relevanceReason: 'Mapped by configuration (keyword match — not legal applicability)',
    matchedSignals: matched,
  };
}

export function isLegislationHost(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && /^(www\.)?legislation\.gov\.uk$/i.test(u.hostname);
  } catch {
    return false;
  }
}
