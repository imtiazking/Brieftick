/**
 * Exact canonical URL selection for controlled single-publication ingestion.
 */

const ONLY_URL_ERROR = {
  INVALID: 'only_url_invalid',
  NOT_FOUND: 'only_url_not_found',
  AMBIGUOUS: 'only_url_ambiguous',
};

/**
 * Normalise publication URLs for exact matching (no silent trailing-slash drift).
 * @param {string} url
 */
export function normalizeCanonicalPublicationUrl(url) {
  if (typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (!trimmed) return '';
  try {
    const u = new URL(trimmed);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return '';
    u.hash = '';
    let path = u.pathname;
    if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
    u.pathname = path;
    u.search = '';
    return u.toString();
  } catch {
    return '';
  }
}

/**
 * @param {string} url
 * @returns {{ ok: true, normalized: string } | { ok: false, code: string }}
 */
export function assertValidOnlyCanonicalUrl(url) {
  const normalized = normalizeCanonicalPublicationUrl(url);
  if (!normalized) {
    return { ok: false, code: ONLY_URL_ERROR.INVALID };
  }
  return { ok: true, normalized };
}

/**
 * @param {Array<{ link?: string, canonicalUrl?: string }>} entries
 * @param {string} onlyUrl
 */
export function selectFeedEntriesByOnlyUrl(entries, onlyUrl) {
  const gate = assertValidOnlyCanonicalUrl(onlyUrl);
  if (!gate.ok) return { ok: false, code: gate.code, entries: [] };

  const target = gate.normalized;
  const matches = (entries || []).filter((entry) => {
    const candidate = entry.link ?? entry.canonicalUrl ?? '';
    return normalizeCanonicalPublicationUrl(candidate) === target;
  });

  if (matches.length === 0) {
    return { ok: false, code: ONLY_URL_ERROR.NOT_FOUND, entries: [] };
  }
  if (matches.length > 1) {
    return { ok: false, code: ONLY_URL_ERROR.AMBIGUOUS, entries: [] };
  }
  return { ok: true, code: null, entries: [matches[0]] };
}

/**
 * @param {Array<{ canonicalUrl?: string }>} publications
 * @param {string} onlyUrl
 */
export function selectPublicationsByOnlyUrl(publications, onlyUrl) {
  const gate = assertValidOnlyCanonicalUrl(onlyUrl);
  if (!gate.ok) return { ok: false, code: gate.code, publications: [] };

  const target = gate.normalized;
  const matches = (publications || []).filter((pub) => {
    return normalizeCanonicalPublicationUrl(pub.canonicalUrl ?? '') === target;
  });

  if (matches.length === 0) {
    return { ok: false, code: ONLY_URL_ERROR.NOT_FOUND, publications: [] };
  }
  if (matches.length > 1) {
    return { ok: false, code: ONLY_URL_ERROR.AMBIGUOUS, publications: [] };
  }
  return { ok: true, code: null, publications: [matches[0]] };
}

export { ONLY_URL_ERROR };
