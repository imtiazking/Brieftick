#!/usr/bin/env node
/**
 * Browser smoke: Design Lab dashboard must mount (#ri-app), navigate core routes, no startup 404 modules.
 */
import { chromium } from 'playwright';

const BASE =
  process.env.DESIGN_LAB_SMOKE_BASE ||
  'http://127.0.0.1:3001/design-lab/regulatory-intelligence/index.html';

const failures = [];
let passes = 0;
const pass = (m) => {
  passes += 1;
  console.log(`PASS: ${m}`);
};
const fail = (m) => {
  failures.push(m);
  console.error(`FAIL: ${m}`);
};

async function goto(page, hash) {
  await page.goto(`${BASE}${hash}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForTimeout(400);
}

async function main() {
  const module404 = [];
  const consoleErrors = [];
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (e) => consoleErrors.push(String(e)));
  page.on('response', (res) => {
    const url = res.url();
    if (res.status() === 404 && /\/design-lab\/regulatory-intelligence\/js\//.test(url)) {
      module404.push(url);
    }
  });

  await goto(page, '#/dashboard');
  await page.evaluate(() => {
    localStorage.removeItem('forgeniq-ri-lab-v2');
    localStorage.setItem('forgeniq-ri-presentation-mode', '1');
    localStorage.setItem('forgeniq-ri-connected-mode', '0');
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);

  const mount = await page.evaluate(() => {
    const root = document.getElementById('ri-app');
    return {
      childCount: root?.childElementCount ?? 0,
      hasTopnav: !!document.querySelector('.ri-topnav'),
      hasMain: !!document.querySelector('.ri-main'),
    };
  });

  if (mount.childCount > 0) pass(`#ri-app child nodes (${mount.childCount})`);
  else fail(`#ri-app empty (childCount=${mount.childCount})`);
  if (mount.hasTopnav) pass('top navigation rendered');
  else fail('missing .ri-topnav');
  if (mount.hasMain) pass('main content region rendered');
  else fail('missing .ri-main');

  if (module404.length === 0) pass('no Design Lab js module 404 responses');
  else fail(`module 404s: ${module404.join(', ')}`);

  const blockingConsole = consoleErrors.filter(
    (e) =>
      /Failed to fetch dynamically imported module/i.test(e) ||
      /Failed to load module/i.test(e) ||
      /Unexpected token/i.test(e),
  );
  if (blockingConsole.length === 0) pass('no blocking module console errors');
  else fail(`blocking console: ${blockingConsole.slice(0, 3).join(' | ')}`);

  await goto(page, '#/library');
  const pubOk = await page.evaluate(() => {
    return (
      !!document.querySelector('.ri-main') &&
      /Publication|Library/i.test(document.body.innerText) &&
      document.getElementById('ri-app')?.childElementCount > 0
    );
  });
  if (pubOk) pass('publications library view');
  else fail('publications library did not render');

  const pubId = await page.evaluate(() => {
    const link = document.querySelector('a[href^="#/publication/"]');
    return link?.getAttribute('href') || null;
  });
  if (pubId) {
    await goto(page, pubId);
    const detailOk = await page.evaluate(() => document.getElementById('ri-app')?.childElementCount > 0);
    if (detailOk) pass('publication detail opens');
    else fail(`publication detail blank for ${pubId}`);
  } else {
    fail('no publication detail link found');
  }

  await goto(page, '#/obligations');
  const oblOk = await page.evaluate(
    () => document.getElementById('ri-app')?.childElementCount > 0 && !!document.querySelector('.ri-main'),
  );
  if (oblOk) pass('obligations register');
  else fail('obligations register did not render');

  await goto(page, '#/ai-governance');
  const aiGovOk = await page.evaluate(
    () => document.getElementById('ri-app')?.childElementCount > 0 && /AI|Governance/i.test(document.body.innerText),
  );
  if (aiGovOk) pass('AI governance page');
  else fail('AI governance page did not render');

  await browser.close();

  console.log(`acceptance-design-lab-dashboard-startup-smoke: ${passes} pass, ${failures.length} fail`);
  if (failures.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});