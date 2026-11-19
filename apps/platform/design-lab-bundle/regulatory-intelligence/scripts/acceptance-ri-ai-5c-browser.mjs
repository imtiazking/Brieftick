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

const COMPOUND_BANKING =
  'What regulatory changes currently affect the Banking sector, and what are the key compliance actions firms should take?';

const COMPOUND_WEALTH =
  'What regulatory changes currently affect Wealth Management, and which obligations remain open?';

const CONSUMER_DUTY_ACTIONS =
  'Which Consumer Duty changes have linked Actions, and what is the status of those Actions?';

const BANKING_CONTROLS = 'What controls support Banking sector regulatory changes?';

const OP_RES_OVERDUE =
  'Which Operational Resilience actions are overdue, and which obligations are they linked to?';

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
        const openStatus = (st) => {
          const n = String(st || '').trim().toLowerCase();
          return n === 'open' || n === 'in progress' || n === 'overdue';
        };
        return (s.obligations || []).filter((o) => openStatus(o.status)).length;
      }, STORAGE_KEY);
      const truncated = await page.locator('[data-ask-ri-evidence-count]').first().getAttribute('data-truncated');
      const displayed = Number(await page.locator('[data-ask-ri-evidence-count]').first().getAttribute('data-displayed'));
      pass(`e2e-open-count-match`, expected !== null && result.includes(String(expected)));
      pass(
        `e2e-open-truncation`,
        expected !== null && (expected > displayed ? truncated === 'true' && result.includes('showing') : truncated === 'false')
      );
      pass(`e2e-open-confidence-nonempty`, /Evidence confidence:\s*(HIGH|MEDIUM|LOW)/i.test(result));
    }

    if (q.includes('Basel')) {
      const evidenceText = await page.locator('[data-ask-ri-evidence]').innerText();
      pass(`e2e-basel-reviewed-mapping`, /ImplementationMapping|BAS-MAP/i.test(evidenceText));
    }
  }

  await askViaUi(page, COMPOUND_BANKING);
  const compoundBody = await page.locator('[data-ask-ri-result]').innerText();
  const compoundTotal = Number(await page.locator('[data-ask-ri-evidence-count]').first().getAttribute('data-count'));
  pass('e2e-compound-banking-not-insufficient', !compoundBody.includes('INSUFFICIENT RI EVIDENCE') && compoundTotal > 0);
  pass('e2e-compound-banking-fixture', compoundBody.includes('AI FIXTURE') || compoundBody.includes('AI SYNTHESIS'));

  await askViaUi(page, COMPOUND_WEALTH);
  const wealthCompoundBody = await page.locator('[data-ask-ri-result]').innerText();
  const wealthCompoundInsufficient = await page.locator('[data-ask-ri-result][data-ask-ri-insufficient="true"]').count();
  pass('e2e-compound-wealth-not-insufficient', wealthCompoundInsufficient === 0 && !wealthCompoundBody.includes('INSUFFICIENT RI EVIDENCE'));
  const wealthLinkedMatch =
    wealthCompoundBody.match(/active \+ in-review Obligations?:\s*(\d+)/i) ||
    wealthCompoundBody.match(/(\d+)\s+linked Obligation\(s\)/i);
  pass(
    'e2e-compound-wealth-partial',
    wealthCompoundBody.includes('No active + in-review obligations') ||
      /active \+ in-review obligations were not found/i.test(wealthCompoundBody) ||
      wealthLinkedMatch !== null
  );

  await askViaUi(page, CONSUMER_DUTY_ACTIONS);
  const cdBody = await page.locator('[data-ask-ri-result]').innerText();
  const cdInsufficient = await page.locator('[data-ask-ri-result][data-ask-ri-insufficient="true"]').count();
  const cdEvidence = Number(await page.locator('[data-ask-ri-evidence-count]').first().getAttribute('data-count'));
  pass('e2e-consumer-duty-actions-not-insufficient', cdInsufficient === 0 && cdEvidence > 0);
  pass('e2e-consumer-duty-actions-status', /Action|status/i.test(cdBody));

  await askViaUi(page, BANKING_CONTROLS);
  const ctrlBody = await page.locator('[data-ask-ri-result]').innerText();
  const ctrlInsufficient = await page.locator('[data-ask-ri-result][data-ask-ri-insufficient="true"]').count();
  pass('e2e-banking-controls-not-insufficient', ctrlInsufficient === 0 && !ctrlBody.includes('INSUFFICIENT RI EVIDENCE'));

  await askViaUi(page, OP_RES_OVERDUE);
  const opResBody = await page.locator('[data-ask-ri-result]').innerText();
  const opResEvidence = await page.locator('[data-ask-ri-evidence]').innerText();
  pass('e2e-opres-overdue-act031', opResEvidence.includes('ACT-031'));
  pass('e2e-opres-overdue-obl0088', /OBL-0088/.test(opResEvidence));
  pass(
    'e2e-opres-overdue-as-of',
    /Deterministic as-of date/i.test(opResBody) && /14 October 2026/i.test(opResBody)
  );
  pass('e2e-opres-overdue-no-raw-edges', !/change_links_|assessment_for_change/.test(opResEvidence));
  pass(
    'e2e-opres-overdue-status-line',
    /was due on 10 October 2026/i.test(opResBody) && /overdue as of 14 October 2026/i.test(opResBody)
  );

  const CD_ZERO_PREDICATE =
    'Which Consumer Duty obligations have evidence but no assurance findings?';
  await askViaUi(page, CD_ZERO_PREDICATE);
  const cdZeroBody = await page.locator('[data-ask-ri-result]').innerText();
  const cdZeroEvidence = await page.locator('[data-ask-ri-evidence]').innerText();
  pass('e2e-cd-zero-qualifier-not-insufficient', !cdZeroBody.includes('INSUFFICIENT RI EVIDENCE'));
  pass(
    'e2e-cd-zero-qualifier-supported',
    (await page.locator('[data-ask-ri-result][data-ask-ri-supported-query="true"]').count()) === 1
  );
  pass(
    'e2e-cd-zero-qualifier-predicate-eval',
    (await page.locator('[data-ask-ri-evidence-count][data-predicate-evaluated="true"]').count()) >= 1
  );
  pass(
    'e2e-cd-zero-qualifier-candidates',
    Number(await page.locator('[data-ask-ri-evidence-count]').first().getAttribute('data-candidate-count')) === 3
  );
  const qualCount = Number(await page.locator('[data-ask-ri-evidence-count]').first().getAttribute('data-qualifying-count'));
  pass('e2e-cd-zero-qualifier-count', qualCount === 1);
  pass('e2e-cd-zero-qualifier-no-retrieved-msg', !cdZeroEvidence.includes('No RI records retrieved'));
  pass('e2e-cd-zero-qualifier-no-generic-evidence-used', !/Evidence used:\s*0 records/i.test(cdZeroEvidence));
  pass(
    'e2e-cd-zero-qualifier-copy',
    /1 qualifying records/i.test(cdZeroEvidence) &&
      /3 candidate/i.test(cdZeroEvidence) &&
      /met the criteria/i.test(cdZeroEvidence)
  );

  await askViaUi(page, 'What does OSFI require for Consumer Duty?');
  const osfiBody = await page.locator('[data-ask-ri-result]').innerText();
  pass('e2e-osfi-insufficient', osfiBody.includes('INSUFFICIENT RI EVIDENCE'));
  pass('e2e-osfi-not-zero-qualifier', (await page.locator('[data-ask-ri-zero-qualifiers]').count()) === 0);

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
