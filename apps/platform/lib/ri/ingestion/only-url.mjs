import {
  assertValidOnlyCanonicalUrl,
  selectPublicationsByOnlyUrl,
  ONLY_URL_ERROR,
} from '../../../../../integrations/regulatory-sources/core/only-canonical-url.mjs';

export { ONLY_URL_ERROR, assertValidOnlyCanonicalUrl, normalizeCanonicalPublicationUrl } from '../../../../../integrations/regulatory-sources/core/only-canonical-url.mjs';

/**
 * Restrict normalised documents to exactly one canonical URL (throws on failure).
 * @param {object[]} documents
 * @param {string} onlyUrl
 */
export function applyOnlyUrlDocumentSelection(documents, onlyUrl) {
  const selected = selectPublicationsByOnlyUrl(documents, onlyUrl);
  if (!selected.ok) {
    throw new Error(selected.code);
  }
  return selected.publications;
}

/**
 * @param {string | null | undefined} onlyUrl
 * @param {object[]} documents
 */
export function finalizeOnlyUrlDocuments(onlyUrl, documents) {
  if (!onlyUrl) return documents;
  return applyOnlyUrlDocumentSelection(documents, onlyUrl);
}
