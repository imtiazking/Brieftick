/**
 * Visual structure acceptance — typography, headers, lifecycle, responsive overflow.
 * Run: node design-lab/regulatory-intelligence/scripts/acceptance-visual.mjs
 */
import { chromium } from 'playwright';

const BASE = 'http://localhost:3000/design-lab/regulatory-intelligence/?v=visual-accept';
const WIDTHS = [1440, 1280, 1024];
const results = { responsive: {} };

function pass(name, ok, reason = '') {
  results[name] = ok ? 'PASS' : `FAIL: ${reason}`;
}

async function goto(page, hash) {
  await page.goto(`${BASE}${hash}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(280);
}

async function overflowX(page) {
  return page.evaluate(() => {
    const main = document.querySelector('.ri-main');
    if (main) return Math.max(0, main.scrollWidth - main.clientWidth);
    const doc = document.documentElement;
    return Math.max(0, doc.scrollWidth - doc.clientWidth);
  });
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.removeItem('forgeniq-ri-lab-v2'));
  await page.selectOption('#scenario-select', 'consumer-duty').catch(() => {});

  await goto(page, '#/dashboard');
  pass('no_sidebar', (await page.locator('.ri-nav').count()) === 0);
  pass('topnav_present', (await page.locator('.ri-topnav').count()) === 1);
  const dashH1 = await page.locator('.ri-page-head h1').first().textContent();
  pass('dashboard_editorial_headline', Boolean(dashH1 && dashH1.length > 8));
  pass('dashboard_intel_label', (await page.locator('.ri-intel-label').count()) >= 1);
  pass('dashboard_priority_metrics', (await page.locator('.ri-priority-metrics .ri-metric').count()) >= 3);

  await goto(page, '#/change/CHG-001');
  pass('chg_entity_hero', (await page.locator('.ri-entity-hero__title').count()) === 1);
  pass('chg_lifecycle_flow', (await page.locator('.ri-lifecycle__item').count()) >= 5);
  pass('chg_trace_flow', (await page.locator('.ri-trace-flow').count()) === 1);
  pass('chg_ai_lane', (await page.locator('#lane-ai-CHG-001').count()) === 1);
  pass('chg_human_lane', (await page.locator('#lane-human-CHG-001').count()) === 1);

  await goto(page, '#/publication/PUB-001/source');
  pass('source_reading_layout', (await page.locator('.ri-source-read').count()) === 1);
  pass('source_body_size', await page.evaluate(() => {
    const p = document.querySelector('.ri-source-para');
    if (!p) return false;
    const fs = parseFloat(getComputedStyle(p).fontSize);
    return fs >= 15;
  }));

  await goto(page, '#/assurance');
  pass('assurance_opinion_block', (await page.locator('.ri-exec-summary').count()) >= 1);

  await goto(page, '#/reports/board');
  pass('board_exec_summary', (await page.locator('.ri-exec-summary').count()) >= 1);
  pass('board_section_headers', (await page.locator('.ri-section-head').count()) >= 3);

  await goto(page, '#/ingestion/live-verification');
  const lv = await page.locator('.ri-live-verify-banner').textContent();
  pass('live_verification_banner', lv?.includes('LIVE SOURCE VERIFICATION'));

  await goto(page, '#/admin/sources');
  const src = await page.locator('.ri-table').textContent();
  pass('live_fca_pra_labels', src?.includes('LIVE VERIFIED') && src?.includes('Manual'));

  await goto(page, '#/dashboard');
  await page.keyboard.press('Tab');
  const fv = await page.evaluate(() => {
    const el = document.activeElement;
    if (!el) return false;
    const s = getComputedStyle(el);
    return s.outlineWidth !== '0px' || s.boxShadow !== 'none';
  });
  pass('focus_visible', fv);

  for (const w of WIDTHS) {
    await page.setViewportSize({ width: w, height: 900 });
    const routes = ['#/dashboard', '#/change/CHG-001', '#/publication/PUB-001', '#/work', '#/assurance', '#/reports/board', '#/ingestion'];
    let ok = true;
    for (const h of routes) {
      await goto(page, h);
      const ox = await overflowX(page);
      if (ox > 4) ok = false;
    }
    results.responsive[w] = ok ? 'PASS' : 'FAIL: horizontal overflow';
  }

  pass('console_clean', errors.length === 0, errors.slice(0, 3).join(' | '));

  await browser.close();

  let failed = Object.entries(results).filter(([k, v]) => k !== 'responsive' && v.startsWith('FAIL'));
  failed = failed.concat(
    Object.entries(results.responsive).filter(([, v]) => v.startsWith('FAIL')).map(([k, v]) => [`responsive_${k}`, v])
  );

  console.log(JSON.stringify(results, null, 2));
  if (failed.length) {
    console.error('Visual acceptance failures:', failed);
    process.exit(1);
  }
  console.log('Visual acceptance: PASS');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
