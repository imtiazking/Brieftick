/**
 * Browser acceptance for Ask RI / 5C + §13 test precision (requires serve on :3000).
 * Uses a fresh Playwright browser context (no persisted profile / localStorage reuse).
 */
import { chromium } from 'playwright';

const BASE = `http://localhost:3000/design-lab/regulatory-intelligence/?v=ai-5c-browser-${Date.now()}`;
const STORAGE_KEY = 'forgeniq-ri-lab-v2';
const R = {};

const POSITIVE_QUESTIONS = [
  'What regulatory changes currently affect the Banking sector?',
  'What Basel developments are linked to PRA implementation?',
  'How many open obligations are there?',
];

const HELD_OUT_POSITIVE = [
  { q: 'What regulatory changes currently affect Wealth Management?', id: 'held-out-wealth' },
  { q: 'What TPR requirements are relevant to Pension Providers?', id: 'held-out-tpr' },
];

const NEGATIVE_QUESTIONS = [
  'What is the capital requirement under EU CRD V in France?',
  'What are MiFID III requirements in Germany?',
  'What does the Central Bank of Ireland require?',
  'cryptoassets-only-special-sector-xyz regulatory changes',
];

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

async function askViaUi(page, question) {
  await page.goto(`${BASE}#/ask-ri`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);
  await page.fill('#ask-ri-input', question);
  await page.click('[data-ask-ri-submit]');
  await page.waitForSelector('[data-ask-ri-result]', { timeout: 15000 });
  await page.waitForTimeout(800);
}

async function reportDeveloperStorageStaleNote() {
  console.log(
    'NOTE (§13-D): This script uses an isolated browser context and does not read or clear the developer\'s normal browser localStorage.'
  );
  console.log(
    `If manual testing shows stale RI state, inspect key "${STORAGE_KEY}" and schemaVersion (expect 17).`
  );
}

async function main() {
  await reportDeveloperStorageStaleNote();
  const errors = [];
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));

  await applyDemoUser(page, 'u-reed');

  for (const q of POSITIVE_QUESTIONS) {
    const slug = q.slice(0, 48).replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    await askViaUi(page, q);
    const result = await page.locator('[data-ask-ri-result]').innerText();
    const insufficient = await page.locator('[data-ask-ri-result][data-ask-ri-insufficient="true"]').count();
    const evidenceCount = Number(await page.locator('[data-ask-ri-evidence-count]').first().getAttribute('data-count'));
    pass(`e2e-positive-${slug}-not-insufficient`, insufficient === 0 && !result.includes('INSUFFICIENT RI EVIDENCE'));
    pass(`e2e-positive-${slug}-evidence`, evidenceCount > 0);
    pass(`e2e-positive-${slug}-no-empty`, !result.includes('No RI records retrieved'));

    if (q.startsWith('How many open obligations')) {
      const expected = await page.evaluate((key) => {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        const s = JSON.parse(raw);
        const OPEN = ['Draft', 'Open', 'In progress', 'Review', 'Active'];
        return (s.obligations || []).filter((o) => OPEN.includes(o.status)).length;
      }, STORAGE_KEY);
      pass(`e2e-open-count-match`, expected !== null && result.includes(String(expected)));
    }

    if (q.includes('Basel')) {
      const evidenceText = await page.locator('[data-ask-ri-evidence]').innerText();
      pass(`e2e-basel-reviewed-mapping`, /ImplementationMapping|BAS-MAP/i.test(evidenceText));
    }
  }

  for (const { q, id } of HELD_OUT_POSITIVE) {
    await askViaUi(page, q);
    const result = await page.locator('[data-ask-ri-result]').innerText();
    const evidenceCount = Number(await page.locator('[data-ask-ri-evidence-count]').first().getAttribute('data-count'));
    pass(`e2e-${id}`, evidenceCount > 0 && !result.includes('INSUFFICIENT RI EVIDENCE'));
  }

  for (const q of NEGATIVE_QUESTIONS) {
    const slug = q.slice(0, 40).replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    await askViaUi(page, q);
    const result = await page.locator('[data-ask-ri-result]').innerText();
    const providerCalls = await page.locator('[data-ask-ri-result]').getAttribute('data-provider-calls');
    const evidenceCount = Number(await page.locator('[data-ask-ri-evidence-count]').first().getAttribute('data-count'));
    pass(`e2e-negative-${slug}-insufficient`, result.includes('INSUFFICIENT RI EVIDENCE'));
    pass(`e2e-negative-${slug}-zero-evidence`, evidenceCount === 0);
    pass(`e2e-negative-${slug}-zero-provider`, providerCalls === '0');
  }

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

  await context.close();
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
