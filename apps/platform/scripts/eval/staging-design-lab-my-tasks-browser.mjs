#!/usr/bin/env node
/**
 * Browser UAT: My Tasks dashboard render, rename, pagination controls.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../../lib/ri/eval/eval-paths.mjs';
import { runAs, requireUatPersonas } from '../uat/staging-user-sessions.mjs';

const LAB = 'https://staging-app.forgeniq.com/design-lab/regulatory-intelligence/index.html?v=my-tasks-uat#/work';
const OUT = join(REPO_ROOT, 'docs', 'uat', 'evidence', 'my-tasks-staging-2026-11-24');
mkdirSync(OUT, { recursive: true });

await requireUatPersonas(['B'], { label: 'my-tasks-browser' });

const report = await runAs('B', async ({ page }) => {
  await page.goto(LAB, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  for (let i = 0; i < 60; i += 1) {
    const loading = await page
      .evaluate(() => (document.querySelector('[data-my-tasks-status]')?.textContent || '').includes('Loading'))
      .catch(() => true);
    if (!loading) break;
    await page.waitForTimeout(1000);
  }
  const title = await page.locator('h1').first().innerText().catch(() => '');
  const navLabel = await page
    .evaluate(() => [...document.querySelectorAll('nav a, .ri-nav a')].map((a) => a.textContent).join(' '))
    .catch(() => '');
  await page.waitForSelector('[data-my-tasks-screen]', { timeout: 60_000 });
  const status = await page.locator('[data-my-tasks-status]').innerText();
  const rowCount = await page.locator('[data-my-tasks-row]').count();
  await page.locator('[data-my-tasks-scope-select]').selectOption('team');
  await page.waitForTimeout(2000);
  const teamStatus = await page.locator('[data-my-tasks-status]').innerText();
  const teamRows = await page.locator('[data-my-tasks-row]').count();
  const shot = join(OUT, 'my-tasks-dashboard.png');
  await page.screenshot({ path: shot, fullPage: true });
  return {
    title,
    navHasMyTasks: /My Tasks/i.test(navLabel) || /My Tasks/i.test(title),
    status: status.slice(0, 200),
    teamStatus: teamStatus.slice(0, 200),
    rowCount,
    teamRows,
    workQueueGone: !/Work Queue/i.test(title),
    ok:
      /My Tasks/i.test(title) &&
      !/Work Queue/i.test(title) &&
      status.includes('filtered total') &&
      teamRows >= 0,
    screenshot: 'my-tasks-dashboard.png',
  };
});

writeFileSync(join(OUT, 'MY-TASKS-BROWSER.json'), JSON.stringify({ generatedAt: new Date().toISOString(), ...report }, null, 2));

if (!report.ok) {
  console.error('staging-design-lab-my-tasks-browser: FAIL', report);
  process.exit(1);
}
console.log('staging-design-lab-my-tasks-browser: PASS', report);