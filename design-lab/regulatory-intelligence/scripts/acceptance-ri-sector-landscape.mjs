/**
 * Sector Regulatory Landscape acceptance (LAND-001–006, dropdown, regression smoke).
 */
import { chromium } from 'playwright';
import { createFreshState, SCHEMA_VERSION } from '../js/migrate.js';
import { landscapeSearch, publicationsForSector, getSectorBySlug } from '../js/landscape-helpers.js';
import { LANDSCAPE_SECTOR_NAV } from '../js/landscape-seed.js';

const BASE = 'http://localhost:3000/design-lab/regulatory-intelligence/?v=landscape-accept';
const R = {};

function pass(id, ok, reason = '') {
  R[id] = ok ? 'PASS' : `FAIL: ${reason}`;
}

async function goto(page, hash) {
  await page.goto(`${BASE}${hash}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(280);
}

async function main() {
  const fresh = createFreshState();
  pass('schema-v16', fresh.schemaVersion === SCHEMA_VERSION && SCHEMA_VERSION === 16);
  pass('sectors-12', (fresh.sectors || []).length === 12);
  pass('sector-nav-12', LANDSCAPE_SECTOR_NAV.length === 12);
  pass('frameworks-mapped', (fresh.regulatoryFrameworks || []).length >= 30);
  pass('flagship-obl-sector', (fresh.obligations.find((o) => o.id === 'OBL-0142')?.sectorIds || []).length >= 1);
  const pub001 = fresh.publications.filter((p) => p.id === 'PUB-001').length === 1;
  const maps = fresh.publicationSectorMappings.filter((m) => m.publicationId === 'PUB-001');
  pass('LAND-006-dedupe', pub001 && maps.length === 1);
  pass('LAND-006-multi-sector', maps[0]?.relatedSectorIds?.length >= 1);

  const insAct = fresh.regulatoryFrameworks.find((f) => f.id === 'FWK-INS-ACT');
  pass(
    'LAND-003-insurance-act-coverage',
    insAct?.coverageStatus === 'REFERENCE_ONLY' ||
      (insAct?.coverageStatus === 'LIVE_SOURCE' && insAct?.riSourceId === 'SRC-LEG' && insAct?.liveMonitoring)
  );
  const tpr = fresh.regulatoryFrameworks.find((f) => f.id === 'FWK-TPR-REQ');
  pass(
    'LAND-004-tpr-coverage',
    tpr?.coverageStatus === 'SOURCE_PLANNED' ||
      (tpr?.coverageStatus === 'LIVE_SOURCE' && tpr?.riSourceId === 'SRC-TPR' && tpr?.liveMonitoring)
  );
  const basel = fresh.regulatoryFrameworks.find((f) => f.id === 'FWK-BASEL');
  pass(
    'LAND-basel-coverage',
    basel?.coverageStatus === 'REFERENCE_ONLY' ||
      (basel?.coverageStatus === 'LIVE_SOURCE' && basel?.riSourceId === 'SRC-BASEL' && basel?.liveMonitoring)
  );

  const wealthFw = ['FWK-COBS', 'FWK-PROD', 'FWK-CASS', 'FWK-MIFID-DER'];
  pass(
    'LAND-002-wealth-frameworks',
    wealthFw.every((id) => fresh.regulatoryFrameworks.some((f) => f.id === id))
  );

  const search = landscapeSearch(fresh, 'COBS');
  pass('search-cobs', search.frameworks.some((f) => f.shortName === 'COBS'));

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.removeItem('forgeniq-ri-lab-v2'));

  await goto(page, '#/dashboard');
  pass('nav-landscape-trigger', (await page.locator('.ri-topnav__trigger[data-nav-group="landscape"]').count()) === 1);

  await page.click('.ri-topnav__trigger[data-nav-group="landscape"]');
  await page.waitForTimeout(150);
  const menu = page.locator('#nav-menu-landscape');
  pass('dropdown-open', await menu.isVisible());
  const menuText = await menu.innerText();
  const sectorLinks = await menu.locator('a.ri-topnav__menu-link[href^="#/landscape/"]').count();
  pass('dropdown-12-sectors', sectorLinks >= 12);
  pass('dropdown-view-all', menuText.includes('View all sectors'));

  await page.click('a.ri-topnav__menu-link[href="#/landscape/banking"]');
  await page.waitForTimeout(250);
  pass('LAND-001-route', page.url().includes('#/landscape/banking'));
  const bankingBody = await page.locator('.ri-main').innerText();
  pass('LAND-001-regulators', /PRA|FCA/i.test(bankingBody));
  pass('LAND-001-frameworks', /UK CRR|PRA Rulebook/i.test(bankingBody));
  pass('LAND-001-coverage', /LIVE|PARTIAL|PLANNED|REFERENCE/i.test(bankingBody));

  await page.click('a[href="#/landscape/framework/FWK-PRA-RB"]');
  await page.waitForTimeout(250);
  pass('LAND-001-framework-drill', page.url().includes('FWK-PRA-RB'));

  await goto(page, '#/landscape/wealth-management');
  const wealthText = await page.locator('.ri-main').innerText();
  pass('LAND-002-cobs', wealthText.includes('COBS'));
  pass('LAND-002-no-false-live-cobs', !/COBS[\s\S]{0,40}LIVE SOURCE/i.test(wealthText) || wealthText.includes('PARTIAL'));

  await goto(page, '#/landscape/insurance');
  const insText = await page.locator('.ri-main').innerText();
  pass('LAND-003-solvency', /Solvency UK/i.test(insText));

  await goto(page, '#/landscape/pension-providers');
  const pensText = await page.locator('.ri-main').innerText();
  pass('LAND-004-pensions', /Pensions Act|TPR/i.test(pensText));

  await goto(page, '#/landscape/preferences');
  await page.check('[data-my-sector="SEC-001"]');
  await page.check('[data-my-sector="SEC-003"]');
  await page.check('[data-my-sector="SEC-008"]');
  await page.click('#my-sectors-form button[type="submit"]');
  await page.waitForTimeout(400);
  await goto(page, '#/dashboard');
  pass('LAND-005-dashboard', (await page.locator('.ri-dashboard-my-sectors').innerText()).includes('Banking'));

  await goto(page, '#/landscape');
  pass('view-all-home', (await page.locator('h1').innerText()).toLowerCase().includes('sector'));

  await goto(page, '#/change/CHG-001');
  pass('flagship-change', (await page.locator('.ri-entity-hero__title').count()) >= 1);

  await goto(page, '#/dashboard');
  await page.click('.ri-topnav__trigger[data-nav-group="landscape"]');
  await page.waitForTimeout(120);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(120);
  pass('escape-closes', !(await page.locator('#nav-menu-landscape').isVisible()));

  await browser.close();

  const failed = Object.entries(R).filter(([, v]) => v.startsWith('FAIL'));
  console.log(JSON.stringify(R, null, 2));
  if (failed.length) {
    console.error('Sector landscape acceptance failures:', failed);
    process.exit(1);
  }
  console.log('Sector Regulatory Landscape acceptance: PASS');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
