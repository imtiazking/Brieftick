import { toDiscoveryItem, defaultCapabilities, CONNECTOR_MODES } from './connector-base.js';
import { httpGet, DEFAULT_HTTP_CONFIG } from './http-client.js';
import {
  LEGISLATION_ALLOWED_HOSTS,
  LEGISLATION_CONNECTOR_VERSION,
  LEGISLATION_NEW_FEED,
  LEGISLATION_AUTHORITY,
  LEGISLATION_TARGET_MAP,
  legislationDataFeedUrl,
  canonicalLegislationUrl,
} from './legislation-constants.js';
import { parseLegislationSearchFeed, parseLegislationAtom, normaliseLegislationHttps } from './legislation-parser.js';
import { assessLegislationRelevance, isLegislationHost } from './legislation-relevance.js';
import { fingerprintContent } from './fingerprint.js';

const LEG_HTTP = {
  allowedHosts: LEGISLATION_ALLOWED_HOSTS,
  userAgent: 'FORGENIQ-Regulatory-Intelligence-Design-Lab/1.0',
  rateLimit: { minIntervalMs: 2500, maxConcurrent: 1 },
  maxHtmlBytes: 512 * 1024,
};

export function createLegislationConnector(config = {}) {
  return {
    id: config.id || 'CONN-LEG-001',
    sourceId: 'SRC-LEG',
    authority: LEGISLATION_AUTHORITY,
    authorityType: 'Official Government Legislation Source',
    sourceRole: 'UK Legislation',
    connectorVersion: LEGISLATION_CONNECTOR_VERSION,
    parserVersion: 'RI-PARSER-2.0',
    allowedHosts: LEGISLATION_ALLOWED_HOSTS,
    discoveryFeedUrl: LEGISLATION_NEW_FEED,
    capabilities: defaultCapabilities(),
    async discover(options = {}) {
      const mode = options.mode || CONNECTOR_MODES.FIXTURE;
      if (mode === CONNECTOR_MODES.FIXTURE) {
        return discoverFixture(options);
      }
      if (!options.liveAllowed) {
        return { ok: false, code: 'LIVE_NOT_ENABLED', message: 'Live regulatory verification is not enabled' };
      }
      const limit = Math.min(options.limit || 3, 5);
      const res = await httpGet(LEGISLATION_NEW_FEED, { ...LEG_HTTP, correlationId: options.correlationId });
      if (!res.ok) return res;
      const feed = parseLegislationSearchFeed(new TextDecoder().decode(res.body));
      if (!feed.ok) return feed;
      const ranked = feed.items.slice(0, limit).map((item) => {
        const rel = assessLegislationRelevance(item);
        return { ...item, ...rel, canonicalUrl: normaliseLegislationHttps(item.link) };
      });
      const items = ranked.map((item) =>
        toDiscoveryItem(item, {
          sourceId: 'SRC-LEG',
          dataOrigin: 'live-verification',
          sourceTrust: 'Official Government Legislation Source',
          jurisdiction: 'United Kingdom',
          publicationType: 'Legislation',
        })
      );
      return {
        ok: true,
        items,
        checkpoint: { feedUrl: LEGISLATION_NEW_FEED, retrievedAt: new Date().toISOString() },
      };
    },
    async retrieveTarget(path, options = {}) {
      if (!options.liveAllowed) return { ok: false, code: 'LIVE_NOT_ENABLED', message: 'Live retrieval not enabled' };
      const url = legislationDataFeedUrl(path);
      const res = await httpGet(url, { ...LEG_HTTP, correlationId: options.correlationId });
      if (!res.ok) return res;
      const parsed = parseLegislationAtom(new TextDecoder().decode(res.body));
      if (!parsed.ok) return parsed;
      const fp = await fingerprintContent(res.body);
      return {
        ok: true,
        path,
        canonicalUrl: canonicalLegislationUrl(path),
        feedMeta: parsed.feedMeta,
        entryCount: parsed.entries.length,
        contentType: res.contentType,
        httpStatus: res.status,
        sourceHash: fp.hash,
        hashAlgorithm: fp.algorithm,
        retrievedAt: new Date().toISOString(),
        finalUrl: res.finalUrl,
      };
    },
    async retrieve(item, options = {}) {
      const url = item.canonicalUrl || item.documentUrls?.[0];
      if (!url || !isLegislationHost(url)) {
        return { ok: false, code: 'INVALID_METADATA', message: 'URL not on legislation.gov.uk' };
      }
      const res = await httpGet(url, { ...LEG_HTTP, correlationId: options.correlationId });
      if (!res.ok) return res;
      return {
        ok: true,
        mediaType: res.contentType,
        body: res.body,
        finalUrl: res.finalUrl,
        storageMode: 'live-verification-metadata-only',
      };
    },
    targets: LEGISLATION_TARGET_MAP,
    checkpoint(state = {}) {
      return state.checkpoint || { feedUrl: LEGISLATION_NEW_FEED };
    },
  };
}

function discoverFixture(options) {
  const items = (options.fixtureItems || []).map((item) =>
    toDiscoveryItem(
      {
        ...item,
        discoveryMethod: 'legislation-fixture',
        publicationType: 'Legislation',
        relevanceStatus: item.relevanceStatus || 'REVIEW_REQUIRED',
        relevanceReason: item.relevanceReason || 'Fixture staging item',
      },
      {
        sourceId: 'SRC-LEG',
        dataOrigin: 'fixture',
        sourceTrust: 'Official Government Legislation Source',
        jurisdiction: 'United Kingdom',
      }
    )
  );
  return { ok: true, items, checkpoint: { fixture: true } };
}

export { LEGISLATION_TARGET_MAP };
