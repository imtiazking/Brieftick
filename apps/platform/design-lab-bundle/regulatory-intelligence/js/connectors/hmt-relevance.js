/**
 * Deterministic HM Treasury financial-services / regulatory-policy relevance (no AI).
 */

const INCLUDE_SIGNALS = [
  'financial services',
  'financial service',
  'financial regulation',
  'financial-services',
  'banking',
  'banks',
  'bank ',
  'fca',
  'pra',
  'bank of england',
  'payment services',
  'payments',
  'capital markets',
  'wholesale markets',
  'consumer finance',
  'insurance',
  'pensions',
  'asset management',
  'investment',
  'fintech',
  'digital assets',
  'cryptoasset',
  'crypto-asset',
  'financial crime',
  'money laundering',
  'aml',
  'sanctions',
  'ofsi',
  'prudential',
  'financial stability',
  'resolution',
  'deposit protection',
  'regulatory reform',
  'future regulatory framework',
  'legislative framework',
  'financial services and markets',
  'fsma',
];

const EXCLUDE_SIGNALS = [
  'procurement',
  'vacancy',
  'job advert',
  'staffing',
  'pay award',
  'civil service',
  'ministerial appointment',
  'garden party',
  'annual report and accounts',
  'transparency data',
  'spending review',
  'generic press release',
  'customs tariff',
  'import duty rates',
];

const TYPE_PRIORITY = {
  'Consultation Paper': 1,
  'Consultation Outcome': 2,
  'Policy Paper': 3,
  Guidance: 4,
  'Policy Statement': 5,
  Publication: 6,
  'News / Announcement': 8,
  Other: 9,
};

export function inferHmtPublicationType(title, link) {
  const path = (link || '').toLowerCase();
  const t = `${title || ''}`.toLowerCase();
  if (path.includes('/consultations/') || t.includes('consultation')) return 'Consultation Paper';
  if (path.includes('/consultation-outcomes/') || t.includes('consultation outcome') || t.includes('government response')) {
    return 'Consultation Outcome';
  }
  if (path.includes('/policy-papers/') || t.includes('policy paper')) return 'Policy Paper';
  if (path.includes('/guidance/') || t.includes('guidance')) return 'Guidance';
  if (path.includes('/news/')) return 'News / Announcement';
  return 'Publication';
}

function signalMatches(blob, signal) {
  const s = signal.toLowerCase();
  if (s.length <= 4) {
    return new RegExp(`\\b${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(blob);
  }
  return blob.includes(s);
}

export function classifyHmtRelevance(item) {
  const blob = `${item.title || ''} ${item.summary || ''} ${item.link || ''}`.toLowerCase();
  if (blob.includes('customs tariff') || blob.includes('import duty rates')) {
    return {
      relevanceStatus: 'Excluded',
      relevanceReason: 'Trade/customs material — outside financial-services horizon scope',
      matchedSignals: [],
      relevant: false,
    };
  }
  const matchedSignals = INCLUDE_SIGNALS.filter((s) => signalMatches(blob, s));
  const excluded = EXCLUDE_SIGNALS.some((s) => blob.includes(s));
  if (excluded && matchedSignals.length === 0) {
    return {
      relevanceStatus: 'Excluded',
      relevanceReason: 'Outside financial-services horizon scope',
      matchedSignals: [],
      relevant: false,
    };
  }
  if (matchedSignals.length === 0) {
    return {
      relevanceStatus: 'Not Relevant',
      relevanceReason: 'No financial-services regulatory signals',
      matchedSignals: [],
      relevant: false,
    };
  }
  const reason =
    matchedSignals.some((s) => s.includes('consult') || s.includes('regulation') || s.includes('financial'))
      ? 'Financial Services Policy'
      : 'Financial Services Horizon Signal';
  return {
    relevanceStatus: 'Relevant',
    relevanceReason: reason,
    matchedSignals: [...new Set(matchedSignals)].slice(0, 8),
    relevant: true,
  };
}

export function isOfficialHmtGovUkUrl(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    if (host !== 'www.gov.uk' && host !== 'gov.uk') return false;
    const p = u.pathname.toLowerCase();
    return p.includes('/government/') && (p.includes('hm-treasury') || p.includes('/publications/'));
  } catch {
    return false;
  }
}

export function rankHmtDiscoveryItem(item) {
  const type = item.publicationType || inferHmtPublicationType(item.title, item.link);
  const pri = TYPE_PRIORITY[type] ?? 50;
  const date = item.publishedAt ? new Date(item.publishedAt).getTime() : 0;
  return pri * 1e12 - date;
}

export function filterAndRankHmtItems(items, limit = 3) {
  const scored = items
    .filter((i) => isOfficialHmtGovUkUrl(i.link || i.canonicalUrl))
    .map((i) => {
      const rel = classifyHmtRelevance(i);
      const publicationType = inferHmtPublicationType(i.title, i.link);
      return { ...i, publicationType, ...rel };
    })
    .filter((i) => i.relevant);
  scored.sort((a, b) => rankHmtDiscoveryItem(a) - rankHmtDiscoveryItem(b));
  return scored.slice(0, limit);
}
