/**
 * Browser acceptance for AI Summary 5A (requires serve on :3000).
 */
import { chromium } from 'playwright';

const BASE = 'http://localhost:3000/design-lab/regulatory-intelligence/?v=ai-5a-browser';
const R = {};

function pass(id, ok, reason = '') {
  R[id] = ok ? 'PASS' : `FAIL: ${reason}`;
}

async function main() {
  const errors = [];
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  await page.goto(`${BASE}#/publication/PUB-001`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);

  pass('ai-summary-panel', (await page.locator('[data-ai-summary-panel]').count()) === 1);
  pass('generate-button', (await page.locator('[data-ai-summary-generate]').count()) === 1);

  await page.click('[data-ai-summary-generate]');
  await page.waitForTimeout(2500);

  const body = await page.locator('[data-ai-summary-result]').innerText();
  pass('ai-fixture-label', body.includes('AI FIXTURE'));
  pass('human-review-required', body.includes('HUMAN_REVIEW_REQUIRED'));
  pass('evidence-confidence', /Evidence confidence/i.test(body));
  pass('citations-section', body.includes('SOURCE EVIDENCE'));
  pass('no-live-label', !body.includes('AI LIVE'));
  pass('history-list', (await page.locator('[data-ai-summary-panel] ul li').count()) >= 1);
  pass('xss-inert', !body.includes('<script>') && !(await page.evaluate(() => typeof window.__xssAi === 'function')));

  await page.click('[data-ai-summary-accept]');
  await page.waitForTimeout(800);
  const afterAccept = await page.locator('[data-ai-summary-result]').innerText();
  pass('accept-updates-review', afterAccept.includes('ACCEPTED'));

  async function applyDemoUser(userId) {
    await page.goto(`${BASE}#/admin`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);
    await page.selectOption('#demo-user-select', userId);
    await page.click('#save-demo-user');
    await page.waitForTimeout(400);
  }

  // Compliance manager (u-grant)
  await applyDemoUser('u-grant');
  await page.goto(`${BASE}#/publication/PUB-001`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  await page.click('[data-ai-summary-generate]');
  await page.waitForTimeout(2500);
  pass('cm-can-generate', (await page.locator('[data-ai-summary-result]').count()) === 1);
  await page.click('[data-ai-summary-reject]');
  await page.waitForTimeout(600);
  pass('cm-can-reject', (await page.locator('[data-ai-summary-result]').innerText()).includes('REJECTED'));

  // Auditor read-only
  await applyDemoUser('u-cole');
  await page.goto(`${BASE}#/publication/PUB-001`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  const auditorGen = await page.locator('[data-ai-summary-generate]').count();
  pass('auditor-no-generate', auditorGen === 0);

  await page.goto(`${BASE}#/admin/ai`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  pass('admin-ai-panel', (await page.locator('[data-admin-ai-panel]').count()) === 1);
  const adminText = await page.locator('[data-admin-ai-panel]').innerText();
  pass('admin-not-configured-or-bridge', /NOT CONFIGURED|UNAVAILABLE|ERROR|READY/i.test(adminText));

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
  pass('no-horizontal-overflow-1440', !overflow);

  for (const w of [1280, 1024, 768]) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.waitForTimeout(200);
    const ov = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
    pass(`no-overflow-${w}`, !ov);
  }

  const materialErrors = errors.filter(
    (e) => !/ERR_CONNECTION_REFUSED|127\.0\.0\.1:3765|Failed to load resource/i.test(e)
  );
  pass('no-console-errors', materialErrors.length === 0, materialErrors.slice(0, 3).join('; '));

  await browser.close();
  console.log(JSON.stringify(R, null, 2));
  const failed = Object.entries(R).filter(([, v]) => v.startsWith('FAIL'));
  if (failed.length) {
    console.error('AI 5A browser failures:', failed);
    process.exit(1);
  }
  console.log('AI 5A browser acceptance: PASS');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
