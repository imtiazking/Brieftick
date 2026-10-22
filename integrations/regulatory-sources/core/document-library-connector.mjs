import { getRegulatorById, getSourceById } from '../../../packages/reference-data/index.mjs';
import { httpGet } from './http-client.mjs';
import { extractDocumentLinks } from './document-library.mjs';
import { fingerprintContent } from './fingerprint.mjs';
import { assertUrlAllowed } from './url-safety.mjs';
import {
  VERIFICATION_STATUS,
  buildVerificationResult,
  buildNormalisedPublication,
  PROVENANCE_ORIGIN,
  HTTP_LIMITS,
} from './contract.mjs';

export function createDocumentLibraryConnector(config) {
  return {
    connectorId: config.connectorId,
    regulatorId: config.regulatorId,
    sourceId: config.sourceId,
    allowedHosts: config.allowedHosts,
    feedUrl: config.indexUrl,
    listingUrl: config.indexUrl,
    retrievalMethod: config.retrievalMethod || 'official_document_library',
    productionStrategy: config.productionStrategy || 'DIRECT_OFFICIAL_DOCUMENT_LIBRARY',
    maxItems: HTTP_LIMITS.maxItemsPerSource,
    maxRequests: HTTP_LIMITS.maxRequestsPerConnector,
    publicationType: config.publicationType || 'regulation',

    async verify(options = {}) {
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
        officialUrl: reg?.officialBaseUrl || config.indexUrl,
        retrievalMethod: this.retrievalMethod,
        retrievedAt,
      };
      if (!liveAllowed) return fail(base, 'Live verification not enabled');

      const indexGate = assertUrlAllowed(config.indexUrl, config.allowedHosts);
      if (!indexGate.ok) return fail(base, indexGate.message);

      const indexRes = await httpGet(config.indexUrl, { allowedHosts: config.allowedHosts });
      if (!indexRes.ok) return fail(base, indexRes.message, mapHttp(indexRes));

      const docs = extractDocumentLinks(
        indexRes.body.toString('utf8'),
        indexRes.finalUrl,
        config.allowedHosts,
        this.maxItems,
      );
      if (docs.length === 0) {
        return {
          summary: buildVerificationResult({
            ...base,
            verificationStatus: VERIFICATION_STATUS.UNSUPPORTED_SOURCE_FORMAT,
            error: 'No document links in library index',
            provenance: { productionStrategy: this.productionStrategy },
          }),
          items: [],
          publications: [],
        };
      }

      const items = [];
      const publications = [];
      let requests = 1;
      for (const doc of docs) {
        if (requests >= this.maxRequests) break;
        requests += 1;
        const docRes = await httpGet(doc.link, { allowedHosts: config.allowedHosts });
        if (!docRes.ok) continue;
        const fp = await fingerprintContent(docRes.body);
        const title =
          doc.link.toLowerCase().endsWith('.pdf')
            ? doc.title
            : pickHtmlTitle(docRes.body.toString('utf8', 0, 12000)) || doc.title;
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
            provenance: {
              origin: PROVENANCE_ORIGIN,
              regulatorId: config.regulatorId,
              sourceId: config.sourceId,
              canonicalUrl: docRes.finalUrl,
              indexUrl: config.indexUrl,
              retrievalMethod: this.retrievalMethod,
              productionStrategy: this.productionStrategy,
              retrievedAt,
            },
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
        items.length > 0 ? VERIFICATION_STATUS.LIVE_VERIFIED : VERIFICATION_STATUS.LIVE_RETRIEVAL_FAILED;
      return {
        summary: buildVerificationResult({
          ...base,
          verificationStatus: status,
          title: items[0]?.title || null,
          sourceDocumentUrl: items[0]?.sourceDocumentUrl || null,
          contentHash: items[0]?.contentHash || null,
          error: items.length === 0 ? 'Documents could not be retrieved' : null,
          provenance: items[0]?.provenance || { productionStrategy: this.productionStrategy },
        }),
        items,
        publications,
      };
    },
  };
}

function pickHtmlTitle(html) {
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return m ? m[1].trim() : null;
}

function mapHttp(res) {
  if (res.code === 'ACCESS_RESTRICTED') return VERIFICATION_STATUS.ACCESS_RESTRICTED;
  if (res.code === 'AUTH_REQUIRED') return VERIFICATION_STATUS.AUTH_REQUIRED;
  return VERIFICATION_STATUS.LIVE_RETRIEVAL_FAILED;
}

function fail(base, error, status = VERIFICATION_STATUS.LIVE_RETRIEVAL_FAILED) {
  return {
    summary: buildVerificationResult({ ...base, verificationStatus: status, error }),
    items: [],
    publications: [],
  };
}
