/**
 * Browser acceptance for Ask RI / 5C (requires serve on :3000).
 */
import { chromium } from 'playwright';

const BASE = 'http://localhost:3000/design-lab/regulatory-intelligence/?v=ai-5c-browser';
const R = {};

function pass(id, ok, reason = '') {
  R[id] = ok ? 'PASS' : `FAIL: ${reason}`;
}

async function applyDemoUser(page, userId) {
  await page.goto(`${BASE}#/admin`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(400);
  await page.selectOption('#demo-user-select', userId);
  await page.click('#save-demo-user');
  await page.waitForTimeout(300);
}

async function main() {
  const errors = [];
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', (e) => errors.push(e.message));

  await applyDemoUser(page, 'u-reed');
  await page.goto(`${BASE}#/ask-ri`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);
  pass('ask-ri-panel', (await page.locator('[data-ask-ri-panel]').count()) === 1);

  await page.locator('[data-ask-ri-suggest]').first().click();
  await page.waitForTimeout(2500);
  const body = await page.locator('[data-ask-ri-result]').innerText();
  pass('ai-fixture', body.includes('AI FIXTURE'));
  pass('human-review', body.includes('HUMAN_REVIEW_REQUIRED'));
  pass('evidence-panel', (await page.locator('[data-ask-ri-evidence]').innerText()).length > 5);

  await page.locator('[data-ask-ri-suggest]').nth(4).click();
  await page.waitForTimeout(2000);
  const insuf = await page.locator('[data-ask-ri-result]').innerText();
  pass('insufficient-evidence', insuf.includes('INSUFFICIENT RI EVIDENCE'));

  await page.click('[data-ask-ri-compare]');
  await page.waitForTimeout(2000);
  pass('diff-visible', (await page.locator('[data-ask-ri-diff]').innerText()).includes('Added'));

  await page.click('[data-ask-ri-board]');
  await page.waitForTimeout(2000);
  pass('board-summary', (await page.locator('[data-ask-ri-board-result]').count()) === 1);

  await applyDemoUser(page, 'u-cole');
  await page.goto(`${BASE}#/ask-ri`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  pass('auditor-no-board-accept', (await page.locator('[data-ask-ri-board-accept]').count()) === 0);

  for (const w of [1280, 1024, 768]) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.waitForTimeout(150);
    const ov = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
    pass(`no-overflow-${w}`, !ov);
  }

  const materialErrors = errors.filter((e) => !/ERR_CONNECTION_REFUSED|127\.0\.0\.1:3765/i.test(e));
  pass('no-console-errors', materialErrors.length === 0);

  await browser.close();
  console.log(JSON.stringify(R, null, 2));
  const failed = Object.entries(R).filter(([, v]) => v.startsWith('FAIL'));
  if (failed.length) {
    console.error('AI 5C browser failures:', failed);
    process.exit(1);
  }
  console.log('AI 5C browser acceptance: PASS');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
