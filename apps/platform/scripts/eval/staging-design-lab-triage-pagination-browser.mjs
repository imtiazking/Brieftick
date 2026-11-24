#!/usr/bin/env node
/**
 * Browser UAT: All Findings pagination controls (page size, next/prev, total 208).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../../lib/ri/eval/eval-paths.mjs';
import { runAs, requireUatPersonas } from '../uat/staging-user-sessions.mjs';

const LAB = 'https://staging-app.forgeniq.com/design-lab/regulatory-intelligence/index.html#/triage/all';
const OUT = join(REPO_ROOT, 'docs', 'uat', 'evidence', 'six-queue-workflow-staging-2026-11-24');
mkdirSync(OUT, { recursive: true });

await requireUatPersonas(['C'], { label: 'triage-pagination-browser' });

const report = await runAs('C', async ({ page }) => {
  await page.goto(`${LAB}&v=pagination-uat`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForSelector('[data-triage-pagination]', { state: 'visible', timeout: 90_000 });
  const statusBefore = await page.locator('[data-triage-status]').innerText();
  const pageInfo1 = await page.locator('[data-triage-page-info]').innerText();
  const rowCount1 = await page.locator('[data-triage-row]').count();
  await page.locator('[data-triage-page-size]').selectOption('25');
  await page.waitForTimeout(1500);
  const rowCount25 = await page.locator('[data-triage-row]').count();
  await page.locator('[data-triage-next]').click();
  await page.waitForTimeout(1500);
  const pageInfo2 = await page.locator('[data-triage-page-info]').innerText();
  const rowCount2 = await page.locator('[data-triage-row]').count();
  const shot = join(OUT, 'all-findings-pagination.png');
  await page.screenshot({ path: shot, fullPage: true });
  const totalMatch = /queue total 208|208 finding/.test(statusBefore);
  return {
    statusBefore: statusBefore.slice(0, 240),
    pageInfo1,
    pageInfo2,
    rowCount1,
    rowCount25,
    rowCount2,
    totalMatch,
    ok: totalMatch && rowCount25 <= 25 && rowCount2 > 0 && /Page 2/.test(pageInfo2),
    screenshot: 'all-findings-pagination.png',
  };
});

writeFileSync(join(OUT, 'PAGINATION-BROWSER.json'), JSON.stringify({ generatedAt: new Date().toISOString(), ...report }, null, 2));

if (!report.ok) {
  console.error('staging-design-lab-triage-pagination-browser: FAIL', report);
  process.exit(1);
}
console.log('staging-design-lab-triage-pagination-browser: PASS', report);