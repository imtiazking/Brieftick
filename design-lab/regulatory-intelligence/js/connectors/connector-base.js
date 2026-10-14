/**
 * Canonical discovery item shape + shared connector utilities.
 */
import { normalizeCanonicalUrl } from './url-normalize.js';
import { normalizePublicationType } from './publication-types.js';

export const CONNECTOR_MODES = {
  FIXTURE: 'fixture',
  LIVE_VERIFICATION: 'live-verification',
  PRODUCTION: 'production',
};

export function toDiscoveryItem(input, defaults = {}) {
  const canonicalUrl = normalizeCanonicalUrl(input.canonicalUrl || input.link || '', defaults.baseUrl);
  return {
    externalSourceId: input.externalSourceId || input.guid || canonicalUrl,
    regulatorSourceId: defaults.regulatorSourceId || defaults.sourceId,
    canonicalUrl,
    title: (input.title || '').trim(),
    reference: extractReference(input.reference, input.title),
    publicationType: normalizePublicationType(input.publicationType || input.type),
    publishedAt: input.publishedAt || null,
    discoveredAt: input.discoveredAt || new Date().toISOString(),
    documentUrls: input.documentUrls || (canonicalUrl ? [canonicalUrl] : []),
    summary: input.summary || '',
    jurisdiction: defaults.jurisdiction || 'United Kingdom',
    discoveryMethod: input.discoveryMethod || 'unknown',
    sourceMetadata: input.sourceMetadata || {},
    relevanceStatus: input.relevanceStatus || null,
    relevanceReason: input.relevanceReason || null,
    matchedSignals: input.matchedSignals || [],
    dataOrigin: defaults.dataOrigin || 'fixture',
    sourceTrust: defaults.sourceTrust || 'Official Regulator',
  };
}

function extractReference(ref, title) {
  if (ref) return ref.trim();
  const m = (title || '').match(/\b(PS|CP|FG|SS|DP)\s*(\d+\/\d+)\b/i);
  return m ? `${m[1].toUpperCase()}${m[2]}` : '';
}

export function defaultCapabilities(partial = {}) {
  return {
    discovery: true,
    metadata: true,
    htmlRetrieval: true,
    pdfRetrieval: false,
    incrementalCheckpoint: true,
    documentVersionDetection: true,
    ...partial,
  };
}
