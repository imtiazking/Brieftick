import { getRegulatorById, getSourceById } from '../../../packages/reference-data/index.mjs';
import { httpGet } from './http-client.mjs';
import { parseFeedItems } from './rss.mjs';
import { fingerprintContent } from './fingerprint.mjs';
import { buildEvidenceCapture } from './evidence-capture.mjs';
import { extractPublicationSummaryFromHtml } from './html-publication-text.mjs';
import { assertUrlAllowed, coerceHttpsForAllowlistedHost } from './url-safety.mjs';
import {
  VERIFICATION_STATUS,
  buildVerificationResult,
  buildNormalisedPublication,
  PROVENANCE_ORIGIN,
  HTTP_LIMITS,
  resolveConnectorItemLimit,
} from './contract.mjs';
import { selectFeedEntriesByOnlyUrl, ONLY_URL_ERROR } from './only-canonical-url.mjs';

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
 * @param {(ctx: { title: string, canonicalUrl: string, html: string }) => { publicationType: string, publicationTypeInference?: object }} [config.inferPublicationType]
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
      const onlyCanonicalUrl =
        typeof options.onlyCanonicalUrl === 'string' ? options.onlyCanonicalUrl.trim() : '';
      const feedParseLimit = onlyCanonicalUrl
        ? HTTP_LIMITS.maxFeedItemsForOnlyUrlScan
        : itemLimit;
      const feedItems = parseFeedItems(xml, feedParseLimit);
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

      let entriesToProcess = feedItems;
      if (onlyCanonicalUrl) {
        const picked = selectFeedEntriesByOnlyUrl(feedItems, onlyCanonicalUrl);
        if (!picked.ok) {
          const error =
            picked.code === ONLY_URL_ERROR.INVALID
              ? 'only_url_invalid'
              : picked.code === ONLY_URL_ERROR.AMBIGUOUS
                ? 'only_url_ambiguous'
                : 'only_url_not_found';
          return {
            summary: buildVerificationResult({
              ...base,
              verificationStatus: VERIFICATION_STATUS.LIVE_RETRIEVAL_FAILED,
              httpStatus: feedRes.httpStatus,
              contentType: feedRes.contentType,
              error,
            }),
            items: [],
            publications: [],
          };
        }
        entriesToProcess = picked.entries;
      } else {
        entriesToProcess = feedItems.slice(0, itemLimit);
      }

      const items = [];
      const publications = [];
      let requestCount = 1;
      const documentLimit = onlyCanonicalUrl ? 1 : itemLimit;

      for (const entry of entriesToProcess) {
        if (publications.length >= documentLimit) break;
        if (requestCount >= this.maxRequests) break;
        const linkGate = assertUrlAllowed(
          coerceHttpsForAllowlistedHost(entry.link, config.allowedHosts),
          config.allowedHosts,
        );
        if (!linkGate.ok) continue;

        requestCount += 1;
        const docRes = await httpGet(linkGate.url.toString(), { allowedHosts: config.allowedHosts });
        if (!docRes.ok) continue;

        const fp = await fingerprintContent(docRes.body, { contentType: docRes.contentType });
        const html = docRes.contentType.includes('html') ? docRes.body.toString('utf8') : '';
        const excerpt = html ? extractPublicationSummaryFromHtml(html) : null;
        let evidenceCapture = null;
        if (docRes.contentType.includes('html')) {
          evidenceCapture = await buildEvidenceCapture({
            body: docRes.body,
            contentType: docRes.contentType,
            finalUrl: docRes.finalUrl,
            connectorId: config.connectorId,
          });
          if (!evidenceCapture?.rawBody?.length) {
            continue;
          }
        }

        let publicationType = this.publicationType;
        let publicationTypeInference = null;
        if (typeof config.inferPublicationType === 'function' && html) {
          const inferred = config.inferPublicationType({
            title: entry.title,
            canonicalUrl: docRes.finalUrl,
            html,
          });
          if (inferred?.publicationType) publicationType = inferred.publicationType;
          publicationTypeInference = inferred?.publicationTypeInference ?? null;
        }

        const provenance = {
          origin: PROVENANCE_ORIGIN,
          regulatorId: config.regulatorId,
          sourceId: config.sourceId,
          canonicalUrl: docRes.finalUrl,
          retrievalMethod: config.retrievalMethod,
          feedUrl: config.feedUrl,
          retrievedAt,
          sourcePublishedAt: entry.published ?? null,
          ...(publicationTypeInference ? { publicationTypeInference } : {}),
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
            publicationType,
            publicationDate: entry.publicationDate || null,
            sourcePublishedAt: entry.published ?? null,
            canonicalUrl: docRes.finalUrl,
            summary: excerpt,
            contentHash: fp.hash,
            contentType: docRes.contentType,
            retrievedAt,
            publicationTypeInference,
            evidenceCapture,
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
