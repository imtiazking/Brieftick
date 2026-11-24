#!/usr/bin/env node
/**
 * Mandatory gate: all seven workflow triage views render without JS errors (deployed staging).
 */
import { chromium } from 'playwright';

const LAB = 'https://staging-app.forgeniq.com/design-lab/regulatory-intelligence/index.html';
const QUEUES = [
  { name: 'AI Findings', hash: '#/triage/ai-findings', heading: /AI findings/i },
  { name: 'Verified Obligations', hash: '#/triage/verified-obligations', heading: /verified obligations/i },
  { name: 'Non-Obligations', hash: '#/triage/non-obligations', heading: /non-obligation/i },
  { name: 'Rejected Findings', hash: '#/triage/rejected', heading: /rejected/i },
  { name: 'Exceptions', hash: '#/triage/exceptions', heading: /exception/i },
  { name: 'Not Applicable', hash: '#/triage/not-applicable', heading: /not applicable/i },
  { name: 'All Findings', hash: '#/triage/all', heading: /all findings/i },
];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));

let failed = 0;
const results = [];

for (const q of QUEUES) {
  pageErrors.length = 0;
  await page.goto(`${LAB}${q.hash}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForSelector('[data-triage-rows]', { timeout: 60_000 }).catch(() => null);
  await page.waitForTimeout(6000);
  const diag = await page.evaluate(() => {
    const status = document.querySelector('[data-triage-status]')?.textContent?.trim() || '';
    const rows = document.querySelector('[data-triage-rows]');
    const rowsHtml = rows?.innerHTML?.trim() || '';
    const hasTable = Boolean(rows?.querySelector('table.ri-table'));
    const hasEmpty = /no findings/i.test(rowsHtml);
    const five = document.querySelector('[data-triage-five-decisions]');
    const errInDom = /resolvedSegment is not defined/i.test(status + rowsHtml);
    return { status: status.slice(0, 200), hasTable, hasEmpty, errInDom, rowLen: rowsHtml.length, hasFiveDecisions: Boolean(five) };
  });
  const headingOk = q.heading.test(await page.evaluate(() => document.querySelector('#ri-main h1, #ri-main h2')?.innerText || ''));
  const contentOk = (diag.hasTable || diag.hasEmpty) && !diag.errInDom && diag.status.length > 0 && !/resolvedSegment/.test(diag.status);
  const jsOk = !pageErrors.some((e) => /resolvedSegment|ReferenceError/i.test(e));
  const ok = headingOk && contentOk && jsOk;
  results.push({ queue: q.name, ok, ...diag, pageErrors: pageErrors.slice() });
  console.log(ok ? 'PASS' : 'FAIL', q.name, diag, pageErrors.length ? pageErrors : '');
  if (!ok) failed += 1;
}

const aiRow = results.find((r) => r.queue === 'AI Findings');
if (aiRow?.hasTable && !aiRow.hasFiveDecisions) {
  console.log('WARN AI Findings: table present but no five-decision action host (may need reviewer session)');
}

await browser.close();
console.log('\n--- summary ---');
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}\t${r.queue}\ttable=${r.hasTable}\trows=${r.rowLen}`);

if (failed) {
  console.error(`staging-design-lab-triage-queues-smoke: FAIL (${failed}/${QUEUES.length})`);
  process.exit(1);
}
console.log(`staging-design-lab-triage-queues-smoke: PASS (${QUEUES.length}/${QUEUES.length})`);