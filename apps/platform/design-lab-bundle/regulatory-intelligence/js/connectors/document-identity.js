/**
 * Regulatory document identity (distinct from content hash).
 * Priority: official reference → canonical URL → external ID → composite.
 */
import { normalizeCanonicalUrl } from './url-normalize.js';

export function buildDocumentIdentity({
  sourceId,
  regulatorSourceId,
  reference,
  canonicalUrl,
  externalSourceId,
  publicationType,
}) {
  const ref = (reference || '').trim().toUpperCase();
  const url = normalizeCanonicalUrl(canonicalUrl || '');
  const ext = (externalSourceId || '').trim();
  if (ref) return { key: `ref:${sourceId}|${ref}`, method: 'official_reference', reference: ref };
  if (url) return { key: `url:${sourceId}|${url}`, method: 'canonical_url', canonicalUrl: url };
  if (ext) return { key: `ext:${sourceId}|${ext}`, method: 'external_id', externalSourceId: ext };
  const composite = [sourceId, publicationType || '', ref, url, ext].join('|');
  return { key: `composite:${composite}`, method: 'composite' };
}

export function documentIdentityKeyFromParts(parts) {
  return buildDocumentIdentity(parts).key;
}
