import { CONNECTOR_MODES, toDiscoveryItem, defaultCapabilities } from './connector-base.js';
import { httpGet } from './http-client.js';
import { fingerprintContent } from './fingerprint.js';
import { assertUrlAllowed } from './url-safety.js';
import {
  BIS_ALLOWED_HOSTS,
  BASEL_CONNECTOR_VERSION,
  BASEL_VERIFICATION_TARGETS,
  BASEL_FRAMEWORK_ROOT,
  BASEL_USER_AGENT,
  bisCanonicalUrl,
  classifyBaselPath,
  isBaselPathAllowed,
} from './basel-constants.js';
import { parseBaselStandardHtml } from './basel-parser.js';
import { assessBaselRelevance } from './basel-relevance.js';
import { BASEL_AUTHORITY, BASEL_ORGANISATION } from './basel-constants.js';

const BASEL_HTTP = {
  allowedHosts: BIS_ALLOWED_HOSTS,
  userAgent: BASEL_USER_AGENT,
  rateLimit: { minIntervalMs: 2500, maxConcurrent: 1 },
  maxHtmlBytes: 1024 * 1024,
};

export function createBaselConnector(config = {}) {
  return {
    id: config.id || 'CONN-BASEL-001',
    sourceId: 'SRC-BASEL',
    authority: BASEL_AUTHORITY,
    organisation: BASEL_ORGANISATION,
    connectorVersion: BASEL_CONNECTOR_VERSION,
    parserVersion: 'RI-PARSER-2.0',
    allowedHosts: BIS_ALLOWED_HOSTS,
    capabilities: defaultCapabilities(),
    assertRetrievalAllowed(urlString) {
      const check = assertUrlAllowed(urlString, BIS_ALLOWED_HOSTS);
      if (!check.ok) return check;
      if (!isBaselPathAllowed(check.url.pathname)) {
        return { ok: false, code: 'PATH_NOT_ALLOWED', message: 'Path outside BCBS allowlist' };
      }
      return { ok: true, url: check.url };
    },
    async retrieveOfficialPage(pathOrUrl, options = {}) {
      if (!options.liveAllowed) return { ok: false, code: 'LIVE_NOT_ENABLED', message: 'Live not enabled' };
      const url = pathOrUrl.startsWith('http') ? pathOrUrl : bisCanonicalUrl(pathOrUrl);
      const gate = this.assertRetrievalAllowed(url);
      if (!gate.ok) return gate;
      const res = await httpGet(gate.url.toString(), { ...BASEL_HTTP, correlationId: options.correlationId });
      if (!res.ok) return res;
      const ct = (res.contentType || '').toLowerCase();
      if (!ct.includes('html') && !ct.includes('text')) {
        return { ok: false, code: 'INVALID_CONTENT_TYPE', message: `Unexpected content type: ${ct}` };
      }
      const html = new TextDecoder().decode(res.body);
      const path = new URL(res.finalUrl || url).pathname;
      const parsed = parseBaselStandardHtml(html, {
        fallbackTitle: options.fallbackTitle,
        frameworkModule: options.frameworkModule,
        path,
      });
      const fp = await fingerprintContent(res.body);
      const cls = classifyBaselPath(path);
      const rel = assessBaselRelevance({
        frameworkModule: parsed.ok ? parsed.frameworkModule : options.frameworkModule,
        documentType: cls.documentType,
        path,
      });
      return {
        ok: true,
        canonicalUrl: res.finalUrl || url,
        path,
        title: parsed.ok ? parsed.title : options.fallbackTitle || path,
        summary: parsed.ok ? (parsed.paragraphs?.[0] || '').slice(0, 280) : '',
        documentType: options.documentType || cls.documentType,
        sourceLayer: cls.sourceLayer,
        versionStatus: parsed.ok ? parsed.versionStatus : 'UNKNOWN',
        effectiveDate: parsed.ok ? parsed.effectiveDate : null,
        frameworkModule: parsed.ok ? parsed.frameworkModule : options.frameworkModule || null,
        sourceHash: fp.hash,
        hashAlgorithm: fp.algorithm,
        httpStatus: res.status,
        contentType: res.contentType,
        retrievedAt: new Date().toISOString(),
        relevanceStatus: rel.relevanceStatus,
        relevanceReason: rel.relevanceReason,
        sectorIds: rel.sectorIds,
        complianceThemeIds: rel.complianceThemeIds,
      };
    },
    async verifyTargets(options = {}) {
      const results = [];
      for (const target of BASEL_VERIFICATION_TARGETS) {
        const r = await this.retrieveOfficialPage(target.path, {
          liveAllowed: options.liveAllowed,
          correlationId: options.correlationId,
          fallbackTitle: target.title,
          frameworkModule: target.frameworkModule,
          documentType: target.documentType,
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
            { ...item, discoveryMethod: 'basel-fixture', publicationType: 'BCBS Publication' },
            {
              sourceId: 'SRC-BASEL',
              dataOrigin: 'fixture',
              sourceTrust: 'Official International Standard',
              jurisdiction: 'International',
            }
          )
        );
        return { ok: true, items };
      }
      if (!options.liveAllowed) return { ok: false, code: 'LIVE_NOT_ENABLED', message: 'Live not enabled' };
      const root = await this.retrieveOfficialPage('/committees/bcbs/basel-framework', {
        liveAllowed: true,
        correlationId: options.correlationId,
        fallbackTitle: 'Basel Framework',
      });
      if (!root.ok) return root;
      return {
        ok: true,
        items: [
          toDiscoveryItem(
            {
              title: root.title,
              link: root.canonicalUrl,
              canonicalUrl: root.canonicalUrl,
              publicationType: 'BCBS Publication',
              discoveryMethod: 'basel-framework-html',
              documentType: root.documentType,
            },
            { sourceId: 'SRC-BASEL', dataOrigin: 'live-verification', sourceTrust: 'Official International Standard', jurisdiction: 'International' }
          ),
        ],
        checkpoint: { frameworkRoot: BASEL_FRAMEWORK_ROOT, retrievedAt: new Date().toISOString() },
      };
    },
    targets: BASEL_VERIFICATION_TARGETS,
  };
}
