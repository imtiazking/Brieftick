/**
 * Canonical URL normalisation — do not collapse distinct documents.
 */
const TRACKING_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'gclid',
  'fbclid',
]);

export function normalizeCanonicalUrl(input, baseUrl = null) {
  if (!input || typeof input !== 'string') return '';
  let href = input.trim();
  try {
    const url = new URL(href, baseUrl || undefined);
    if (!['http:', 'https:'].includes(url.protocol)) return href;
    url.hash = '';
    TRACKING_PARAMS.forEach((p) => url.searchParams.delete(p));
    if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
      url.pathname = url.pathname.replace(/\/+$/, '');
    }
    url.hostname = url.hostname.toLowerCase();
    return url.toString();
  } catch {
    return href;
  }
}

export function urlsEquivalent(a, b, baseUrl = null) {
  const na = normalizeCanonicalUrl(a, baseUrl);
  const nb = normalizeCanonicalUrl(b, baseUrl);
  return na && nb && na === nb;
}
