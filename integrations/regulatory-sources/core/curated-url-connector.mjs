import { getRegulatorById, getSourceById } from '../../../packages/reference-data/index.mjs';
import { httpGet } from './http-client.mjs';
import { fingerprintContent } from './fingerprint.mjs';
import { assertUrlAllowed } from './url-safety.mjs';
import {
  VERIFICATION_STATUS,
  buildVerificationResult,
  buildNormalisedPublication,
  PROVENANCE_ORIGIN,
  HTTP_LIMITS,
  resolveConnectorItemLimit,
} from './contract.mjs';

/**
 * Fetch a bounded set of official document URLs (historical window / corpus anchors).
 * Used when listing pages are JS-rendered but direct document URLs remain stable.
 */
export function createCuratedOfficialDocumentConnector(config) {
  return {
    connectorId: config.connectorId,
    regulatorId: config.regulatorId,
    sourceId: config.sourceId,
    allowedHosts: config.allowedHosts,
    feedUrl: config.documentUrls[0],
    retrievalMethod: config.retrievalMethod || 'official_curated_documents',
    maxItems: HTTP_LIMITS.maxItemsPerSource,
    maxRequests: HTTP_LIMITS.maxRequestsPerConnector,
    publicationType: config.publicationType || 'publication',
    documentUrls: config.documentUrls,

    async verify(options = {}) {
      const itemLimit = resolveConnectorItemLimit({ maxItems: this.maxItems }, options);
      const liveAllowed = options.liveAllowed === true;
      const reg = getRegulatorById(config.regulatorId);
      const src = getSourceById(config.sourceId);
      const retrievedAt = new Date().toISOString();
      const base = {
        regulatorId: config.regulatorId,
        sourceId: config.sourceId,
        connectorId: config.connectorId,
        sourceName: src?.sourceType || config.sourceId,
        jurisdiction: reg?.jurisdiction || null,
        officialUrl: reg?.officialBaseUrl || config.documentUrls[0],
        retrievalMethod: this.retrievalMethod,
        retrievedAt,
      };
      if (!liveAllowed) return empty(base, 'Live verification not enabled');

      const items = [];
      const publications = [];
      let requests = 0;
      for (const url of config.documentUrls) {
        if (publications.length >= itemLimit) break;
        if (requests >= this.maxRequests) break;
        const gate = assertUrlAllowed(url, config.allowedHosts);
        if (!gate.ok) continue;
        requests += 1;
        const docRes = await httpGet(url, { allowedHosts: config.allowedHosts });
        if (!docRes.ok) continue;
        const fp = await fingerprintContent(docRes.body, { contentType: docRes.contentType });
        const title =
          pickTitle(docRes.body.toString('utf8', 0, 12000)) || url.split('/').pop() || url;
        items.push(
          buildVerificationResult({
            ...base,
            verificationStatus: VERIFICATION_STATUS.LIVE_VERIFIED,
            httpStatus: docRes.httpStatus,
            contentType: docRes.contentType,
            title,
            sourceDocumentUrl: docRes.finalUrl,
            sourceDocumentId: docRes.finalUrl,
            contentHash: fp.hash,
          }),
        );
        publications.push(
          buildNormalisedPublication({
            regulatorId: config.regulatorId,
            sourceId: config.sourceId,
            title,
            publicationType: this.publicationType,
            canonicalUrl: docRes.finalUrl,
            contentHash: fp.hash,
            retrievedAt,
          }),
        );
      }

      const status =
        publications.length > 0 ? VERIFICATION_STATUS.LIVE_VERIFIED : VERIFICATION_STATUS.LIVE_RETRIEVAL_FAILED;
      return {
        summary: buildVerificationResult({
          ...base,
          verificationStatus: status,
          error: publications.length === 0 ? 'Curated document URLs could not be retrieved' : null,
        }),
        items,
        publications,
      };
    },
  };
}

function pickTitle(html) {
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return m ? m[1].trim() : null;
}

function empty(base, error) {
  return {
    summary: buildVerificationResult({
      ...base,
      verificationStatus: VERIFICATION_STATUS.LIVE_RETRIEVAL_FAILED,
      error,
    }),
    items: [],
    publications: [],
  };
}
