#!/usr/bin/env node
/**
 * Hosted Design Lab navigation + calendar rail evidence (Persona A).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../../lib/ri/eval/eval-paths.mjs';
import { requireUatPersonas, runAs, STAGING_ORIGIN } from './staging-user-sessions.mjs';
import { designLabEntry } from '../staging/staging-release-hosts.mjs';

const day = new Date().toISOString().slice(0, 10);
const OUT = join(REPO_ROOT, 'docs', 'uat', 'evidence', `design-lab-nav-modes-${day}`);
const LAB = designLabEntry(STAGING_ORIGIN);
const ROUTES = ['#/dashboard', '#/library', '#/obligations', '#/horizon/watchlists'];

const results = [];
const record = (id, ok, detail = {}) => {
  results.push({ id, ok, detail });
  console.log(ok ? 'PASS' : 'FAIL', id);
};

mkdirSync(OUT, { recursive: true });
await requireUatPersonas(['A'], { label: 'design-lab-nav' });

await runAs('A', async ({ page }) => {
  await page.goto(`${LAB}#/dashboard`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await page.waitForFunction(() => document.documentElement.dataset.riMounted === '1', null, { timeout: 45_000 });

  const hasNavV2 = (await page.locator('#ri-nav-menu-toggle').count()) > 0;
  record('nav-v2-bundle-present', hasNavV2);
  if (!hasNavV2) {
    writeFileSync(join(OUT, 'RESULT.json'), JSON.stringify({ generatedAt: new Date().toISOString(), skipped: 'legacy_bundle', results }, null, 2));
    process.exit(2);
  }

  await page.evaluate(() => {
    localStorage.setItem('forgeniq-ri-sidebar-mode', 'expanded');
    localStorage.removeItem('forgeniq-ri-calendar-rail');
  });

  for (const hash of ROUTES) {
    await page.goto(`${LAB}${hash}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);
    const headerAsk = await page.locator('#chrome-ask-ri').isVisible();
    const sidebarAsk = await page.locator('a.ri-sidebar__link[href="#/ask-ri"]').isVisible();
    record(`ask-ri-access${hash.replace(/#/g, '').replace(/\//g, '-')}`, headerAsk && sidebarAsk, { hash });
    await page.locator('#chrome-ask-ri').click();
    await page.waitForTimeout(600);
    record(`ask-ri-header-nav${hash.replace(/#/g, '').replace(/\//g, '-')}`, page.url().includes('#/ask-ri'));
    await page.goto(`${LAB}${hash}`, { waitUntil: 'domcontentloaded' });
  }

  await page.goto(`${LAB}#/ask-ri`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  await page.screenshot({ path: join(OUT, 'ask-ri-interface.png'), fullPage: false });
  record('ask-ri-interface-screenshot', true);

  await page.goto(`${LAB}#/dashboard`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.setItem('forgeniq-ri-sidebar-mode', 'expanded'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(OUT, 'nav-expanded.png'), fullPage: false });
  record('sidebar-expanded', true);

  await page.evaluate(() => localStorage.setItem('forgeniq-ri-sidebar-mode', 'collapsed'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(OUT, 'nav-collapsed.png'), fullPage: false });
  record('sidebar-collapsed', true);

  await page.evaluate(() => localStorage.setItem('forgeniq-ri-sidebar-mode', 'hidden'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(OUT, 'nav-hidden.png'), fullPage: false });
  record('sidebar-hidden', await page.evaluate(() => document.getElementById('ri-sidebar')?.hidden === true));

  await page.locator('#ri-nav-menu-toggle').click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(OUT, 'nav-reopened.png'), fullPage: false });
  record('sidebar-reopen-from-hidden', await page.evaluate(() => document.getElementById('ri-sidebar')?.hidden !== true));

  await page.goto(`${LAB}#/dashboard`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    localStorage.setItem('forgeniq-ri-sidebar-mode', 'expanded');
    localStorage.setItem('forgeniq-ri-calendar-rail', 'open');
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(OUT, 'calendar-expanded.png'), fullPage: false });
  const calOpen = await page.evaluate(() => !document.getElementById('ri-calendar-rail')?.hidden);
  record('calendar-panel-expanded', calOpen);

  await page.locator('[data-calendar-rail-collapse]').click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(OUT, 'calendar-hidden.png'), fullPage: false });
  record('calendar-panel-hidden', await page.evaluate(() => document.getElementById('ri-calendar-rail')?.hidden === true));

  await page.goto(`${LAB}#/risks`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(400);
  record('calendar-hidden-on-risks', await page.evaluate(() => document.getElementById('ri-calendar-rail')?.hidden === true));

  const overflow = await page.evaluate(() => {
    const ws = document.querySelector('.ri-layout__workspace');
    return ws ? Math.max(0, ws.scrollWidth - ws.clientWidth) : 999;
  });
  record('workspace-no-horizontal-overflow', overflow <= 4, { overflow });
});

writeFileSync(join(OUT, 'RESULT.json'), JSON.stringify({ generatedAt: new Date().toISOString(), staging: STAGING_ORIGIN, failed: results.filter((r) => !r.ok).length, results }, null, 2));
process.exit(results.some((r) => !r.ok) ? 1 : 0);