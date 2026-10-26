/** @typedef {'LIVE_VERIFIED'|'LIVE_RETRIEVAL_FAILED'|'ACCESS_RESTRICTED'|'AUTH_REQUIRED'|'RATE_LIMITED'|'UNSUPPORTED_SOURCE_FORMAT'|'SOURCE_NOT_FOUND'} VerificationStatus */

export const VERIFICATION_STATUS = {
  LIVE_VERIFIED: 'LIVE_VERIFIED',
  LIVE_RETRIEVAL_FAILED: 'LIVE_RETRIEVAL_FAILED',
  ACCESS_RESTRICTED: 'ACCESS_RESTRICTED',
  AUTH_REQUIRED: 'AUTH_REQUIRED',
  RATE_LIMITED: 'RATE_LIMITED',
  UNSUPPORTED_SOURCE_FORMAT: 'UNSUPPORTED_SOURCE_FORMAT',
  SOURCE_NOT_FOUND: 'SOURCE_NOT_FOUND',
};

export const DATA_ORIGIN = 'live-verification';
export const PROVENANCE_ORIGIN = 'LIVE_VERIFICATION';

export const USER_AGENT =
  'FORGENIQ-Regulatory-Source-Integration-Lab/1.0 (+https://forgeniq.com; regulatory-source-verification)';

export const HTTP_LIMITS = {
  timeoutMs: 25_000,
  maxRedirects: 5,
  maxResponseBytes: 2 * 1024 * 1024,
  maxItemsPerSource: 3,
  /** Upper bound for manual pilot runs (e.g. FCA Phase 8B). */
  maxItemsPilotCap: 5,
  maxRequestsPerConnector: 6,
  minIntervalMs: 1500,
};

/**
 * Resolve how many feed items/documents a connector run may retrieve.
 * Default runs stay at {@link HTTP_LIMITS.maxItemsPerSource}; connectors with
 * `pilotMaxItems` honour explicit `options.maxItems` up to that pilot cap only.
 *
 * @param {{ maxItems?: number, pilotMaxItems?: number | null }} connector
 * @param {{ maxItems?: number }} [options]
 */
export function resolveConnectorItemLimit(connector, options = {}) {
  const base = connector.maxItems ?? HTTP_LIMITS.maxItemsPerSource;
  const requested = options.maxItems;
  if (requested == null || Number.isNaN(Number(requested))) {
    return base;
  }
  const n = Math.max(1, Math.floor(Number(requested)));
  const pilotCap = connector.pilotMaxItems ?? null;
  if (pilotCap != null) {
    return Math.min(n, pilotCap);
  }
  return Math.min(n, base);
}

/**
 * @param {object} partial
 * @returns {import('./contract.mjs').VerificationResult}
 */
export function buildVerificationResult(partial) {
  return {
    regulatorId: partial.regulatorId,
    sourceId: partial.sourceId,
    connectorId: partial.connectorId,
    sourceName: partial.sourceName ?? null,
    jurisdiction: partial.jurisdiction ?? null,
    officialUrl: partial.officialUrl ?? null,
    retrievalMethod: partial.retrievalMethod ?? null,
    verificationStatus: partial.verificationStatus,
    retrievedAt: partial.retrievedAt ?? new Date().toISOString(),
    httpStatus: partial.httpStatus ?? null,
    contentType: partial.contentType ?? null,
    title: partial.title ?? null,
    publishedAt: partial.publishedAt ?? null,
    sourceDocumentUrl: partial.sourceDocumentUrl ?? null,
    sourceDocumentId: partial.sourceDocumentId ?? null,
    contentHash: partial.contentHash ?? null,
    rawContentLocation: partial.rawContentLocation ?? null,
    provenance: partial.provenance ?? null,
    error: partial.error ?? null,
  };
}

/**
 * @param {object} partial
 */
export function buildNormalisedPublication(partial) {
  return {
    regulatorId: partial.regulatorId,
    sourceId: partial.sourceId,
    externalId: partial.externalId ?? null,
    title: partial.title,
    publicationType: partial.publicationType ?? 'unknown',
    publicationDate: partial.publicationDate ?? null,
    effectiveDate: partial.effectiveDate ?? null,
    canonicalUrl: partial.canonicalUrl,
    summary: partial.summary ?? null,
    contentHash: partial.contentHash,
    retrievedAt: partial.retrievedAt ?? new Date().toISOString(),
    dataOrigin: DATA_ORIGIN,
    sourcePublishedAt: partial.sourcePublishedAt ?? null,
    publicationTypeInference: partial.publicationTypeInference ?? null,
  };
}

/** Map internal status to report label */
export function toReportStatus(verificationStatus) {
  switch (verificationStatus) {
    case VERIFICATION_STATUS.LIVE_VERIFIED:
      return 'LIVE VERIFIED';
    case VERIFICATION_STATUS.ACCESS_RESTRICTED:
      return 'ACCESS RESTRICTED';
    case VERIFICATION_STATUS.AUTH_REQUIRED:
      return 'AUTH REQUIRED';
    case VERIFICATION_STATUS.RATE_LIMITED:
      return 'RETRIEVAL FAILED';
    case VERIFICATION_STATUS.SOURCE_NOT_FOUND:
      return 'RESEARCH REQUIRED';
    case VERIFICATION_STATUS.UNSUPPORTED_SOURCE_FORMAT:
      return 'RESEARCH REQUIRED';
    default:
      return 'RETRIEVAL FAILED';
  }
}
