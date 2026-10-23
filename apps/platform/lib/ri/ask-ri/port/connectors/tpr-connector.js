import { CONNECTOR_MODES, toDiscoveryItem, defaultCapabilities } from './connector-base.js';
import { httpGet } from './http-client.js';
import { parseRegulatoryHtml } from './html-parser.js';
import { fingerprintContent } from './fingerprint.js';
import {
  TPR_ALLOWED_HOSTS,
  TPR_CONNECTOR_VERSION,
  TPR_SITEMAP,
  TPR_DOCUMENT_LIBRARY,
  TPR_USER_AGENT,
  TPR_VERIFICATION_TARGETS,
  tprCanonicalUrl,
  classifyTprPath,
  TPR_AUTHORITY,
} from './tpr-constants.js';
import { parseSitemapXml, filterTprRegulatoryUrls } from './tpr-sitemap.js';
import { assessTprRelevance } from './tpr-relevance.js';

const TPR_HTTP = {
  allowedHosts: TPR_ALLOWED_HOSTS,
  userAgent: TPR_USER_AGENT,
  rateLimit: { minIntervalMs: 2500, maxConcurrent: 1 },
  maxHtmlBytes: 768 * 1024,
};

export function createTprConnector(config = {}) {
  return {
    id: config.id || 'CONN-TPR-001',
    sourceId: 'SRC-TPR',
    authority: TPR_AUTHORITY,
    connectorVersion: TPR_CONNECTOR_VERSION,
    parserVersion: 'RI-PARSER-2.0',
    allowedHosts: TPR_ALLOWED_HOSTS,
    capabilities: defaultCapabilities(),
    async discoverSitemap(options = {}) {
      if (!options.liveAllowed) return { ok: false, code: 'LIVE_NOT_ENABLED', message: 'Live not enabled' };
      const res = await httpGet(TPR_SITEMAP, { ...TPR_HTTP, correlationId: options.correlationId });
      if (!res.ok) return res;
      const parsed = parseSitemapXml(new TextDecoder().decode(res.body));
      if (!parsed.ok) return parsed;
      const filtered = filterTprRegulatoryUrls(parsed.urls, options.limit || 30);
      return { ok: true, urls: filtered, totalInSitemap: parsed.urls.length };
    },
    async retrieveOfficialPage(pathOrUrl, options = {}) {
      if (!options.liveAllowed) return { ok: false, code: 'LIVE_NOT_ENABLED', message: 'Live not enabled' };
      const url = pathOrUrl.startsWith('http') ? pathOrUrl : tprCanonicalUrl(pathOrUrl);
      const res = await httpGet(url, { ...TPR_HTTP, correlationId: options.correlationId });
      if (!res.ok) return res;
      const ct = (res.contentType || '').toLowerCase();
      if (!ct.includes('html') && !ct.includes('text')) {
        return { ok: false, code: 'INVALID_CONTENT_TYPE', message: `Unexpected content type: ${ct}` };
      }
      const html = new TextDecoder().decode(res.body);
      const parsed = parseRegulatoryHtml(html, { fallbackTitle: options.fallbackTitle });
      const fp = await fingerprintContent(res.body);
      const path = new URL(res.finalUrl || url).pathname;
      const cls = classifyTprPath(path);
      const rel = assessTprRelevance({ title: parsed.ok ? parsed.title : '', path, ...cls });
      return {
        ok: true,
        canonicalUrl: res.finalUrl || url,
        path,
        title: parsed.ok ? parsed.title : options.fallbackTitle || path,
        summary: parsed.ok ? (parsed.paragraphs?.[0] || '').slice(0, 280) : '',
        documentType: cls.documentType,
        legalSourceType: cls.legalSourceType,
        sourceHash: fp.hash,
        hashAlgorithm: fp.algorithm,
        httpStatus: res.status,
        contentType: res.contentType,
        retrievedAt: new Date().toISOString(),
        relevanceStatus: rel.relevanceStatus,
        relevanceReason: rel.relevanceReason,
      };
    },
    async verifyTargets(options = {}) {
      const results = [];
      for (const target of TPR_VERIFICATION_TARGETS) {
        const r = await this.retrieveOfficialPage(target.path, {
          liveAllowed: options.liveAllowed,
          correlationId: options.correlationId,
          fallbackTitle: target.title,
        });
        results.push({ target, result: r });
      }
      const ok = results.every((x) => x.result.ok);
      return { ok, results };
    },
    async discover(options = {}) {
      const mode = options.mode || CONNECTOR_MODES.FIXTURE;
      if (mode === CONNECTOR_MODES.FIXTURE) {
        const items = (options.fixtureItems || []).map((item) =>
          toDiscoveryItem(
            { ...item, discoveryMethod: 'tpr-fixture', publicationType: 'TPR Publication' },
            { sourceId: 'SRC-TPR', dataOrigin: 'fixture', sourceTrust: 'Official UK Regulator', jurisdiction: 'United Kingdom' }
          )
        );
        return { ok: true, items };
      }
      if (!options.liveAllowed) return { ok: false, code: 'LIVE_NOT_ENABLED', message: 'Live not enabled' };
      const sm = await this.discoverSitemap({ ...options, limit: 5 });
      if (!sm.ok) return sm;
      const items = [];
      for (const url of sm.urls.slice(0, options.limit || 3)) {
        const path = new URL(url).pathname;
        const page = await this.retrieveOfficialPage(path, { liveAllowed: true, correlationId: options.correlationId });
        if (!page.ok) continue;
        items.push(
          toDiscoveryItem(
            {
              title: page.title,
              link: page.canonicalUrl,
              canonicalUrl: page.canonicalUrl,
              publishedAt: null,
              publicationType: 'TPR Publication',
              discoveryMethod: 'tpr-sitemap-html',
              documentType: page.documentType,
              relevanceStatus: page.relevanceStatus,
              relevanceReason: page.relevanceReason,
            },
            { sourceId: 'SRC-TPR', dataOrigin: 'live-verification', sourceTrust: 'Official UK Regulator', jurisdiction: 'United Kingdom' }
          )
        );
      }
      return {
        ok: items.length > 0,
        items,
        checkpoint: { documentLibrary: TPR_DOCUMENT_LIBRARY, sitemap: TPR_SITEMAP, retrievedAt: new Date().toISOString() },
      };
    },
    targets: TPR_VERIFICATION_TARGETS,
  };
}
