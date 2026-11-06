/** Official BIS / BCBS Basel Framework endpoints (verified paths). */

export const BASEL_CONNECTOR_VERSION = 'BASEL-BCBS-HTML-1.0';
export const BASEL_AUTHORITY = 'Basel Committee on Banking Supervision';
export const BASEL_ORGANISATION = 'Bank for International Settlements';
export const BASEL_SHORT = 'BCBS';
export const BASEL_USER_AGENT = 'FORGENIQ-Regulatory-Intelligence-Design-Lab/1.0';
export const BIS_BASE = 'https://www.bis.org';
export const BASEL_FRAMEWORK_ROOT = `${BIS_BASE}/committees/bcbs/basel-framework`;
export const BCBS_PUBLICATIONS = `${BIS_BASE}/committees/bcbs/publications`;

export const BIS_ALLOWED_HOSTS = ['www.bis.org', 'bis.org'];

/** Bounded path prefixes for BCBS / Basel retrieval. */
export const BASEL_PATH_PREFIXES = [
  '/committees/bcbs/',
  '/basel_framework/',
];

/** Publications under /publications/ must match these substrings (prudential BCBS). */
export const BASEL_PUBLICATION_KEYWORDS = ['basel', 'bcbs', 'standards-minimum', 'standards-basel', 'implementation-reports-rcap'];

export const BASEL_DOCUMENT_TYPES = {
  INTERNATIONAL_STANDARD: 'INTERNATIONAL_STANDARD',
  INTERNATIONAL_GUIDELINE: 'INTERNATIONAL_GUIDELINE',
  CONSULTATIVE_DOCUMENT: 'CONSULTATIVE_DOCUMENT',
  FINAL_STANDARD: 'FINAL_STANDARD',
  IMPLEMENTATION_REPORT: 'IMPLEMENTATION_REPORT',
  MONITORING_REPORT: 'MONITORING_REPORT',
  FAQ: 'FAQ',
  SUPERVISORY_GUIDELINE: 'SUPERVISORY_GUIDELINE',
  SOUND_PRACTICE: 'SOUND_PRACTICE',
  BCBS_PUBLICATION: 'BCBS_PUBLICATION',
};

export const BASEL_SOURCE_LAYER = 'INTERNATIONAL_PRUDENTIAL_STANDARD';

export const BASEL_VERIFICATION_TARGETS = [
  {
    id: 'BAS-TGT-FW-ROOT',
    path: '/committees/bcbs/basel-framework',
    documentType: 'INTERNATIONAL_STANDARD',
    frameworkModule: null,
    title: 'Basel Framework',
    officialReference: 'Basel Framework',
  },
  {
    id: 'BAS-TGT-CAP',
    path: '/committees/bcbs/basel-framework/standard/cap',
    documentType: 'INTERNATIONAL_STANDARD',
    frameworkModule: 'CAP',
    title: 'Definition of capital',
    officialReference: 'CAP',
  },
  {
    id: 'BAS-TGT-CRE',
    path: '/committees/bcbs/basel-framework/standard/cre',
    documentType: 'INTERNATIONAL_STANDARD',
    frameworkModule: 'CRE',
    title: 'Credit risk',
    officialReference: 'CRE',
  },
  {
    id: 'BAS-TGT-OPE',
    path: '/committees/bcbs/basel-framework/standard/ope',
    documentType: 'INTERNATIONAL_STANDARD',
    frameworkModule: 'OPE',
    title: 'Operational risk',
    officialReference: 'OPE',
  },
  {
    id: 'BAS-TGT-SRP',
    path: '/committees/bcbs/basel-framework/standard/srp',
    documentType: 'INTERNATIONAL_STANDARD',
    frameworkModule: 'SRP',
    title: 'Supervisory review process',
    officialReference: 'SRP',
  },
  {
    id: 'BAS-TGT-DIS',
    path: '/committees/bcbs/basel-framework/standard/dis',
    documentType: 'INTERNATIONAL_STANDARD',
    frameworkModule: 'DIS',
    title: 'Disclosure requirements',
    officialReference: 'DIS',
  },
  {
    id: 'BAS-TGT-PUBL-INDEX',
    path: '/committees/bcbs/publications',
    documentType: 'BCBS_PUBLICATION',
    frameworkModule: null,
    title: 'BCBS publications',
    officialReference: 'BCBS publications index',
  },
  {
    id: 'BAS-TGT-PUBL-001',
    path: '/publications/201712-standards-basel-iii-finalising-post-crisis-reforms',
    documentType: 'FINAL_STANDARD',
    frameworkModule: null,
    title: 'Basel III: Finalising post-crisis reforms',
    officialReference: 'd424',
  },
];

export function bisCanonicalUrl(path) {
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${BIS_BASE}${p}`;
}

export function isBaselPathAllowed(pathname) {
  const p = (pathname || '').toLowerCase();
  if (BASEL_PATH_PREFIXES.some((prefix) => p.startsWith(prefix.toLowerCase()))) return true;
  if (p.startsWith('/publications/')) {
    return BASEL_PUBLICATION_KEYWORDS.some((kw) => p.includes(kw));
  }
  return false;
}

export function classifyBaselPath(path) {
  const p = path.toLowerCase();
  if (p.includes('/basel-framework/standard/')) {
    return { documentType: 'INTERNATIONAL_STANDARD', sourceLayer: BASEL_SOURCE_LAYER };
  }
  if (p.includes('/publications/') && p.includes('consultation')) {
    return { documentType: 'CONSULTATIVE_DOCUMENT', sourceLayer: BASEL_SOURCE_LAYER };
  }
  if (p.includes('/publications/') && (p.includes('implementation-report') || p.includes('rcap'))) {
    return { documentType: 'IMPLEMENTATION_REPORT', sourceLayer: BASEL_SOURCE_LAYER };
  }
  if (p.includes('/publications/') && p.includes('monitoring')) {
    return { documentType: 'MONITORING_REPORT', sourceLayer: BASEL_SOURCE_LAYER };
  }
  if (p.includes('/publications/') && p.includes('standards-')) {
    return { documentType: 'FINAL_STANDARD', sourceLayer: BASEL_SOURCE_LAYER };
  }
  if (p.includes('/committees/bcbs/publications')) {
    return { documentType: 'BCBS_PUBLICATION', sourceLayer: BASEL_SOURCE_LAYER };
  }
  return { documentType: 'BCBS_PUBLICATION', sourceLayer: BASEL_SOURCE_LAYER };
}
