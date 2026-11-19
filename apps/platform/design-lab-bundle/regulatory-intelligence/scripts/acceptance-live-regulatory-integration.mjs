/**
 * Live regulatory integration layer — fixture mode only (no network required).
 */
import { createFreshState } from '../js/migrate.js';
import { hydrateStore } from '../js/store.js';
import { getConnectorById } from '../js/connectors/connector-registry.js';
import { CONNECTOR_MODES } from '../js/connectors/connector-base.js';
import { normalizeCanonicalUrl, urlsEquivalent } from '../js/connectors/url-normalize.js';
import { assertUrlAllowed } from '../js/connectors/url-safety.js';
import { buildDocumentIdentity } from '../js/connectors/document-identity.js';
import { fingerprintContent } from '../js/connectors/fingerprint.js';
import { classifyIngestionMatch } from '../js/ingestion-helpers.js';
import { parseHtmlDocument, validateContentType } from '../js/connectors/document-parser.js';
import { runConnectorIngestion, clearLiveVerificationData } from '../js/connectors/regulatory-ingestion-service.js';
import { CONNECTOR_ERRORS } from '../js/connectors/connector-errors.js';
import { resetRateLimiterForTests } from '../js/connectors/rate-limiter.js';
import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const arch = join(dirname(fileURLToPath(import.meta.url)), '..', 'architecture');
const fixRoot = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'regulatory');
const results = [];

function record(label, ok, reason = '') {
  results.push({ label, status: ok ? 'PASS' : `FAIL: ${reason}` });
}

