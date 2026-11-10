/**
 * Approved regulatory primary PDF retrieval (one-off / controlled ingest — not scheduled FCA RSS).
 */
export const FCA_PUBLICATIONS_RSS_SOURCE_KEY = 'SRC-FCA-PUBLICATIONS-RSS';

/** @type {Record<string, { allowedHosts: string[], pathPatterns: RegExp[] }>} */
export const APPROVED_PRIMARY_PDF_SOURCES = {
  [FCA_PUBLICATIONS_RSS_SOURCE_KEY]: {
    allowedHosts: ['www.fca.org.uk', 'fca.org.uk'],
    pathPatterns: [/^\/publication\//i, /^\/publications\//i],
  },
};

export const CP26_38_PRIMARY_PDF_URL =
  'https://www.fca.org.uk/publication/consultation/cp26-38.pdf';

/** FG22/5 — Consumer Duty finalised guidance (distinct catalogue publication; BUS-UAT-018 PDF path). */
export const FG22_5_PRIMARY_PDF_URL =
  'https://www.fca.org.uk/publication/finalised-guidance/fg22-5.pdf';

/**
 * @param {string} sourceExternalKey
 * @param {string} urlString
 */
export function assertApprovedPrimaryPdfUrl(sourceExternalKey, urlString) {
  const policy = APPROVED_PRIMARY_PDF_SOURCES[sourceExternalKey];
  if (!policy) {
    return { ok: false, code: 'SOURCE_NOT_APPROVED', message: `Primary PDF ingest not approved for ${sourceExternalKey}` };
  }
  let url;
  try {
    url = new URL(urlString);
  } catch {
    return { ok: false, code: 'INVALID_URL', message: 'Invalid URL' };
  }
  if (url.protocol !== 'https:') {
    return { ok: false, code: 'HTTPS_REQUIRED', message: 'HTTPS required' };
  }
  const host = url.hostname.toLowerCase();
  const hostOk = policy.allowedHosts.some((h) => host === h || host.endsWith(`.${h}`));
  if (!hostOk) {
    return { ok: false, code: 'HOST_NOT_ALLOWED', message: `Host not allowlisted: ${host}` };
  }
  const pathOk = policy.pathPatterns.some((re) => re.test(url.pathname));
  if (!pathOk) {
    return { ok: false, code: 'PATH_NOT_ALLOWED', message: `Path not allowlisted: ${url.pathname}` };
  }
  return { ok: true, url: url.toString() };
}
