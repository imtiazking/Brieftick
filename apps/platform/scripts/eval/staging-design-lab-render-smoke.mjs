#!/usr/bin/env node
/**
 * Staging Design Lab render smoke — visible DOM, not just HTTP 200.
 * Includes all seven workflow triage queues (mandatory deployment gate).
 */
import { chromium } from 'playwright';

const LAB = 'https://staging-app.forgeniq.com/design-lab/regulatory-intelligence/index.html';
const TRIAGE_QUEUES = [
  { name: 'triage-ai-findings', hash: '#/triage/ai-findings', expect: /AI findings/i, triage: true },
  { name: 'triage-verified-obligations', hash: '#/triage/verified-obligations', expect: /verified obligations/i, triage: true },
  { name: 'triage-non-obligations', hash: '#/triage/non-obligations', expect: /non-obligation/i, triage: true },
  { name: 'triage-rejected', hash: '#/triage/rejected', expect: /rejected/i, triage: true },
  { name: 'triage-exceptions', hash: '#/triage/exceptions', expect: /exception/i, triage: true },
  { name: 'triage-not-applicable', hash: '#/triage/not-applicable', expect: /not applicable/i, triage: true },
  { name: 'triage-all', hash: '#/triage/all', expect: /all findings/i, triage: true },
];
const cases = [
  { name: 'dashboard', hash: '#/dashboard', expect: /dashboard|Regulatory intelligence/i },
  { name: 'invalid-ai-route', hash: '#/ai-a/broken', expect: /not found|unavailable|page could not/i },
  ...TRIAGE_QUEUES,
];

let failed = 0;
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const consoleErrors = [];
page.on('pageerror', (e) => consoleErrors.push(String(e)));

for (const c of cases) {
  pageErrors.length = 0;
  await page.goto(`${LAB}${c.hash}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  if (c.triage) await page.waitForSelector('[data-triage-rows]', { timeout: 60_000 }).catch(() => null);
  await page.waitForTimeout(c.triage ? 6000 : 2500);
  const riAppLen = await page.locator('#ri-app').innerHTML().then((h) => h.trim().length).catch(() => 0);
  const mainText = await page.evaluate(() => document.getElementById('ri-app')?.innerText || '');
  let ok = riAppLen > 5000 && c.expect.test(mainText);
  if (c.triage) {
    const triageOk = await page.evaluate(() => {
      const status = document.querySelector('[data-triage-status]')?.textContent || '';
      const rows = document.querySelector('[data-triage-rows]');
      const html = rows?.innerHTML || '';
      const hasTable = Boolean(rows?.querySelector('table.ri-table'));
      const hasEmpty = /no findings/i.test(html);
      const bad = /resolvedSegment is not defined/i.test(status + html);
      return !bad && status.length > 0 && (hasTable || hasEmpty);
    });
    ok = ok && triageOk && !pageErrors.some((e) => /ReferenceError|resolvedSegment/i.test(e));
  }
  console.log(ok ? 'PASS' : 'FAIL', c.name, { riAppLen, sample: mainText.slice(0, 120).replace(/\s+/g, ' ') });
  if (!ok) failed += 1;
}

if (consoleErrors.some((e) => /resolvedSegment|already been declared/i.test(e))) {
  console.log('FAIL module parse error still present', consoleErrors);
  failed += 1;
} else if (consoleErrors.length) {
  console.log('WARN pageerrors', consoleErrors.slice(0, 5));
}

await browser.close();
if (failed) {
  console.error(`staging-design-lab-render-smoke: FAIL (${failed})`);
  process.exit(1);
}
console.log('staging-design-lab-render-smoke: PASS');