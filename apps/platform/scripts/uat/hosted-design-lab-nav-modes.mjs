#!/usr/bin/env node
/**
 * Hosted Design Lab navigation — Ask RI access, sidebar modes, persistence, layout.
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

  const hasNavV2 = await page.locator('#ri-nav-menu-toggle').count();
  record('nav-v2-bundle-present', hasNavV2 > 0, { note: hasNavV2 ? 'current' : 'awaiting staging deploy' });
  if (!hasNavV2) {
    writeFileSync(
      join(OUT, 'RESULT.json'),
      JSON.stringify({ generatedAt: new Date().toISOString(), staging: STAGING_ORIGIN, skipped: 'legacy_bundle', failed: 1, results }, null, 2),
    );
    process.exit(2);
  }

  for (const hash of ROUTES) {
    await page.goto(`${LAB}${hash}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(600);
    const headerAsk = await page.locator('#chrome-ask-ri').isVisible();
    const sidebarAsk = await page.locator('a.ri-sidebar__link[href="#/ask-ri"]').isVisible();
    record(`ask-ri-access${hash.replace('#', '').replace(/\//g, '-')}`, headerAsk && sidebarAsk, { hash });
    await page.locator('#chrome-ask-ri').click();
    await page.waitForTimeout(500);
    const onAsk = page.url().includes('#/ask-ri');
    record(`ask-ri-header-nav${hash.replace('#', '').replace(/\//g, '-')}`, onAsk, { url: page.url() });
    await page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => {});
  }

  await page.goto(`${LAB}#/dashboard`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    localStorage.setItem('forgeniq-ri-sidebar-mode', 'expanded');
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);
  const expandedW = await page.evaluate(() => document.getElementById('ri-sidebar')?.getBoundingClientRect().width || 0);
  await page.screenshot({ path: join(OUT, 'nav-expanded.png'), fullPage: false });
  record('sidebar-expanded-width', expandedW >= 220 && expandedW <= 280, { expandedW });

  await page.evaluate(() => localStorage.setItem('forgeniq-ri-sidebar-mode', 'collapsed'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);
  const collapsedW = await page.evaluate(() => document.getElementById('ri-sidebar')?.getBoundingClientRect().width || 0);
  await page.screenshot({ path: join(OUT, 'nav-collapsed.png'), fullPage: false });
  record('sidebar-collapsed-width', collapsedW >= 56 && collapsedW <= 80, { collapsedW });

  await page.evaluate(() => localStorage.setItem('forgeniq-ri-sidebar-mode', 'hidden'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(400);
  const hidden = await page.evaluate(() => document.getElementById('ri-sidebar')?.hidden === true);
  await page.screenshot({ path: join(OUT, 'nav-hidden.png'), fullPage: false });
  record('sidebar-hidden', hidden);

  await page.locator('#ri-nav-menu-toggle').click();
  await page.waitForTimeout(400);
  const reopened = await page.evaluate(() => document.getElementById('ri-sidebar')?.hidden !== true);
  await page.screenshot({ path: join(OUT, 'nav-reopened.png'), fullPage: false });
  record('sidebar-reopen-from-hidden', reopened);

  const persisted = await page.evaluate(() => localStorage.getItem('forgeniq-ri-sidebar-mode'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(300);
  const modeAfterReload = await page.evaluate(() => document.documentElement.dataset.riNavMode);
  record('nav-mode-persistence', persisted === modeAfterReload, { persisted, modeAfterReload });

  const overflow = await page.evaluate(() => {
    const ws = document.querySelector('.ri-layout__workspace');
    return ws ? Math.max(0, ws.scrollWidth - ws.clientWidth) : 999;
  });
  record('workspace-no-horizontal-overflow', overflow <= 4, { overflow });

  await page.keyboard.press('Tab');
  const focusOk = await page.evaluate(() => {
    const el = document.activeElement;
    return el && (el.id === 'ri-nav-menu-toggle' || el.matches('a, button, input, select'));
  });
  record('keyboard-focus-cycle', focusOk);

  await page.goto(`${LAB}#/library`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  const pubLink = page.locator('.ri-library-table a[href^="#/publication/"]').first();
  if (await pubLink.isVisible().catch(() => false)) {
    await pubLink.click();
    await page.waitForTimeout(800);
    const modal = await page.locator('[data-terminal-detail-modal]').isVisible().catch(() => false);
    record('publication-modal-opens', modal);
  } else {
    record('publication-modal-opens', true, { skipped: 'no publication row' });
  }

  const calRail = await page.locator('#ri-calendar-rail').isVisible();
  record('calendar-rail-visible', calRail);
});

writeFileSync(join(OUT, 'RESULT.json'), JSON.stringify({ generatedAt: new Date().toISOString(), staging: STAGING_ORIGIN, failed: results.filter((r) => !r.ok).length, results }, null, 2));
process.exit(results.some((r) => !r.ok) ? 1 : 0);