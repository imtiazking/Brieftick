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

const API_BASE = 'https://www.ecfr.gov/api/versioner/v1';

/**
 * Official eCFR versioner API (no API key). Used for structured CFR title discovery.
 * Full provision text retrieval reuses hosted snapshot + html_article_v2 (no duplicate parser).
 */
export function createEcfrApiConnector(config) {
  return {
    connectorId: config.connectorId,
    regulatorId: config.regulatorId,
    sourceId: config.sourceId,
    allowedHosts: ['www.ecfr.gov', 'ecfr.gov'],
    feedUrl: `${API_BASE}/titles.json`,
    retrievalMethod: config.retrievalMethod || 'official_ecfr_versioner_api',
    maxItems: HTTP_LIMITS.maxItemsPerSource,
    maxRequests: HTTP_LIMITS.maxRequestsPerConnector,
    publicationType: config.publicationType || 'cfr_title_index',
    titleFilter: config.titleFilter || null,

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
        officialUrl: 'https://www.ecfr.gov/',
        retrievalMethod: this.retrievalMethod,
        retrievedAt,
      };
      if (!liveAllowed) {
        return empty(base, 'Live verification not enabled');
      }

      const apiUrl = `${API_BASE}/titles.json`;
      const gate = assertUrlAllowed(apiUrl, this.allowedHosts);
      if (!gate.ok) return empty(base, gate.message);

      const apiRes = await httpGet(apiUrl, {
        allowedHosts: this.allowedHosts,
        accept: 'application/json',
      });
      if (!apiRes.ok) return empty(base, apiRes.message);

      let payload;
      try {
        payload = JSON.parse(apiRes.body.toString('utf8'));
      } catch {
        return empty(base, 'Invalid JSON from eCFR API');
      }

      let titles = Array.isArray(payload.titles) ? payload.titles : [];
      if (this.titleFilter?.length) {
        titles = titles.filter((t) => this.titleFilter.includes(Number(t.number)));
      }
      titles = titles.slice(0, itemLimit);

      const items = [];
      const publications = [];
      for (const row of titles) {
        const canonicalUrl = `https://www.ecfr.gov/current/title-${row.number}`;
        const title = `CFR Title ${row.number}: ${row.name || 'Unknown'}`;
        const synthetic = JSON.stringify({
          titleNumber: row.number,
          name: row.name,
          upToDateAsOf: row.up_to_date_as_of,
          latestIssueDate: row.latest_issue_date,
        });
        const fp = await fingerprintContent(Buffer.from(synthetic, 'utf8'), { contentType: 'application/json' });
        const provenance = {
          origin: PROVENANCE_ORIGIN,
          regulatorId: config.regulatorId,
          sourceId: config.sourceId,
          canonicalUrl,
          cfrTitleNumber: row.number,
          retrievalMethod: this.retrievalMethod,
          retrievedAt,
        };
        items.push(
          buildVerificationResult({
            ...base,
            verificationStatus: VERIFICATION_STATUS.LIVE_VERIFIED,
            httpStatus: 200,
            contentType: 'application/json',
            title,
            publishedAt: row.latest_issue_date || row.up_to_date_as_of || null,
            sourceDocumentUrl: canonicalUrl,
            sourceDocumentId: `CFR-TITLE-${row.number}`,
            contentHash: fp.hash,
            provenance,
          }),
        );
        publications.push(
          buildNormalisedPublication({
            regulatorId: config.regulatorId,
            sourceId: config.sourceId,
            externalId: `CFR-TITLE-${row.number}`,
            title,
            publicationType: this.publicationType,
            publicationDate: row.latest_issue_date || null,
            canonicalUrl,
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
          error: publications.length === 0 ? 'eCFR titles empty or filtered out' : null,
        }),
        items,
        publications,
      };
    },
  };
}

function empty(base, error, status = VERIFICATION_STATUS.LIVE_RETRIEVAL_FAILED) {
  return {
    summary: buildVerificationResult({ ...base, verificationStatus: status, error }),
    items: [],
    publications: [],
  };
}