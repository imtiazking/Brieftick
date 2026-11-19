/**
 * FORGENIQ RI / MI product branding acceptance (Design Lab shell only).
 */
import { chromium } from 'playwright';

const BASE = 'http://localhost:3000/design-lab/regulatory-intelligence/?v=brand-accept';
const MI = 'http://localhost:3000/';
const R = {};

function pass(n, ok, reason = '') {
  R[n] = ok ? 'PASS' : `FAIL: ${reason}`;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  const brand = await page.locator('.ri-brand').first().textContent();
  pass(1, brand?.trim() === 'FORGENIQ');

  const btn = await page.locator('#product-menu-btn').innerText();
  pass(2, btn.includes('RI') && btn.includes('Regulatory Intelligence'));
  await page.click('#product-menu-btn');
  await page.waitForTimeout(150);
  const menu = await page.locator('#product-menu').innerText();
  pass(3, menu.includes('RI') && menu.includes('Regulatory Intelligence'));
  pass(4, menu.includes('MI') && menu.includes('Market Intelligence'));
  pass(5, (await page.locator('#product-menu a.is-current').count()) === 1);
  pass(6, (await page.locator('.ri-lab-pill').textContent())?.includes('Design Lab'));
  pass(7, (await page.locator('.ri-topnav').count()) === 1);
  pass(8, (await page.locator('.ri-nav').count()) === 0);

  const title = await page.title();
  pass(9, title.includes('FORGENIQ RI') && title.includes('Regulatory Intelligence'));

  for (const [n, w] of [[10, 1440], [11, 1280], [12, 1024]]) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    pass(n, (await page.locator('.ri-topnav').count()) === 1);
  }

  await page.setViewportSize({ width: 1024, height: 900 });
  await page.goto(BASE);
  const btn1024 = await page.locator('#product-menu-btn').innerText();
  pass(13, btn1024.includes('RI'));

  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.locator('#product-menu-btn').focus();
  pass(14, await page.evaluate(() => document.activeElement?.id === 'product-menu-btn'));
  await page.keyboard.press('Enter');
  await page.waitForTimeout(120);
  pass(15, await page.locator('#product-menu').isVisible(), 'keyboard open menu');

  const miHref = await page.locator('#product-menu a[href="/"]').getAttribute('href');
  pass(16, miHref === '/');

  const miPage = await browser.newPage();
  await miPage.goto(MI, { waitUntil: 'domcontentloaded' });
  const miHtml = await miPage.content();
  pass(17, !miHtml.includes('RI · Regulatory Intelligence') && !miHtml.includes('FORGENIQ RI —'));
  pass(18, errors.length === 0, errors.join('; '));

  await browser.close();
  const failed = Object.entries(R).filter(([, v]) => v.startsWith('FAIL'));
  console.log(JSON.stringify(R, null, 2));
  if (failed.length) {
    console.error(failed);
    process.exit(1);
  }
  console.log('Branding acceptance: PASS');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
