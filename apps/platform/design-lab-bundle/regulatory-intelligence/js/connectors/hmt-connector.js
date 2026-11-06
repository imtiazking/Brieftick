import { toDiscoveryItem, defaultCapabilities, CONNECTOR_MODES } from './connector-base.js';
import { httpGet } from './http-client.js';
import { parseXmlFeed } from './document-parser.js';
import { normalizeCanonicalUrl } from './url-normalize.js';
import { createFixtureConnector } from './fixture-connector.js';
import {
  filterAndRankHmtItems,
  inferHmtPublicationType,
  isOfficialHmtGovUkUrl,
} from './hmt-relevance.js';

export const HMT_CONNECTOR_VERSION = 'HMT-GOVUK-ATOM-1.0';
/** Official GOV.UK Atom feed for HM Treasury organisation publications. */
export const HMT_GOVT_ATOM = 'https://www.gov.uk/government/organisations/hm-treasury.atom';
export const HMT_ALLOWED_HOSTS = ['www.gov.uk', 'gov.uk'];

export function createHmtConnector(config = {}) {
  const fixtureDelegate = createFixtureConnector({
    id: config.id || 'CONN-HMT-001',
    sourceId: 'SRC-HMT',
    regulator: 'HM Treasury',
    sourceTrust: 'Official Government Source',
  });

  return {
    id: config.id || 'CONN-HMT-001',
    sourceId: 'SRC-HMT',
    authority: 'HM Treasury',
    authorityType: 'Government / Policy',
    sourceRole: 'Horizon Scanning',
    connectorVersion: HMT_CONNECTOR_VERSION,
    parserVersion: 'RI-PARSER-2.0',
    allowedHosts: HMT_ALLOWED_HOSTS,
    discoveryFeedUrl: HMT_GOVT_ATOM,
    capabilities: defaultCapabilities(),
    async discover(options = {}) {
      const mode = options.mode || CONNECTOR_MODES.FIXTURE;
      if (mode === CONNECTOR_MODES.FIXTURE) {
        return fixtureDelegate.discover(options);
      }
      if (mode === CONNECTOR_MODES.PRODUCTION) {
        return { ok: false, code: 'LIVE_NOT_ENABLED', message: 'Production connector mode is not enabled in Design Lab' };
      }
      if (!options.liveAllowed) {
        return { ok: false, code: 'LIVE_NOT_ENABLED', message: 'Live regulatory verification is not enabled' };
      }
      const limit = Math.min(options.limit || 3, 3);
      const res = await httpGet(HMT_GOVT_ATOM, {
        allowedHosts: HMT_ALLOWED_HOSTS,
        correlationId: options.correlationId,
        rateLimit: { minIntervalMs: 3000, maxConcurrent: 1 },
      });
      if (!res.ok) return res;
      const feed = parseXmlFeed(new TextDecoder().decode(res.body));
      if (!feed.ok) return feed;
      const ranked = filterAndRankHmtItems(feed.items, limit);
      if (!ranked.length) {
        return {
          ok: false,
          code: 'NO_RELEVANT_ITEMS',
          message: 'No HM Treasury financial-services items matched relevance filter in current feed window',
        };
      }
      const items = ranked.map((item) =>
        toDiscoveryItem(
          {
            ...item,
            canonicalUrl: normalizeCanonicalUrl(item.link),
            publicationType: item.publicationType || inferHmtPublicationType(item.title, item.link),
            discoveryMethod: 'hmt-govuk-atom',
            relevanceStatus: item.relevanceStatus,
            relevanceReason: item.relevanceReason,
            matchedSignals: item.matchedSignals,
            sourceMetadata: {
              authority: 'HM Treasury',
              authorityType: 'Government / Policy',
              sourceRole: 'Horizon Scanning',
              organisation: 'HM Treasury',
            },
          },
          {
            sourceId: 'SRC-HMT',
            dataOrigin: 'live-verification',
            sourceTrust: 'Official Government Source',
            jurisdiction: 'United Kingdom',
          }
        )
      );
      return {
        ok: true,
        items,
        checkpoint: { feedUrl: HMT_GOVT_ATOM, retrievedAt: new Date().toISOString() },
      };
    },
    async retrieve(item, options = {}) {
      const mode = options.mode || CONNECTOR_MODES.FIXTURE;
      if (mode === CONNECTOR_MODES.FIXTURE) return fixtureDelegate.retrieve(item, options);
      if (!options.liveAllowed) return { ok: false, code: 'LIVE_NOT_ENABLED', message: 'Live retrieval not enabled' };
      const url = item.canonicalUrl || item.documentUrls?.[0];
      if (!url || !isOfficialHmtGovUkUrl(url)) {
        return { ok: false, code: 'INVALID_METADATA', message: 'URL not on approved GOV.UK HM Treasury path' };
      }
      const res = await httpGet(url, {
        allowedHosts: HMT_ALLOWED_HOSTS,
        correlationId: options.correlationId,
        rateLimit: { minIntervalMs: 3000, maxConcurrent: 1 },
      });
      if (!res.ok) return res;
      return {
        ok: true,
        mediaType: res.contentType,
        body: res.body,
        finalUrl: res.finalUrl,
        fingerprint: null,
        storageMode: 'live-verification-metadata-only',
      };
    },
    checkpoint(state = {}) {
      return state.checkpoint || { feedUrl: HMT_GOVT_ATOM };
    },
    health(connectorState = {}) {
      if (connectorState.mode === CONNECTOR_MODES.FIXTURE) return { status: 'Healthy', detail: 'Fixture mode' };
      if (!connectorState.lastSuccessAt) return { status: 'Not Verified', detail: 'Live verification not yet run' };
      return { status: connectorState.lastWarning ? 'Degraded' : 'Healthy' };
    },
  };
}
