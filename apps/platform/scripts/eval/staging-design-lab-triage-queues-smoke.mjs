#!/usr/bin/env node
/**
 * Mandatory gate: all seven workflow triage views render without JS errors (deployed staging).
 * Uses saved UAT persona session (default C) so triage APIs return data.
 */
import { runAs, SessionExpiredError } from '../uat/staging-user-sessions.mjs';

const LAB = 'https://staging-app.forgeniq.com/design-lab/regulatory-intelligence/index.html';
const PERSONA = process.env.FORGENIQ_UAT_SMOKE_PERSONA || 'C';
const QUEUES = [
  { name: 'AI Findings', hash: '#/triage/ai-findings', heading: /AI findings/i },
  { name: 'Verified Obligations', hash: '#/triage/verified-obligations', heading: /verified obligations/i },
  { name: 'Non-Obligations', hash: '#/triage/non-obligations', heading: /non-obligation/i },
  { name: 'Rejected Findings', hash: '#/triage/rejected', heading: /rejected/i },
  { name: 'Exceptions', hash: '#/triage/exceptions', heading: /exception/i },
  { name: 'Not Applicable', hash: '#/triage/not-applicable', heading: /not applicable/i },
  { name: 'All Findings', hash: '#/triage/all', heading: /all findings/i },
];

let failed = 0;
const results = [];

try {
  await runAs(PERSONA, async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(String(e)));

    for (const q of QUEUES) {
      pageErrors.length = 0;
      await page.goto(`${LAB}?v=queue-smoke${q.hash}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
      await page.waitForSelector('[data-triage-rows]', { timeout: 90_000 }).catch(() => null);
      const loadWaitMax = q.name === 'AI Findings' ? 90 : 30;
      for (let i = 0; i < loadWaitMax; i += 1) {
        const loading = await page
          .evaluate(() => (document.querySelector('[data-triage-status]')?.textContent || '').includes('Loading'))
          .catch(() => true);
        if (!loading) break;
        await page.waitForTimeout(1000);
      }
      await page.waitForTimeout(q.name === 'AI Findings' ? 2500 : 1500);
      const diag = await page.evaluate(() => {
        const status = document.querySelector('[data-triage-status]')?.textContent?.trim() || '';
        const rows = document.querySelector('[data-triage-rows]');
        const rowsHtml = rows?.innerHTML?.trim() || '';
        const hasTable = Boolean(rows?.querySelector('table.ri-table'));
        const hasEmpty = /no findings/i.test(rowsHtml);
        const five = document.querySelector('[data-triage-five-decisions]');
        const errInDom = /resolvedSegment is not defined/i.test(status + rowsHtml);
        return {
          status: status.slice(0, 200),
          hasTable,
          hasEmpty,
          errInDom,
          rowLen: rowsHtml.length,
          rowCount: document.querySelectorAll('[data-triage-row]').length,
          hasFiveDecisions: Boolean(five),
        };
      });
      const h1 = await page.evaluate(() => document.querySelector('#ri-main h1')?.innerText || '');
      const headingOk = q.heading.test(h1);
      const contentOk = (diag.hasTable || diag.hasEmpty) && !diag.errInDom && diag.status.length > 0 && !/resolvedSegment/.test(diag.status);
      const jsOk = !pageErrors.some((e) => /resolvedSegment|ReferenceError/i.test(e));
      const ok = headingOk && contentOk && jsOk;
      results.push({ queue: q.name, ok, ...diag, pageErrors: pageErrors.slice() });
      console.log(ok ? 'PASS' : 'FAIL', q.name, diag, pageErrors.length ? pageErrors : '');
      if (!ok) failed += 1;
    }
  });
} catch (err) {
  if (err instanceof SessionExpiredError) {
    console.error(`staging-design-lab-triage-queues-smoke: blocked — persona ${PERSONA} session expired (${err.message})`);
    process.exit(2);
  }
  throw err;
}

const aiRow = results.find((r) => r.queue === 'AI Findings');
if (aiRow?.hasTable && !aiRow.hasFiveDecisions) {
  console.log('NOTE AI Findings: five-decision buttons require User B reviewer session (not checked here).');
}

console.log('\n--- summary ---');
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}\t${r.queue}\trows=${r.rowCount}\ttable=${r.hasTable}`);

if (failed) {
  console.error(`staging-design-lab-triage-queues-smoke: FAIL (${failed}/${QUEUES.length})`);
  process.exit(1);
}
console.log(`staging-design-lab-triage-queues-smoke: PASS (${QUEUES.length}/${QUEUES.length})`);