async function main() {
  resetRateLimiterForTests();
  const st = createFreshState();
  hydrateStore(st);

  record('source registry', (st.regulatorySources || []).some((s) => s.sourceTrust === 'Official Regulator'));
  record('connector interface FCA', Boolean(getConnectorById('CONN-FCA-001')?.discover));
  record('connector interface PRA', Boolean(getConnectorById('CONN-PRA-001')?.discover));
  record('connector interface HMT', Boolean(getConnectorById('CONN-HMT-001')?.discover));

  const fcaDisc = await getConnectorById('CONN-FCA-001').discover({ mode: CONNECTOR_MODES.FIXTURE, limit: 2 });
  record('fixture connector discover', fcaDisc.ok && fcaDisc.items.length >= 1);

  const fcaMeta = await getConnectorById('CONN-FCA-001').discover({ mode: CONNECTOR_MODES.FIXTURE, scenario: 'duplicate-test-v1' });
  const item = fcaMeta.items[0];
  record('FCA fixture metadata', item?.reference === 'PS24/1' && item.canonicalUrl.includes('fca.org.uk'));

  const praFix = await getConnectorById('CONN-PRA-001').discover({ mode: CONNECTOR_MODES.FIXTURE, scenario: 'pra-standard' });
  record('PRA fixture', praFix.ok && praFix.items[0]?.reference === 'SS5/21');

  record('URL normalisation', urlsEquivalent(
    normalizeCanonicalUrl('https://www.fca.org.uk/path/?utm_source=x#frag'),
    normalizeCanonicalUrl('https://www.fca.org.uk/path')
  ));

  record('document identity', buildDocumentIdentity({ sourceId: 'SRC-FCA', reference: 'PS24/1' }).method === 'official_reference');

  const fp = await fingerprintContent('hello-regulatory-fixture');
  record('SHA-256 fingerprint', fp.algorithm === 'SHA-256' && fp.hash.length === 64);

  record('duplicate classification', classifyIngestionMatch(
    { sourceId: 'SRC-FCA', documentReference: 'PS24/1', documentType: 'Policy Statement', contentHash: 'abc' },
    { sourceId: 'SRC-FCA', reference: 'PS24/1', documentType: 'Policy Statement', contentHash: 'abc' }
  ).type === 'exact_duplicate');

  record('version update classification', classifyIngestionMatch(
    { sourceId: 'SRC-FCA', documentReference: 'PS24/1', documentType: 'Policy Statement', contentHash: 'a' },
    { sourceId: 'SRC-FCA', reference: 'PS24/1', documentType: 'Policy Statement', contentHash: 'b' }
  ).type === 'version_update');

  const html = readFileSync(join(fixRoot, 'fca/ps24-1-v1.html'), 'utf8');
  const parsed = parseHtmlDocument(html);
  record('HTML parsing', parsed.ok && parsed.paragraphs.length >= 1);

  const { parsePdfDocument } = await import('../js/connectors/document-parser.js');
  record('PDF parser boundary', parsePdfDocument(new Uint8Array([1, 2, 3]), 'fixture pdf text').text === 'fixture pdf text');
  record('source sections from parse', (parsed.sections || []).length >= 1);
  record('citations / headings', Boolean(parsed.sections?.[0]?.heading));

  record('checkpoint object', Boolean(getConnectorById('CONN-FCA-001').checkpoint({})));
  record('lookback config', st.sourceConnectors[0].lookbackDays >= 1);
  record('backfill documented', existsSync(join(arch, 'live-regulatory-integrations.md')));

  const badCt = validateContentType(['text/html'], 'application/octet-stream');
  record('content-type handling', !badCt.ok && badCt.code === CONNECTOR_ERRORS.CONTENT_TYPE_UNSUPPORTED);

  const malformed = await getConnectorById('CONN-FCA-001').retrieve(
    { sourceMetadata: { fixtureId: 'fca-malformed-fixture' }, title: 'x', canonicalUrl: 'https://www.fca.org.uk/x' },
    { mode: CONNECTOR_MODES.FIXTURE }
  );
  record('parser structure failure', malformed.ok && malformed.parsed?.ok === false);

  record('rate limit config', (st.platformConfig.connectorRateLimitMs || 0) >= 1000);
  record('allowlist', !assertUrlAllowed('https://evil.example.com/x', ['www.fca.org.uk']).ok);
  record('SSRF protection', !assertUrlAllowed('http://127.0.0.1/secret', ['www.fca.org.uk']).ok);
  record('source trust', st.regulatorySources.find((s) => s.id === 'SRC-FCA')?.sourceTrust === 'Official Regulator');

  const s1 = createFreshState();
  hydrateStore(s1);
  const run1 = await runConnectorIngestion(s1, { connectorId: 'CONN-FCA-001', triggeredBy: 'acceptance', modeOverride: CONNECTOR_MODES.FIXTURE, scenario: 'duplicate-test-v1', limit: 1 });
  record('ingestion run + artifacts', run1.ok && (s1.sourceArtifacts || []).length >= 1);

  const docsBefore = s1.sourceDocumentCatalog.length;
  const runDup = await runConnectorIngestion(s1, { connectorId: 'CONN-FCA-001', triggeredBy: 't2', modeOverride: CONNECTOR_MODES.FIXTURE, scenario: 'duplicate-test-v1', limit: 1 });
  record('duplicate suppression', runDup.ok && runDup.results?.some((x) => x.status === 'duplicate') && s1.sourceDocumentCatalog.length === docsBefore);

  const s2 = createFreshState();
  hydrateStore(s2);
  await runConnectorIngestion(s2, { connectorId: 'CONN-FCA-001', triggeredBy: 'v1', modeOverride: CONNECTOR_MODES.FIXTURE, scenario: 'duplicate-test-v1', limit: 1 });
  const runVer = await runConnectorIngestion(s2, { connectorId: 'CONN-FCA-001', triggeredBy: 'v2', modeOverride: CONNECTOR_MODES.FIXTURE, scenario: 'version-update-test', limit: 1 });
  record('version update', runVer.ok && runVer.results?.some((x) => x.status === 'version_update'));

  record('data origin fixture', s1.rawSourceItems.some((r) => r.dataOrigin === 'fixture'));
  const doc = s1.sourceDocumentCatalog.find((d) => d.contentHash);
  record('provenance untrusted tag', doc?.provenance?.untrustedContentTag === 'UNTRUSTED_SOURCE_CONTENT');
  record('live disabled default', !st.platformConfig.allowLiveRegulatoryVerification);

  const s3 = createFreshState();
  s3.liveVerificationStaging = [{ rawId: 'x' }];
  s3.rawSourceItems.push({ id: 'r1', dataOrigin: 'live-verification' });
  clearLiveVerificationData(s3);
  record('reset live segregation', s3.liveVerificationStaging.length === 0 && !s3.rawSourceItems.some((r) => r.dataOrigin === 'live-verification'));

  record('discovery doc', existsSync(join(arch, 'regulatory-source-discovery.md')));
  record('integration doc', existsSync(join(arch, 'live-regulatory-integrations.md')));
  record('production mode blocked', !(await getConnectorById('CONN-FCA-001').discover({ mode: CONNECTOR_MODES.PRODUCTION })).ok);

  let fail = 0;
  results.forEach((r, i) => {
    console.log(`${i + 1}. ${r.label}: ${r.status}`);
    if (!r.status.startsWith('PASS')) fail += 1;
  });
  console.log('LIVE SOURCE VERIFICATION: NOT EXECUTED (default acceptance — no network dependency)');
  console.log(fail ? `FAILED (${fail})` : 'LIVE REGULATORY INTEGRATION ACCEPTANCE PASS');
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
