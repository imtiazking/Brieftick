import { toDiscoveryItem, defaultCapabilities, CONNECTOR_MODES } from './connector-base.js';
import { isNodeRuntime, loadFixtureManifestBrowser, loadFixtureHtmlBrowser } from './fixture-loader.js';
import { fingerprintContent } from './fingerprint.js';
import { parseHtmlDocument } from './document-parser.js';

export const FIXTURE_CONNECTOR_VERSION = 'FIXTURE-1.0';

export function createFixtureConnector(config) {
  return {
    id: config.id,
    sourceId: config.sourceId,
    regulator: config.regulator,
    mode: CONNECTOR_MODES.FIXTURE,
    connectorVersion: FIXTURE_CONNECTOR_VERSION,
    parserVersion: 'RI-PARSER-2.0',
    allowedHosts: [],
    capabilities: defaultCapabilities({ pdfRetrieval: true }),
    async discover(options = {}) {
      const manifest = await loadManifest();
      const items = manifest.fixtures
        .filter((f) => f.source === config.sourceId)
        .filter((f) => !options.scenario || f.scenario === options.scenario)
        .slice(0, options.limit || 50)
        .map((f) =>
          toDiscoveryItem(
            {
              externalSourceId: f.id,
              canonicalUrl: f.originalOfficialUrl,
              title: f.title,
              reference: f.reference,
              publicationType: f.publicationType,
              publishedAt: f.publishedAt,
              documentUrls: f.documentUrls,
              discoveryMethod: 'fixture',
              sourceMetadata: { fixtureId: f.id, scenario: f.scenario },
            },
            {
              sourceId: config.sourceId,
              regulatorSourceId: config.sourceId,
              dataOrigin: 'fixture',
              sourceTrust: config.sourceTrust,
            }
          )
        );
      return { ok: true, items, checkpoint: options.checkpoint || null };
    },
    async retrieve(discoveryItem, options = {}) {
      const fixtureId = discoveryItem.sourceMetadata?.fixtureId;
      const manifest = await loadManifest();
      const meta = manifest.fixtures.find((f) => f.id === fixtureId);
      if (!meta) return { ok: false, code: 'INVALID_METADATA', message: 'Fixture not found' };
      const html = await loadFixtureHtml(meta.fixtureFile);
      const fp = await fingerprintContent(html);
      const parsed = parseHtmlDocument(html, {
        requireTitle: meta.scenario === 'parser-structure-failure',
        requireContentContainer: meta.scenario === 'parser-structure-failure',
      });
      return {
        ok: true,
        mediaType: meta.contentType,
        bodyText: html,
        fingerprint: fp,
        parsed,
        fixturePath: meta.fixtureFile,
        storageMode: 'fixture-file',
      };
    },
    checkpoint() {
      return { lastSuccessfulAt: null, cursor: null };
    },
    health() {
      return { status: 'Healthy', mode: CONNECTOR_MODES.FIXTURE };
    },
  };
}

async function loadManifest() {
  if (isNodeRuntime()) {
    const node = await import('./fixture-loader-node.js');
    return node.loadFixtureManifestSync();
  }
  return loadFixtureManifestBrowser();
}

async function loadFixtureHtml(file) {
  if (isNodeRuntime()) {
    const node = await import('./fixture-loader-node.js');
    return node.loadFixtureHtmlSync(file);
  }
  return loadFixtureHtmlBrowser(file);
}
