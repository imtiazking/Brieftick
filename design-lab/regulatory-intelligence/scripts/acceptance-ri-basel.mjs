/**
 * Deterministic Basel / BIS acceptance (BAS-001–006). No network.
 */
import { chromium } from 'playwright';
import { createFreshState, migrateSavedSnapshot, SCHEMA_VERSION } from '../js/migrate.js';
import { applyBaselCoverage } from '../js/basel-seed.js';
import { createBaselConnector } from '../js/connectors/basel-connector.js';
import { assertUrlAllowed } from '../js/connectors/url-safety.js';
import { BIS_ALLOWED_HOSTS, isBaselPathAllowed } from '../js/connectors/basel-constants.js';
import { parseBaselStandardHtml } from '../js/connectors/basel-parser.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const BASE = 'http://localhost:3000/design-lab/regulatory-intelligence/?v=basel-accept';
const R = {};

function pass(id, ok, reason = '') {
  R[id] = ok ? 'PASS' : `FAIL: ${reason}`;
}

const FIXTURE_LIVE = {
  status: 'LIVE_VERIFIED',
  lastVerifiedAt: '2026-10-13T22:00:00Z',
  verifiedFrameworkIds: ['FWK-BASEL'],
  verifiedRecordIds: ['BAS-TGT-FW-ROOT', 'BAS-TGT-CAP', 'BAS-TGT-OPE'],
  targetRecords: [
    { baselRecordId: 'BAS-TGT-CAP', sourceHash: 'fixture-basel-cap', versionStatus: 'CURRENT' },
    { baselRecordId: 'BAS-TGT-OPE', sourceHash: 'fixture-basel-ope', versionStatus: 'CURRENT' },
  ],
  sourceFamiliesVerified: ['INTERNATIONAL_STANDARD', 'FINAL_STANDARD'],
};

async function main() {
  pass('schema-v16', SCHEMA_VERSION === 16);
  const fresh = createFreshState();
  pass('basel-records', (fresh.baselPublicationRecords || []).length >= 8);
  pass('implementation-mappings', (fresh.internationalImplementationMappings || []).length >= 1);
  pass('allowlist', assertUrlAllowed('https://www.bis.org/committees/bcbs/basel-framework', BIS_ALLOWED_HOSTS).ok);
  pass('block-local', !assertUrlAllowed('http://127.0.0.1/', BIS_ALLOWED_HOSTS).ok);
  pass('path-allow', isBaselPathAllowed('/committees/bcbs/basel-framework/standard/cap'));
  pass('path-block', !isBaselPathAllowed('/statistics/'));

  const fixtureHtml = readFileSync(join(__dir, '..', 'fixtures', 'basel', 'sample-cap.html'), 'utf8');
  const parsed = parseBaselStandardHtml(fixtureHtml, { frameworkModule: 'CAP', path: '/committees/bcbs/basel-framework/standard/cap' });
  pass('parser-fixture', parsed.ok && parsed.frameworkModule === 'CAP');

  const live = { ...fresh };
  applyBaselCoverage(live, FIXTURE_LIVE);
  pass('BAS-001-framework', live.regulatoryFrameworks.find((f) => f.id === 'FWK-BASEL')?.coverageStatus === 'LIVE_SOURCE');
  const cap = live.baselPublicationRecords.find((r) => r.baselRecordId === 'BAS-TGT-CAP');
  pass('BAS-001-module', cap?.frameworkModule === 'CAP' && cap?.sourceLayer === 'INTERNATIONAL_PRUDENTIAL_STANDARD');

  const future = live.baselStaging.find((s) => s.versionStatus === 'FUTURE');
  pass('BAS-002-future', future?.status === 'REVIEW_REQUIRED' && !future?.autoObligationCreated);

  const consult = live.baselStaging.find((s) => s.documentType === 'CONSULTATIVE_DOCUMENT');
  pass('BAS-003-consultation', consult?.status === 'REVIEW_REQUIRED' && !consult?.autoChangeCreated);

  const map = live.internationalImplementationMappings[0];
  const pub = live.publications.find((p) => p.id === map?.praPublicationId);
  pass('BAS-004-trace', map?.reviewStatus === 'REVIEWED' && pub?.regulator === 'PRA' && map?.linkedRiChangeId === 'CHG-010');

  const chg = live.baselSourceChanges[0];
  pass('BAS-005-change', chg?.changeType === 'CHAPTER_UPDATED' && !chg.regulatoryRequirementChanged);

  const down = { ...fresh };
  applyBaselCoverage(down, { status: 'SOURCE_UNAVAILABLE', verifiedFrameworkIds: [], targetRecords: [] });
  pass('BAS-006-unavailable', down.regulatoryFrameworks.find((f) => f.id === 'FWK-BASEL')?.coverageStatus !== 'LIVE_SOURCE');

  pass('migration-v13-v16', migrateSavedSnapshot({ schemaVersion: 13, scenarioId: 'consumer-duty' }).schemaVersion === 16);

  const connector = createBaselConnector();
  pass('adapter-exists', Boolean(connector.verifyTargets));

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(`${BASE}#/landscape/banking`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(350);
  const body = await page.locator('.ri-main').innerText();
  pass('ui-banking-provenance', body.includes('International') && body.includes('UK'));
  await browser.close();

  const failed = Object.entries(R).filter(([, v]) => v.startsWith('FAIL'));
  console.log(JSON.stringify(R, null, 2));
  if (failed.length) {
    console.error('Basel acceptance failures:', failed);
    process.exit(1);
  }
  console.log('Basel deterministic acceptance: PASS');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
