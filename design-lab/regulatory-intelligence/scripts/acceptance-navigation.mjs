/**
 * RI horizontal navigation acceptance (post sidebar removal).
 */
import { chromium } from 'playwright';

const BASE = 'http://localhost:3000/design-lab/regulatory-intelligence/?v=nav-accept';
const WIDTHS = [1440, 1280, 1024];
const R = {};

function pass(n, ok, reason = '') {
  R[n] = ok ? 'PASS' : `FAIL: ${reason}`;
}

async function goto(page, hash) {
  await page.goto(`${BASE}${hash}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(300);
}

async function overflowMain(page) {
  return page.evaluate(() => {
    const main = document.querySelector('.ri-main');
    if (!main) return 0;
    return Math.max(0, main.scrollWidth - main.clientWidth);
  });
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.removeItem('forgeniq-ri-lab-v2'));

  pass(1, (await page.locator('.ri-nav').count()) === 0, 'sidebar still present');
  pass(2, (await page.locator('.ri-topnav').count()) === 1);

  await goto(page, '#/dashboard');
  pass(3, page.url().includes('#/dashboard'));
  await page.click('a.ri-topnav__link[href="#/intake"]');
  await page.waitForTimeout(200);
  pass(4, page.url().includes('#/intake'));
  await page.click('.ri-topnav__trigger[data-nav-group="changes"]');
  await page.waitForTimeout(150);
  await page.click('a.ri-topnav__menu-link[href="#/changes"]');
  await page.waitForTimeout(200);
  pass(5, page.url().includes('#/changes'));
  await page.click('.ri-topnav__trigger[data-nav-group="work"]');
  await page.waitForTimeout(150);
  await page.click('a.ri-topnav__menu-link[href="#/work"]');
  await page.waitForTimeout(200);
  pass(6, page.url().includes('#/work'));

  await goto(page, '#/dashboard');
  await page.click('.ri-topnav__trigger[data-nav-group="governance"]');
  await page.waitForTimeout(150);
  pass(7, await page.locator('#nav-menu-governance').isVisible());
  await page.click('a.ri-topnav__menu-link[href="#/governance"]');
  await page.waitForTimeout(200);
  pass(8, page.url().includes('#/governance'));

  await goto(page, '#/reports/board');
  const reportsTrigger = page.locator('.ri-topnav__trigger[data-nav-group="reports"]');
  pass(9, (await reportsTrigger.getAttribute('class'))?.includes('is-active'));
  await page.click('.ri-topnav__trigger[data-nav-group="operations"]');
  await page.waitForTimeout(150);
  await page.click('a.ri-topnav__menu-link[href="#/ingestion"]');
  await page.waitForTimeout(200);
  pass(10, page.url().includes('#/ingestion'));

  await goto(page, '#/admin/sources');
  pass(11, (await page.locator('.ri-topnav__trigger[data-nav-group="admin"]').getAttribute('class'))?.includes('is-active'));

  await goto(page, '#/approval/AC-CHG-001');
  pass(12, (await page.locator('.ri-topnav__trigger[data-nav-group="governance"]').getAttribute('class'))?.includes('is-active'));

  await goto(page, '#/dashboard');
  await page.keyboard.press('Tab');
  pass(13, await page.evaluate(() => {
    const el = document.activeElement;
    return el && (el.matches('.ri-topnav__link, .ri-topnav__trigger, a, button, select'));
  }));

  for (const w of WIDTHS) {
    await page.setViewportSize({ width: w, height: 900 });
    await goto(page, '#/dashboard');
    const ox = await overflowMain(page);
    pass(w === 1440 ? 14 : w === 1280 ? 15 : 16, ox <= 4, `overflow=${ox}`);
    pass(w === 1440 ? 17 : w === 1280 ? 18 : 19, (await page.locator('.ri-nav').count()) === 0);
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await goto(page, '#/dashboard');
  const heroBox = await page.locator('.ri-page-head h1').first().boundingBox();
  const mainBox = await page.locator('.ri-main').boundingBox();
  pass(20, heroBox && mainBox && heroBox.width > 280, 'hero clipped');
  await goto(page, '#/change/CHG-001');
  pass(21, (await page.locator('.ri-entity-hero__title').count()) === 1);
  await goto(page, '#/reports/board');
  const boardText = await page.locator('body').innerText();
  pass(22, boardText.includes('BOARD') || boardText.includes('Board'));
  await goto(page, '#/ingestion/live-verification');
  pass(23, page.url().includes('live-verification'));

  pass(24, errors.length === 0, errors.join('; '));

  await browser.close();

  const failed = Object.entries(R).filter(([, v]) => v.startsWith('FAIL'));
  console.log(JSON.stringify(R, null, 2));
  if (failed.length) {
    console.error('Navigation acceptance failures:', failed);
    process.exit(1);
  }
  console.log('Navigation acceptance: PASS');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
