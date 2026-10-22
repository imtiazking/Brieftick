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
} from './contract.mjs';

/**
 * Fetch a listing page and extract detail URLs via regex (official paths only).
 * @param {object} config
 * @param {RegExp} config.linkPattern - applied to HTML; use capture group 1 for path or full URL
 * @param {boolean} [config.linkIsPath]
 */
export function createPatternHtmlConnector(config) {
  const baseUrl = new URL(config.listingUrl);
  return {
    connectorId: config.connectorId,
    regulatorId: config.regulatorId,
    sourceId: config.sourceId,
    allowedHosts: config.allowedHosts,
    feedUrl: config.listingUrl,
    retrievalMethod: config.retrievalMethod || 'official_html_pattern',
    maxItems: HTTP_LIMITS.maxItemsPerSource,
    maxRequests: HTTP_LIMITS.maxRequestsPerConnector,
    publicationType: config.publicationType || 'publication',

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
        officialUrl: reg?.officialBaseUrl || config.listingUrl,
        retrievalMethod: this.retrievalMethod,
        retrievedAt,
      };
      if (!liveAllowed) return empty(base, 'Live verification not enabled');

      const listRes = await httpGet(config.listingUrl, { allowedHosts: config.allowedHosts });
      if (!listRes.ok) return empty(base, listRes.message, mapHttp(listRes));

      const html = listRes.body.toString('utf8');
      const seen = new Set();
      const links = [];
      const re = new RegExp(config.linkPattern.source, config.linkPattern.flags);
      let m;
      while ((m = re.exec(html)) !== null && links.length < this.maxItems) {
        const raw = m[1] ?? m[0];
        const abs = config.linkIsPath ? new URL(raw, baseUrl).toString() : raw;
        if (seen.has(abs)) continue;
        const gate = assertUrlAllowed(abs, config.allowedHosts);
        if (!gate.ok) continue;
        seen.add(abs);
        links.push(abs);
      }

      if (links.length === 0 && config.pathPattern) {
        const pathRe = new RegExp(config.pathPattern.source, config.pathPattern.flags);
        let pm;
        while ((pm = pathRe.exec(html)) !== null && links.length < this.maxItems) {
          const raw = pm[1] ?? pm[0];
          const abs = new URL(raw.startsWith('/') ? raw : `/${raw}`, baseUrl).toString();
          if (seen.has(abs)) continue;
          const gate = assertUrlAllowed(abs, config.allowedHosts);
          if (!gate.ok) continue;
          seen.add(abs);
          links.push(abs);
        }
      }

      if (links.length === 0) {
        return {
          summary: buildVerificationResult({
            ...base,
            verificationStatus: VERIFICATION_STATUS.UNSUPPORTED_SOURCE_FORMAT,
            error: 'No pattern links found',
          }),
          items: [],
          publications: [],
        };
      }

      const items = [];
      const publications = [];
      let requests = 1;
      for (const link of links) {
        if (requests >= this.maxRequests) break;
        requests += 1;
        const docRes = await httpGet(link, { allowedHosts: config.allowedHosts });
        if (!docRes.ok) continue;
        const fp = await fingerprintContent(docRes.body);
        const title = pickTitle(docRes.body.toString('utf8')) || link;
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
              listingUrl: config.listingUrl,
              retrievalMethod: this.retrievalMethod,
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
          error: items.length === 0 ? 'Pattern links could not be retrieved' : null,
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
