import { getRegulatorById, getSourceById } from '../../../packages/reference-data/index.mjs';
import { httpGet } from './http-client.mjs';
import { parseFeedItems } from './rss.mjs';
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
 * @param {object} config
 * @param {string} config.connectorId
 * @param {string} config.regulatorId
 * @param {string} config.sourceId
 * @param {string[]} config.allowedHosts
 * @param {string} config.feedUrl
 * @param {string} config.retrievalMethod
 * @param {string} [config.publicationType]
 * @param {number} [config.maxItems]
 * @param {number} [config.pilotMaxItems] Manual-run cap (e.g. 5 for FCA pilot); default runs use maxItems.
 */
export function createRssFeedConnector(config) {
  const regulator = () => getRegulatorById(config.regulatorId);
  const catalogueSource = () => getSourceById(config.sourceId);

  return {
    connectorId: config.connectorId,
    regulatorId: config.regulatorId,
    sourceId: config.sourceId,
    allowedHosts: config.allowedHosts,
    feedUrl: config.feedUrl,
    retrievalMethod: config.retrievalMethod,
    maxItems: config.maxItems ?? HTTP_LIMITS.maxItemsPerSource,
    pilotMaxItems: config.pilotMaxItems ?? null,
    maxRequests: HTTP_LIMITS.maxRequestsPerConnector,
    publicationType: config.publicationType || 'publication',

    async verify(options = {}) {
      const itemLimit = resolveConnectorItemLimit(
        { maxItems: this.maxItems, pilotMaxItems: this.pilotMaxItems },
        options,
      );
      const liveAllowed = options.liveAllowed === true;
      const reg = regulator();
      const src = catalogueSource();
      const retrievedAt = new Date().toISOString();
      const base = {
        regulatorId: config.regulatorId,
        sourceId: config.sourceId,
        connectorId: config.connectorId,
        sourceName: src?.sourceType || config.sourceId,
        jurisdiction: reg?.jurisdiction || null,
        officialUrl: reg?.officialBaseUrl || config.feedUrl,
        retrievalMethod: config.retrievalMethod,
        retrievedAt,
      };

      if (!reg || !src) {
        return {
          summary: buildVerificationResult({
            ...base,
            verificationStatus: VERIFICATION_STATUS.SOURCE_NOT_FOUND,
            error: 'Catalogue entry missing',
          }),
          items: [],
          publications: [],
        };
      }

      const feedGate = assertUrlAllowed(config.feedUrl, config.allowedHosts);
      if (!feedGate.ok) {
        return {
          summary: buildVerificationResult({
            ...base,
            verificationStatus: VERIFICATION_STATUS.LIVE_RETRIEVAL_FAILED,
            error: feedGate.message,
          }),
          items: [],
          publications: [],
        };
      }

      if (!liveAllowed) {
        return {
          summary: buildVerificationResult({
            ...base,
            verificationStatus: VERIFICATION_STATUS.LIVE_RETRIEVAL_FAILED,
            error: 'Live verification not enabled',
          }),
          items: [],
          publications: [],
        };
      }

      const feedRes = await httpGet(config.feedUrl, { allowedHosts: config.allowedHosts });
      if (!feedRes.ok) {
        const status =
          feedRes.code === 'ACCESS_RESTRICTED'
            ? VERIFICATION_STATUS.ACCESS_RESTRICTED
            : feedRes.code === 'AUTH_REQUIRED'
              ? VERIFICATION_STATUS.AUTH_REQUIRED
              : feedRes.code === 'RATE_LIMITED'
                ? VERIFICATION_STATUS.RATE_LIMITED
                : VERIFICATION_STATUS.LIVE_RETRIEVAL_FAILED;
        return {
          summary: buildVerificationResult({
            ...base,
            verificationStatus: status,
            httpStatus: feedRes.httpStatus ?? null,
            error: feedRes.message,
          }),
          items: [],
          publications: [],
        };
      }

      const xml = feedRes.body.toString('utf8');
      const feedItems = parseFeedItems(xml, itemLimit);
      if (feedItems.length === 0) {
        return {
          summary: buildVerificationResult({
            ...base,
            verificationStatus: VERIFICATION_STATUS.UNSUPPORTED_SOURCE_FORMAT,
            httpStatus: feedRes.httpStatus,
            contentType: feedRes.contentType,
            error: 'No feed items parsed',
          }),
          items: [],
          publications: [],
        };
      }

      const items = [];
      const publications = [];
      let requestCount = 1;

      for (const entry of feedItems) {
        if (publications.length >= itemLimit) break;
        if (requestCount >= this.maxRequests) break;
        const linkGate = assertUrlAllowed(entry.link, config.allowedHosts);
        if (!linkGate.ok) continue;

        requestCount += 1;
        const docRes = await httpGet(entry.link, { allowedHosts: config.allowedHosts });
        if (!docRes.ok) continue;

        const fp = await fingerprintContent(docRes.body, { contentType: docRes.contentType });
        const excerpt =
          docRes.contentType.includes('html')
            ? docRes.body.toString('utf8').replace(/<[^>]+>/g, ' ').slice(0, 400)
            : null;

        const provenance = {
          origin: PROVENANCE_ORIGIN,
          regulatorId: config.regulatorId,
          sourceId: config.sourceId,
          canonicalUrl: docRes.finalUrl,
          retrievalMethod: config.retrievalMethod,
          feedUrl: config.feedUrl,
          retrievedAt,
          sourcePublishedAt: entry.published ?? null,
        };

        items.push(
          buildVerificationResult({
            ...base,
            verificationStatus: VERIFICATION_STATUS.LIVE_VERIFIED,
            httpStatus: docRes.httpStatus,
            contentType: docRes.contentType,
            title: entry.title,
            publishedAt: entry.publicationDate || entry.published || null,
            sourceDocumentUrl: docRes.finalUrl,
            sourceDocumentId: entry.externalId || entry.link,
            contentHash: fp.hash,
            provenance,
          }),
        );

        publications.push(
          buildNormalisedPublication({
            regulatorId: config.regulatorId,
            sourceId: config.sourceId,
            externalId: entry.externalId || null,
            title: entry.title,
            publicationType: this.publicationType,
            publicationDate: entry.publicationDate || null,
            sourcePublishedAt: entry.published ?? null,
            canonicalUrl: docRes.finalUrl,
            summary: excerpt,
            contentHash: fp.hash,
            retrievedAt,
          }),
        );
      }

      const summaryStatus =
        items.length > 0 ? VERIFICATION_STATUS.LIVE_VERIFIED : VERIFICATION_STATUS.LIVE_RETRIEVAL_FAILED;

      return {
        summary: buildVerificationResult({
          ...base,
          verificationStatus: summaryStatus,
          httpStatus: feedRes.httpStatus,
          contentType: feedRes.contentType,
          title: items[0]?.title || feedItems[0]?.title || null,
          sourceDocumentUrl: items[0]?.sourceDocumentUrl || feedItems[0]?.link || null,
          contentHash: items[0]?.contentHash || null,
          error: items.length === 0 ? 'Could not retrieve item documents' : null,
        }),
        items,
        publications,
      };
    },
  };
}
