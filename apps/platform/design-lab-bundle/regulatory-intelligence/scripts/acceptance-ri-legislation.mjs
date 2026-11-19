/**
 * Deterministic UK legislation integration acceptance (LEG-001–006). No network.
 */
import { chromium } from 'playwright';
import { createFreshState, migrateSavedSnapshot, SCHEMA_VERSION } from '../js/migrate.js';
import { applyLegislationCoverage } from '../js/legislation-seed.js';
import { createLegislationConnector } from '../js/connectors/legislation-connector.js';
import { assertUrlAllowed } from '../js/connectors/url-safety.js';
import { LEGISLATION_ALLOWED_HOSTS, LEGISLATION_TARGET_MAP } from '../js/connectors/legislation-constants.js';
import { parseLegislationSearchFeed } from '../js/connectors/legislation-parser.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const BASE = 'http://localhost:3000/design-lab/regulatory-intelligence/?v=leg-accept';
const R = {};

function pass(id, ok, reason = '') {
  R[id] = ok ? 'PASS' : `FAIL: ${reason}`;
}

const FIXTURE_LIVE_EVIDENCE = {
  status: 'LIVE_VERIFIED',
  lastVerifiedAt: '2026-10-13T20:00:00Z',
  verifiedFrameworkIds: LEGISLATION_TARGET_MAP.map((t) => t.frameworkId),
  verifiedRecordIds: LEGISLATION_TARGET_MAP.map((t) => t.recordId),
  targetRecords: LEGISLATION_TARGET_MAP.map((t) => ({
    frameworkId: t.frameworkId,
    recordId: t.recordId,
    path: t.path,
    sourceHash: `fixture-hash-${t.recordId}`,
    canonicalUrl: `https://www.legislation.gov.uk/${t.path}`,
  })),
  feedProbe: { ok: true },
};

async function main() {
  pass('schema-v17', SCHEMA_VERSION === 17);
  const fresh = createFreshState();
  pass('records-seeded', (fresh.legislationRecords || []).length >= 7);
  pass('staging-seeded', (fresh.legislationStaging || []).length >= 1);
  pass('source-changes', (fresh.legislationSourceChanges || []).length >= 1);

  const allowOk = assertUrlAllowed('https://www.legislation.gov.uk/ukpga/2009/21/data.feed', LEGISLATION_ALLOWED_HOSTS).ok;
  const blockOk = !assertUrlAllowed('http://127.0.0.1/test', LEGISLATION_ALLOWED_HOSTS).ok;
  pass('security-allowlist', allowOk && blockOk);

  const fixtureXml = readFileSync(join(__dir, '..', 'fixtures', 'legislation', 'sample-new-feed.xml'), 'utf8');
  const parsed = parseLegislationSearchFeed(fixtureXml);
  pass('fixture-feed-parses', parsed.ok && parsed.items.length >= 1);

  const withLive = { ...fresh };
  applyLegislationCoverage(withLive, FIXTURE_LIVE_EVIDENCE);
  const psr = withLive.regulatoryFrameworks.find((f) => f.id === 'FWK-PSR');
  pass('LEG-001-psr-live', psr?.coverageStatus === 'LIVE_SOURCE' && psr?.riSourceId === 'SRC-LEG');
  const bank = withLive.regulatoryFrameworks.find((f) => f.id === 'FWK-BANK-ACT');
  pass('LEG-002-banking-act', bank?.coverageStatus === 'LIVE_SOURCE');
  const pens = withLive.regulatoryFrameworks.find((f) => f.id === 'FWK-PENS-2004');
  const tpr = withLive.regulatoryFrameworks.find((f) => f.id === 'FWK-TPR-REQ');
  pass('LEG-003-pensions-live', pens?.coverageStatus === 'LIVE_SOURCE');
  pass(
    'LEG-003-tpr-independent',
    tpr?.coverageStatus === 'SOURCE_PLANNED' ||
      (tpr?.coverageStatus === 'LIVE_SOURCE' && tpr?.riSourceId === 'SRC-TPR' && pens?.riSourceId === 'SRC-LEG')
  );

  const stage = withLive.legislationStaging[0];
  pass('LEG-004-staging', stage?.status === 'REVIEW_REQUIRED' && !stage?.autoChangeCreated && !stage?.autoObligationCreated);

  const chg = withLive.legislationSourceChanges[0];
  pass('LEG-005-hash-event', chg?.changeType === 'SOURCE_UPDATED' && chg?.reviewStatus === 'REVIEW_REQUIRED' && !chg?.legalChangeConfirmed);

  const failed = { ...fresh };
  applyLegislationCoverage(failed, { status: 'SOURCE_UNAVAILABLE', verifiedFrameworkIds: [], targetRecords: [] });
  pass('LEG-006-unavailable', failed.regulatoryFrameworks.find((f) => f.id === 'FWK-PSR')?.coverageStatus !== 'LIVE_SOURCE');

  const migrated = migrateSavedSnapshot({ schemaVersion: 11, scenarioId: 'consumer-duty', sectors: fresh.sectors });
  pass('migration-v11-v17', migrated.schemaVersion === 17 && migrated.legislationRecords?.length >= 7);
  pass('migration-v12-v13-tpr', migrateSavedSnapshot({ schemaVersion: 12, scenarioId: 'consumer-duty' }).tprPublicationRecords?.length >= 5);
  pass('migration-v13-v14-basel', migrateSavedSnapshot({ schemaVersion: 13, scenarioId: 'consumer-duty' }).baselPublicationRecords?.length >= 8);

  const dupLeg = withLive.legislationRecords.filter((r) => r.frameworkId === 'FWK-PSR');
  pass('no-dup-leg-record', dupLeg.length === 1);

  const connector = createLegislationConnector();
  pass('adapter-exists', Boolean(connector.retrieveTarget));

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.removeItem('forgeniq-ri-lab-v2'));
  await page.goto(`${BASE}#/landscape/framework/FWK-PSR`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(300);
  const body = await page.locator('.ri-main').innerText();
  pass('ui-framework-legislation-block', body.includes('legislation.gov.uk') || body.includes('Official legislation'));
  await browser.close();

  const failedTests = Object.entries(R).filter(([, v]) => v.startsWith('FAIL'));
  console.log(JSON.stringify(R, null, 2));
  if (failedTests.length) {
    console.error('Legislation acceptance failures:', failedTests);
    process.exit(1);
  }
  console.log('UK Legislation deterministic acceptance: PASS');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
