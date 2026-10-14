/**
 * Deterministic TPR acceptance (TPR-001–006). No network.
 */
import { chromium } from 'playwright';
import { createFreshState, migrateSavedSnapshot, SCHEMA_VERSION } from '../js/migrate.js';
import { applyTprCoverage } from '../js/tpr-seed.js';
import { createTprConnector } from '../js/connectors/tpr-connector.js';
import { assertUrlAllowed } from '../js/connectors/url-safety.js';
import { TPR_ALLOWED_HOSTS } from '../js/connectors/tpr-constants.js';
import { parseSitemapXml, filterTprRegulatoryUrls } from '../js/connectors/tpr-sitemap.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const BASE = 'http://localhost:3000/design-lab/regulatory-intelligence/?v=tpr-accept';
const R = {};

function pass(id, ok, reason = '') {
  R[id] = ok ? 'PASS' : `FAIL: ${reason}`;
}

const FIXTURE_LIVE = {
  status: 'LIVE_VERIFIED',
  lastVerifiedAt: '2026-10-13T21:00:00Z',
  verifiedFrameworkIds: ['FWK-TPR-REQ', 'FWK-TPR-GCOP'],
  verifiedRecordIds: ['TPR-TGT-CODE-INDEX', 'TPR-TGT-CODE-MODULE'],
  targetRecords: [
    { tprRecordId: 'TPR-TGT-CODE-INDEX', sourceHash: 'fixture-hash-code' },
    { tprRecordId: 'TPR-TGT-CODE-MODULE', sourceHash: 'fixture-hash-module' },
  ],
  sourceFamiliesVerified: ['TPR_CODE', 'TPR_GUIDANCE'],
};

async function main() {
  pass('schema-v16', SCHEMA_VERSION === 16);
  const fresh = createFreshState();
  pass('tpr-records', (fresh.tprPublicationRecords || []).length >= 5);
  pass('allowlist', assertUrlAllowed('https://www.thepensionsregulator.gov.uk/document-library', TPR_ALLOWED_HOSTS).ok);
  pass('block-local', !assertUrlAllowed('http://127.0.0.1/', TPR_ALLOWED_HOSTS).ok);

  const sm = parseSitemapXml(readFileSync(join(__dir, '..', 'fixtures', 'tpr', 'sample-sitemap.xml'), 'utf8'));
  pass('sitemap-fixture', sm.ok && filterTprRegulatoryUrls(sm.urls, 10).length >= 1);

  const live = { ...fresh };
  applyTprCoverage(live, FIXTURE_LIVE);
  pass('TPR-001-code', live.regulatoryFrameworks.find((f) => f.id === 'FWK-TPR-GCOP')?.coverageStatus === 'LIVE_SOURCE');
  pass('TPR-001-tpr-req', live.regulatoryFrameworks.find((f) => f.id === 'FWK-TPR-REQ')?.coverageStatus === 'LIVE_SOURCE');
  const codeRec = live.tprPublicationRecords.find((r) => r.tprRecordId === 'TPR-TGT-CODE-MODULE');
  pass('TPR-001-legal-ref', (codeRec?.legalReferences || []).some((l) => l.recordId === 'LEG-UKPGA-2004-35'));

  const st = live.tprStaging[0];
  pass('TPR-002-staging', st?.status === 'REVIEW_REQUIRED' && !st.autoChangeCreated && !st.autoObligationCreated);

  const resp = live.tprStaging.find((x) => x.documentType === 'TPR_CONSULTATION_RESPONSE');
  pass('TPR-003-response', resp?.linkedConsultationId === 'TPR-STAGE-001');

  const chg = live.tprSourceChanges[0];
  pass('TPR-004-change', chg?.changeType === 'CODE_UPDATED' && !chg.regulatoryRequirementChanged);

  const leg = live.legislationRecords.find((r) => r.id === 'LEG-UKPGA-2004-35');
  pass('TPR-005-trace', Boolean(leg) && codeRec?.legalReferences?.length);

  const down = { ...fresh };
  applyTprCoverage(down, { status: 'SOURCE_UNAVAILABLE', verifiedFrameworkIds: [], targetRecords: [] });
  pass('TPR-006-unavailable', down.regulatoryFrameworks.find((f) => f.id === 'FWK-TPR-REQ')?.coverageStatus === 'SOURCE_PLANNED');

  pass('migration-v12-v16', migrateSavedSnapshot({ schemaVersion: 12, scenarioId: 'consumer-duty' }).schemaVersion === 16);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(`${BASE}#/landscape/pension-providers`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(350);
  const body = await page.locator('.ri-main').innerText();
  pass('ui-pension-provenance', body.includes('Legislation') && body.includes('TPR'));
  await browser.close();

  const failed = Object.entries(R).filter(([, v]) => v.startsWith('FAIL'));
  console.log(JSON.stringify(R, null, 2));
  if (failed.length) {
    console.error('TPR acceptance failures:', failed);
    process.exit(1);
  }
  console.log('TPR deterministic acceptance: PASS');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
