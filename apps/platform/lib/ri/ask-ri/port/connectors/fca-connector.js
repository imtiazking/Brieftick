import { toDiscoveryItem, defaultCapabilities, CONNECTOR_MODES } from './connector-base.js';
import { httpGet, DEFAULT_HTTP_CONFIG } from './http-client.js';
import { parseXmlFeed } from './document-parser.js';
import { normalizeCanonicalUrl } from './url-normalize.js';
import { createFixtureConnector, FIXTURE_CONNECTOR_VERSION } from './fixture-connector.js';

export const FCA_CONNECTOR_VERSION = 'FCA-RSS-1.0';
export const FCA_PUBLICATIONS_RSS = 'https://www.fca.org.uk/publications/rss.xml';
export const FCA_ALLOWED_HOSTS = ['www.fca.org.uk', 'fca.org.uk'];

export function createFcaConnector(config = {}) {
  const fixtureDelegate = createFixtureConnector({
    id: config.id || 'CONN-FCA-001',
    sourceId: 'SRC-FCA',
    regulator: 'FCA',
    sourceTrust: 'Official Regulator',
  });

  return {
    id: config.id || 'CONN-FCA-001',
    sourceId: 'SRC-FCA',
    regulator: 'FCA',
    connectorVersion: FCA_CONNECTOR_VERSION,
    parserVersion: 'RI-PARSER-2.0',
    allowedHosts: FCA_ALLOWED_HOSTS,
    discoveryFeedUrl: FCA_PUBLICATIONS_RSS,
    capabilities: defaultCapabilities({ pdfRetrieval: true }),
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
      const limit = Math.min(options.limit || 3, 5);
      const res = await httpGet(FCA_PUBLICATIONS_RSS, {
        allowedHosts: FCA_ALLOWED_HOSTS,
        correlationId: options.correlationId,
        rateLimit: { minIntervalMs: 3000, maxConcurrent: 1 },
      });
      if (!res.ok) return res;
      const feed = parseXmlFeed(new TextDecoder().decode(res.body));
      if (!feed.ok) return feed;
      const items = feed.items
        .slice(0, limit)
        .map((item) =>
          toDiscoveryItem(
            {
              ...item,
              canonicalUrl: normalizeCanonicalUrl(item.link),
              publicationType: inferFcaType(item.title, item.link),
              discoveryMethod: 'fca-publications-rss',
            },
            {
              sourceId: 'SRC-FCA',
              dataOrigin: 'live-verification',
              sourceTrust: 'Official Regulator',
            }
          )
        );
      return { ok: true, items, checkpoint: { feedUrl: FCA_PUBLICATIONS_RSS, retrievedAt: new Date().toISOString() } };
    },
    async retrieve(item, options = {}) {
      const mode = options.mode || CONNECTOR_MODES.FIXTURE;
      if (mode === CONNECTOR_MODES.FIXTURE) return fixtureDelegate.retrieve(item, options);
      if (!options.liveAllowed) return { ok: false, code: 'LIVE_NOT_ENABLED', message: 'Live retrieval not enabled' };
      const url = item.canonicalUrl || item.documentUrls?.[0];
      if (!url) return { ok: false, code: 'INVALID_METADATA', message: 'No URL to retrieve' };
      const res = await httpGet(url, { allowedHosts: FCA_ALLOWED_HOSTS, correlationId: options.correlationId });
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
      return state.checkpoint || { feedUrl: FCA_PUBLICATIONS_RSS };
    },
    health(connectorState = {}) {
      if (connectorState.mode === CONNECTOR_MODES.FIXTURE) return { status: 'Healthy', detail: 'Fixture mode' };
      if (!connectorState.lastSuccessAt) return { status: 'Not Verified', detail: 'Live verification not yet run' };
      return { status: connectorState.lastWarning ? 'Degraded' : 'Healthy' };
    },
  };
}

function inferFcaType(title, link) {
  const t = `${title} ${link}`.toLowerCase();
  if (t.includes('consultation')) return 'Consultation Paper';
  if (t.includes('policy statement') || t.includes('/ps')) return 'Policy Statement';
  if (t.includes('finalised guidance') || t.includes('/fg')) return 'Finalised Guidance';
  return 'Publication';
}

export { FIXTURE_CONNECTOR_VERSION };
