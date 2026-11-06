/** Official The Pensions Regulator endpoints (verified from robots.txt / sitemap). */

export const TPR_CONNECTOR_VERSION = 'TPR-SITEMAP-HTML-1.0';
export const TPR_AUTHORITY = 'The Pensions Regulator';
export const TPR_SHORT = 'TPR';
export const TPR_USER_AGENT = 'FORGENIQ-Regulatory-Intelligence-Design-Lab/1.0';
export const TPR_BASE = 'https://www.thepensionsregulator.gov.uk';
export const TPR_ROBOTS = `${TPR_BASE}/robots.txt`;
export const TPR_SITEMAP = `${TPR_BASE}/sitemap.xml`;
export const TPR_DOCUMENT_LIBRARY = `${TPR_BASE}/document-library`;

export const TPR_ALLOWED_HOSTS = ['www.thepensionsregulator.gov.uk', 'thepensionsregulator.gov.uk'];

/** Approved sitemap path prefixes (regulatory content only). */
export const TPR_SITEMAP_PREFIXES = [
  '/document-library/code-of-practice/',
  '/document-library/code-of-practice',
  '/document-library/scheme-management-detailed-guidance/',
  '/document-library/automatic-enrolment-detailed-guidance/',
  '/document-library/consultations/',
  '/document-library/statements/',
  '/document-library/regulatory-and-enforcement-policies/',
  '/document-library/enforcement-activity/',
];

export const TPR_DOCUMENT_TYPES = {
  TPR_CODE: 'TPR_CODE',
  TPR_GUIDANCE: 'TPR_GUIDANCE',
  TPR_CONSULTATION: 'TPR_CONSULTATION',
  TPR_CONSULTATION_RESPONSE: 'TPR_CONSULTATION_RESPONSE',
  TPR_STATEMENT: 'TPR_STATEMENT',
  TPR_POLICY: 'TPR_POLICY',
  TPR_ENFORCEMENT_PUBLICATION: 'TPR_ENFORCEMENT_PUBLICATION',
  TPR_REGULATORY_REPORT: 'TPR_REGULATORY_REPORT',
  TPR_NEWS_SUPPORTING: 'TPR_NEWS_SUPPORTING',
  TPR_OTHER_REGULATORY: 'TPR_OTHER_REGULATORY',
};

export const LEGAL_SOURCE_TYPES = {
  REGULATOR_CODE: 'REGULATOR_CODE',
  REGULATOR_GUIDANCE: 'REGULATOR_GUIDANCE',
  REGULATOR_POLICY: 'REGULATOR_POLICY',
  REGULATOR_STATEMENT: 'REGULATOR_STATEMENT',
  CONSULTATION: 'CONSULTATION',
  ENFORCEMENT_OUTPUT: 'ENFORCEMENT_OUTPUT',
};

/** Live verification targets (paths verified in sitemap). */
export const TPR_VERIFICATION_TARGETS = [
  {
    id: 'TPR-TGT-CODE-INDEX',
    path: '/document-library/code-of-practice',
    documentType: 'TPR_CODE',
    legalSourceType: 'REGULATOR_CODE',
    title: 'Code of practice',
  },
  {
    id: 'TPR-TGT-CODE-MODULE',
    path: '/document-library/code-of-practice/the-governing-body/board-structure-and-activities/role-of-the-governing-body',
    documentType: 'TPR_CODE',
    legalSourceType: 'REGULATOR_CODE',
    title: 'Role of the governing body',
    codeSection: 'The governing body — board structure and activities',
  },
  {
    id: 'TPR-TGT-GUIDANCE',
    path: '/document-library/scheme-management-detailed-guidance/administration-detailed-guidance/administration-guide-for-pension-schemes',
    documentType: 'TPR_GUIDANCE',
    legalSourceType: 'REGULATOR_GUIDANCE',
    title: 'Administration guide for pension schemes',
  },
  {
    id: 'TPR-TGT-CONSULTATION',
    path: '/document-library/consultations/statement-of-strategy-consultation',
    documentType: 'TPR_CONSULTATION',
    legalSourceType: 'CONSULTATION',
    title: 'Statement of strategy consultation',
  },
  {
    id: 'TPR-TGT-POLICY',
    path: '/document-library/regulatory-and-enforcement-policies/automatic-enrolment-compliance-and-enforcement',
    documentType: 'TPR_POLICY',
    legalSourceType: 'REGULATOR_POLICY',
    title: 'Automatic enrolment compliance and enforcement',
  },
];

export function tprCanonicalUrl(path) {
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${TPR_BASE}${p}`;
}

export function classifyTprPath(path) {
  const p = path.toLowerCase();
  if (p.includes('/code-of-practice')) return { documentType: 'TPR_CODE', legalSourceType: 'REGULATOR_CODE' };
  if (p.includes('/scheme-management') || p.includes('/automatic-enrolment-detailed-guidance'))
    return { documentType: 'TPR_GUIDANCE', legalSourceType: 'REGULATOR_GUIDANCE' };
  if (p.includes('/consultations')) return { documentType: 'TPR_CONSULTATION', legalSourceType: 'CONSULTATION' };
  if (p.includes('/statements')) return { documentType: 'TPR_STATEMENT', legalSourceType: 'REGULATOR_STATEMENT' };
  if (p.includes('/regulatory-and-enforcement-policies'))
    return { documentType: 'TPR_POLICY', legalSourceType: 'REGULATOR_POLICY' };
  if (p.includes('/enforcement-activity'))
    return { documentType: 'TPR_ENFORCEMENT_PUBLICATION', legalSourceType: 'ENFORCEMENT_OUTPUT' };
  return { documentType: 'TPR_OTHER_REGULATORY', legalSourceType: 'REGULATOR_GUIDANCE' };
}
