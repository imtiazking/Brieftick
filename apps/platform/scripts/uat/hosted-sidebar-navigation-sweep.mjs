#!/usr/bin/env node
/**
 * Authenticated sidebar navigation sweep (staging). Covers SIDE_NAV customer routes + Ask RI.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { requireUatPersonas, runAs } from './staging-user-sessions.mjs';
import { authOrigin, designLabEntry } from '../staging/staging-release-hosts.mjs';
import { SIDE_NAV, sideNavHref } from '../../../../design-lab/regulatory-intelligence/js/shell-navigation.js';
import { playwrightLaunchOptions } from '../eval/playwright-ci-launch.mjs';

const platformRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const repoRoot = join(platformRoot, '..', '..');
const origin = authOrigin();
const LAB = designLabEntry(origin);

function collectRoutes() {
  const routes = [{ name: 'Dashboard', href: '#/dashboard' }];
  for (const section of SIDE_NAV) {
    if (section.path && !section.items) {
      if (section.path !== 'dashboard') routes.push({ name: section.label, href: `#/${section.path}` });
      continue;
    }
    for (const item of section.items || []) {
      if (['ingestion', 'ai-operations'].includes(item.path)) continue;
      const label = `${section.label} — ${item.label}`;
      routes.push({ name: label, href: sideNavHref(item) });
    }
  }
  routes.push({ name: 'Ask RI (header)', href: '#/ask-ri' });
  return routes;
}

const routes = collectRoutes();
const results = [];

async function checkRoute(page, route) {
  await page.goto(`${LAB}${route.href}`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await page.waitForFunction(() => document.documentElement.dataset.riMounted === '1', null, { timeout: 25_000 }).catch(() => {});
  const snap = await page.evaluate(() => ({
    mounted: document.documentElement.dataset.riMounted === '1',
    heading: document.querySelector('h1')?.innerText?.slice(0, 120) || '',
    nav: document.querySelectorAll('nav.ri-sidebar__nav a, nav.ri-sidebar__nav button').length,
    appLen: document.getElementById('ri-app')?.innerText?.length || 0,
    bootFallback: document.querySelector('#ri-boot-fallback:not([hidden])') ? 1 : 0,
  }));
  const signIn = /sign in required|backend unavailable|log in to vercel/i.test(snap.heading);
  const ok = snap.mounted && snap.nav > 0 && !signIn && snap.appLen > 40 && snap.bootFallback === 0;
  return { ...route, ok, ...snap, signIn };
}

try {
  await requireUatPersonas(['C'], { label: 'sidebar-sweep' });
  await runAs('C', async ({ page }) => {
    const sidebar = page.locator('aside.ri-sidebar');
    await page.goto(`${LAB}#/dashboard`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
    await page.waitForFunction(() => document.documentElement.dataset.riMounted === '1', null, { timeout: 25_000 }).catch(() => {});
    const collapseBtn = page.locator('[data-nav-collapse="horizon"]');
    if (await collapseBtn.count()) {
      await collapseBtn.click();
      await page.waitForTimeout(300);
      await collapseBtn.click();
    }
    for (const route of routes) {
      const row = await checkRoute(page, route);
      results.push(row);
      console.log(row.ok ? 'PASS' : 'FAIL', row.name, row.heading.slice(0, 60));
    }
    const askLink = page.locator('a[href="#/ask-ri"], [data-ask-ri-link]');
    results.push({
      name: 'Ask RI control present',
      ok: (await askLink.count()) > 0,
      count: await askLink.count(),
    });
    console.log(results.at(-1).ok ? 'PASS' : 'FAIL', 'Ask RI control present');
  });
} catch (err) {
  console.error('sidebar-sweep:', err?.message || err);
  process.exit(2);
}

const evidenceDir = join(repoRoot, 'docs', 'uat', 'evidence', 'sidebar-sweep-2026-11-27');
mkdirSync(evidenceDir, { recursive: true });
const failed = results.filter((r) => !r.ok);
writeFileSync(
  join(evidenceDir, 'RESULT.json'),
  JSON.stringify({ generatedAt: new Date().toISOString(), origin, routes: results.length, failed: failed.length, results }, null, 2),
);
if (failed.length) {
  console.error(`hosted sidebar sweep: FAIL ${failed.length}/${results.length}`);
  process.exit(1);
}
console.log(`hosted sidebar sweep: PASS ${results.length} @ ${origin}`);