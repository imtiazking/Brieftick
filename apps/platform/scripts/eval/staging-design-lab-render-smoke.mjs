#!/usr/bin/env node
/**
 * Staging Design Lab render smoke — visible DOM, not just HTTP 200.
 * Includes all seven workflow triage queues (mandatory deployment gate).
 */
import { chromium } from 'playwright';
import { runAs, SessionExpiredError } from '../uat/staging-user-sessions.mjs';

const LAB = 'https://staging-app.forgeniq.com/design-lab/regulatory-intelligence/index.html';
const PERSONA = process.env.FORGENIQ_UAT_SMOKE_PERSONA || 'C';
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
const consoleErrors = [];

async function exercise(page, list) {
  for (const c of list) {
    consoleErrors.length = 0;
    page.on('pageerror', (e) => consoleErrors.push(String(e)));
    await page.goto(`${LAB}?v=render-smoke${c.hash}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    if (c.triage) {
      await page.waitForSelector('[data-triage-rows]', { timeout: 90_000 }).catch(() => null);
      await page.waitForTimeout(8000);
    } else {
      await page.waitForTimeout(2500);
    }
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
      ok = ok && triageOk && !consoleErrors.some((e) => /ReferenceError|resolvedSegment/i.test(e));
    }
    console.log(ok ? 'PASS' : 'FAIL', c.name, { riAppLen, sample: mainText.slice(0, 120).replace(/\s+/g, ' ') });
    if (!ok) failed += 1;
  }
}

const anonymousCases = cases.filter((c) => !c.triage);
const triageCases = cases.filter((c) => c.triage);

const browser = await chromium.launch({ headless: true });
const anonPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await exercise(anonPage, anonymousCases);
await browser.close();

try {
  await runAs(PERSONA, async ({ page }) => await exercise(page, triageCases));
} catch (err) {
  if (err instanceof SessionExpiredError) {
    console.error(`Triage cases skipped — persona ${PERSONA} expired`);
    failed += triageCases.length;
  } else throw err;
}
if (failed) {
  console.error(`staging-design-lab-render-smoke: FAIL (${failed})`);
  process.exit(1);
}
console.log('staging-design-lab-render-smoke: PASS');