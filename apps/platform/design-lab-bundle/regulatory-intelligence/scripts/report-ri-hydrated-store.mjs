/**
 * Report hydrated RI store counts from fresh browser context (normal app path).
 */
import { chromium } from 'playwright';

const BASE = `http://localhost:3000/design-lab/regulatory-intelligence/?v=store-report-${Date.now()}`;
const STORAGE_KEY = 'forgeniq-ri-lab-v2';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${BASE}#/admin`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);
  await page.selectOption('#demo-user-select', 'u-reed');
  await page.click('#save-demo-user');
  await page.waitForTimeout(400);
  await page.goto(`${BASE}#/ask-ri`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);

  const report = await page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    if (!raw) return { hydrated: false };
    const s = JSON.parse(raw);
    const reviewed = (s.internationalImplementationMappings || []).filter((m) => m.reviewStatus === 'REVIEWED');
    const praBoe = (s.publications || []).filter((p) => /pra|bank of england/i.test(`${p.regulator} ${p.title}`));
    return {
      hydrated: true,
      schemaVersion: s.schemaVersion,
      publications: (s.publications || []).length,
      changes: (s.changes || []).length,
      assessments: (s.assessments || []).length,
      obligations: (s.obligations || []).length,
      policies: (s.policies || []).length,
      risks: (s.risks || []).length,
      controls: (s.controls || []).length,
      sectors: (s.sectors || []).length,
      frameworks: (s.regulatoryFrameworks || []).length,
      landscapeMappings: (s.sectorFrameworkMappings || []).length,
      baselRecords: (s.baselPublicationRecords || []).length,
      praBoePublications: praBoe.length,
      tprRecords: (s.tprPublicationRecords || []).length,
      implementationMappings: (s.internationalImplementationMappings || []).length,
      reviewedMappings: reviewed.length,
      riAskHistory: (s.riAskHistory || []).length,
      hasBanking: (s.sectors || []).some((x) => x.slug === 'banking'),
      hasWealth: (s.sectors || []).some((x) => x.slug === 'wealth-management'),
      hasPension: (s.sectors || []).some((x) => x.slug === 'pension-providers'),
      hasTpr: (s.tprPublicationRecords || []).length > 0,
      hasBasel: (s.baselPublicationRecords || []).length > 0,
      hasPraBoe: praBoe.length > 0,
    };
  }, STORAGE_KEY);

  console.log(JSON.stringify(report, null, 2));
  await context.close();
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
