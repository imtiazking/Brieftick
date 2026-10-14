import { toDiscoveryItem, defaultCapabilities, CONNECTOR_MODES } from './connector-base.js';
import { httpGet } from './http-client.js';
import { parseXmlFeed } from './document-parser.js';
import { normalizeCanonicalUrl } from './url-normalize.js';
import { createFixtureConnector } from './fixture-connector.js';

export const PRA_CONNECTOR_VERSION = 'PRA-BOE-RSS-1.0';
export const BOE_PUBLICATIONS_RSS = 'https://www.bankofengland.co.uk/rss/publications';
/** Fallback when publications RSS has no PRA-scoped items in the current window (official BoE news feed). */
export const BOE_NEWS_RSS = 'https://www.bankofengland.co.uk/rss/news';
export const PRA_ALLOWED_HOSTS = ['www.bankofengland.co.uk', 'bankofengland.co.uk'];

export function createPraConnector(config = {}) {
  const fixtureDelegate = createFixtureConnector({
    id: config.id || 'CONN-PRA-001',
    sourceId: 'SRC-PRA',
    regulator: 'PRA',
    sourceTrust: 'Official Regulator',
  });

  return {
    id: config.id || 'CONN-PRA-001',
    sourceId: 'SRC-PRA',
    regulator: 'PRA',
    regulatoryIdentity: 'PRA',
    hostOrganisation: 'Bank of England',
    connectorVersion: PRA_CONNECTOR_VERSION,
    parserVersion: 'RI-PARSER-2.0',
    allowedHosts: PRA_ALLOWED_HOSTS,
    discoveryFeedUrl: BOE_PUBLICATIONS_RSS,
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
      const limit = Math.min(options.limit || 3, 5);
      let feedUrl = BOE_PUBLICATIONS_RSS;
      let discoveryMethod = 'boe-publications-rss-pra-filter';
      let res = await httpGet(BOE_PUBLICATIONS_RSS, {
        allowedHosts: PRA_ALLOWED_HOSTS,
        correlationId: options.correlationId,
        rateLimit: { minIntervalMs: 3000, maxConcurrent: 1 },
      });
      if (!res.ok) return res;
      let feed = parseXmlFeed(new TextDecoder().decode(res.body));
      if (!feed.ok) return feed;
      let filtered = feed.items.filter((item) => isPraPublicationItem(item));
      if (!filtered.length) {
        feedUrl = BOE_NEWS_RSS;
        discoveryMethod = 'boe-news-rss-pra-filter';
        res = await httpGet(BOE_NEWS_RSS, {
          allowedHosts: PRA_ALLOWED_HOSTS,
          correlationId: options.correlationId,
          rateLimit: { minIntervalMs: 3000, maxConcurrent: 1 },
        });
        if (!res.ok) return res;
        feed = parseXmlFeed(new TextDecoder().decode(res.body));
        if (!feed.ok) return feed;
        filtered = feed.items.filter((item) => isPraNewsItem(item));
      }
      const items = filtered
        .slice(0, limit)
        .map((item) =>
          toDiscoveryItem(
            {
              ...item,
              canonicalUrl: normalizeCanonicalUrl(item.link),
              publicationType: inferPraType(item.title, item.link),
              discoveryMethod,
              sourceMetadata: { regulatoryIdentity: 'PRA', host: 'Bank of England' },
            },
            {
              sourceId: 'SRC-PRA',
              dataOrigin: 'live-verification',
              sourceTrust: 'Official Regulator',
            }
          )
        );
      return {
        ok: true,
        items,
        checkpoint: { feedUrl, retrievedAt: new Date().toISOString(), examinedCount: feed.items.length },
      };
    },
    async retrieve(item, options = {}) {
      const mode = options.mode || CONNECTOR_MODES.FIXTURE;
      if (mode === CONNECTOR_MODES.FIXTURE) return fixtureDelegate.retrieve(item, options);
      if (!options.liveAllowed) return { ok: false, code: 'LIVE_NOT_ENABLED', message: 'Live retrieval not enabled' };
      const url = item.canonicalUrl;
      const res = await httpGet(url, { allowedHosts: PRA_ALLOWED_HOSTS, correlationId: options.correlationId });
      if (!res.ok) return res;
      return { ok: true, mediaType: res.contentType, body: res.body, finalUrl: res.finalUrl, storageMode: 'live-verification-metadata-only' };
    },
    checkpoint(state = {}) {
      return state.checkpoint || { feedUrl: BOE_PUBLICATIONS_RSS };
    },
    health(connectorState = {}) {
      if (connectorState.mode === CONNECTOR_MODES.FIXTURE) return { status: 'Healthy', detail: 'Fixture mode' };
      if (!connectorState.lastSuccessAt) return { status: 'Not Verified', detail: 'Live verification not yet run' };
      return { status: connectorState.lastWarning ? 'Degraded' : 'Healthy' };
    },
  };
}

/** PRA policy/consultation/supervisory publications (excludes routine BoE market/statistical releases). */
export function isPraPublicationItem(item) {
  const link = (item.link || '').toLowerCase();
  const title = (item.title || '').toLowerCase();
  if (link.includes('/weekly-report/') || link.includes('/monetary-policy/') || link.includes('/bank-liabilities-survey/')) {
    return false;
  }
  if (link.includes('/prudential-regulation/')) return true;
  if (/\/(policy-statement|supervisory-statement|consultation-paper)\//.test(link)) return true;
  if (/\/(ps|ss|cp)\d{1,5}(\/|$|-)/i.test(link)) return true;
  if (title.includes('supervisory statement') || title.includes('prudential regulation')) return true;
  return false;
}

/** PRA regulatory news announcements (official BoE news feed; not general monetary policy). */
export function isPraNewsItem(item) {
  const link = (item.link || '').toLowerCase();
  const title = item.title || '';
  if (link.includes('/monetary-policy/')) return false;
  if (/^PRA\s/i.test(title) || /^PRA and FCA/i.test(title)) return true;
  if (link.includes('/prudential-regulation/')) return true;
  return false;
}

function inferPraType(title, link) {
  const t = `${title} ${link}`.toLowerCase();
  if (t.includes('supervisory statement') || t.includes('/ss')) return 'Supervisory Statement';
  if (t.includes('policy statement') || t.includes('/ps')) return 'Policy Statement';
  if (t.includes('consultation')) return 'Consultation Paper';
  return 'Publication';
}
