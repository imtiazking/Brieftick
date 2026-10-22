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
 * @param {object} config
 * @param {string} config.sitemapUrl
 * @param {RegExp} config.urlPattern
 */
export function createSitemapConnector(config) {
  return {
    connectorId: config.connectorId,
    regulatorId: config.regulatorId,
    sourceId: config.sourceId,
    allowedHosts: config.allowedHosts,
    feedUrl: config.sitemapUrl,
    retrievalMethod: config.retrievalMethod || 'official_sitemap',
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
        officialUrl: reg?.officialBaseUrl || config.sitemapUrl,
        retrievalMethod: this.retrievalMethod,
        retrievedAt,
      };
      if (!liveAllowed) {
        return fail(base, 'Live verification not enabled');
      }

      const mapRes = await httpGet(config.sitemapUrl, {
        allowedHosts: config.allowedHosts,
        maxBytes: config.maxSitemapBytes,
      });
      if (!mapRes.ok) return fail(base, mapRes.message, mapHttp(mapRes));

      const xml = mapRes.body.toString('utf8');
      const entries = parseSitemapEntries(xml)
        .filter((e) => config.urlPattern.test(e.loc))
        .sort((a, b) => (b.lastmod || '').localeCompare(a.lastmod || '') || b.loc.localeCompare(a.loc))
        .slice(0, this.maxItems);

      if (entries.length === 0) {
        return {
          summary: buildVerificationResult({
            ...base,
            verificationStatus: VERIFICATION_STATUS.UNSUPPORTED_SOURCE_FORMAT,
            error: 'No sitemap URLs matched',
          }),
          items: [],
          publications: [],
        };
      }

      const items = [];
      const publications = [];
      let requests = 1;
      for (const entry of entries) {
        if (requests >= this.maxRequests) break;
        const gate = assertUrlAllowed(entry.loc, config.allowedHosts);
        if (!gate.ok) continue;
        requests += 1;
        const docRes = await httpGet(entry.loc, { allowedHosts: config.allowedHosts });
        if (!docRes.ok) continue;
        const fp = await fingerprintContent(docRes.body);
        const title = pickTitle(docRes.body.toString('utf8')) || entry.loc;
        items.push(
          buildVerificationResult({
            ...base,
            verificationStatus: VERIFICATION_STATUS.LIVE_VERIFIED,
            httpStatus: docRes.httpStatus,
            contentType: docRes.contentType,
            title,
            publishedAt: entry.lastmod || null,
            sourceDocumentUrl: docRes.finalUrl,
            sourceDocumentId: entry.loc,
            contentHash: fp.hash,
            provenance: {
              origin: PROVENANCE_ORIGIN,
              regulatorId: config.regulatorId,
              sourceId: config.sourceId,
              canonicalUrl: docRes.finalUrl,
              sitemapUrl: config.sitemapUrl,
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
            publicationDate: entry.lastmod || null,
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
          error: items.length === 0 ? 'Sitemap URLs could not be retrieved' : null,
        }),
        items,
        publications,
      };
    },
  };
}

function parseSitemapEntries(xml) {
  const blocks = xml.match(/<url>[\s\S]*?<\/url>/gi) || [];
  const out = [];
  for (const block of blocks) {
    const loc = block.match(/<loc>([^<]+)<\/loc>/i)?.[1]?.trim();
    const lastmod = block.match(/<lastmod>([^<]+)<\/lastmod>/i)?.[1]?.trim();
    if (loc) out.push({ loc, lastmod: lastmod || null });
  }
  return out;
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

function fail(base, error, status = VERIFICATION_STATUS.LIVE_RETRIEVAL_FAILED) {
  return {
    summary: buildVerificationResult({ ...base, verificationStatus: status, error }),
    items: [],
    publications: [],
  };
}
