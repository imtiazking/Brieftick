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

const API_BASE = 'https://www.federalregister.gov/api/v1/documents.json';

/**
 * Official Federal Register JSON API (no API key required).
 * @param {object} config
 * @param {string[]} config.agencySlugs e.g. ['securities-and-exchange-commission']
 */
export function createFederalRegisterApiConnector(config) {
  return {
    connectorId: config.connectorId,
    regulatorId: config.regulatorId,
    sourceId: config.sourceId,
    allowedHosts: ['www.federalregister.gov', 'federalregister.gov'],
    feedUrl: API_BASE,
    retrievalMethod: config.retrievalMethod || 'official_federal_register_api',
    maxItems: HTTP_LIMITS.maxItemsPerSource,
    maxRequests: HTTP_LIMITS.maxRequestsPerConnector,
    publicationType: config.publicationType || 'rulemaking',
    agencySlugs: config.agencySlugs || [],

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
        officialUrl: 'https://www.federalregister.gov/',
        retrievalMethod: this.retrievalMethod,
        retrievedAt,
      };
      if (!liveAllowed) {
        return empty(base, 'Live verification not enabled');
      }

      const params = new URLSearchParams({
        per_page: String(itemLimit),
        order: 'newest',
      });
      for (const slug of this.agencySlugs) {
        params.append('conditions[agencies][]', slug);
      }
      const apiUrl = `${API_BASE}?${params.toString()}`;
      const gate = assertUrlAllowed(apiUrl, this.allowedHosts);
      if (!gate.ok) return empty(base, gate.message);

      const apiRes = await httpGet(apiUrl, {
        allowedHosts: this.allowedHosts,
        accept: 'application/json',
      });
      if (!apiRes.ok) {
        return empty(base, apiRes.message, mapHttp(apiRes));
      }

      let payload;
      try {
        payload = JSON.parse(apiRes.body.toString('utf8'));
      } catch {
        return empty(base, 'Invalid JSON from Federal Register API');
      }

      const results = Array.isArray(payload.results) ? payload.results.slice(0, itemLimit) : [];
      if (results.length === 0) {
        return {
          summary: buildVerificationResult({
            ...base,
            verificationStatus: VERIFICATION_STATUS.UNSUPPORTED_SOURCE_FORMAT,
            error: 'No documents in API response (empty feed or filter too narrow)',
          }),
          items: [],
          publications: [],
        };
      }

      const items = [];
      const publications = [];
      let requests = 1;

      for (const doc of results) {
        if (publications.length >= itemLimit) break;
        if (requests >= this.maxRequests) break;
        const canonicalUrl = doc.html_url || doc.pdf_url;
        if (!canonicalUrl) continue;
        const linkGate = assertUrlAllowed(canonicalUrl, this.allowedHosts);
        if (!linkGate.ok) continue;
        requests += 1;
        const docRes = await httpGet(canonicalUrl, { allowedHosts: this.allowedHosts });
        if (!docRes.ok) continue;
        const fp = await fingerprintContent(docRes.body, { contentType: docRes.contentType });
        const title = doc.title || doc.document_number || canonicalUrl;
        const provenance = {
          origin: PROVENANCE_ORIGIN,
          regulatorId: config.regulatorId,
          sourceId: config.sourceId,
          canonicalUrl: docRes.finalUrl,
          documentNumber: doc.document_number,
          federalRegisterType: doc.type,
          agencySlugs: this.agencySlugs,
          retrievalMethod: this.retrievalMethod,
          retrievedAt,
        };
        items.push(
          buildVerificationResult({
            ...base,
            verificationStatus: VERIFICATION_STATUS.LIVE_VERIFIED,
            httpStatus: docRes.httpStatus,
            contentType: docRes.contentType,
            title,
            publishedAt: doc.publication_date || null,
            sourceDocumentUrl: docRes.finalUrl,
            sourceDocumentId: doc.document_number || docRes.finalUrl,
            contentHash: fp.hash,
            provenance,
          }),
        );
        publications.push(
          buildNormalisedPublication({
            regulatorId: config.regulatorId,
            sourceId: config.sourceId,
            externalId: doc.document_number || null,
            title,
            publicationType: this.publicationType,
            publicationDate: doc.publication_date || null,
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
          error: publications.length === 0 ? 'Federal Register documents could not be retrieved' : null,
        }),
        items,
        publications,
      };
    },
  };
}

function mapHttp(res) {
  if (res.code === 'ACCESS_RESTRICTED') return VERIFICATION_STATUS.ACCESS_RESTRICTED;
  if (res.code === 'AUTH_REQUIRED') return VERIFICATION_STATUS.AUTH_REQUIRED;
  return VERIFICATION_STATUS.LIVE_RETRIEVAL_FAILED;
}

function empty(base, error, status = VERIFICATION_STATUS.LIVE_RETRIEVAL_FAILED) {
  return {
    summary: buildVerificationResult({ ...base, verificationStatus: status, error }),
    items: [],
    publications: [],
  };
}
