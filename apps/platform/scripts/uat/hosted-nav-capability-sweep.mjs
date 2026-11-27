#!/usr/bin/env node
/**
 * Sidebar routes must render real capabilities (API/data), not empty shells.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireUatPersonas, runAs, STAGING_ORIGIN } from './staging-user-sessions.mjs';
import { REPO_ROOT } from '../../lib/ri/eval/eval-paths.mjs';
import { SIDE_NAV, sideNavHref } from '../../../../design-lab/regulatory-intelligence/js/shell-navigation.js';
import { designLabEntry } from '../staging/staging-release-hosts.mjs';

const LAB = designLabEntry(STAGING_ORIGIN);
const OUT = join(REPO_ROOT, 'docs', 'uat', 'evidence', `nav-capability-${new Date().toISOString().slice(0, 10)}`);

const API_BY_ROUTE = {
  '#/dashboard': '/api/ri-lab/dashboard',
  '#/feed': '/api/ri-lab/publications?limit=10',
  '#/horizon': '/api/ri-lab/landscape',
  '#/library': '/api/ri-lab/publications?limit=10',
  '#/changes': '/api/ri-lab/changes?scope=operational&limit=10',
  '#/triage/all': '/api/ri-lab/triage?queue=ALL_FINDINGS&page=1&pageSize=5',
  '#/obligations': '/api/ri-lab/obligations?scope=operational',
  '#/assessments': '/api/ri-lab/impact-assessments',
  '#/risks': '/api/ri-lab/risks',
  '#/controls': '/api/ri-lab/controls',
  '#/my-tasks': '/api/ri-lab/my-tasks?scope=mine&page=1&pageSize=10',
  '#/notifications': '/api/ri-lab/notifications?limit=10',
  '#/notifications/inbox': '/api/ri-lab/notifications?limit=10&status=unread',
  '#/horizon/watchlists': '/api/ri-lab/watchlists?includeDisabled=1',
  '#/horizon/consultations': '/api/ri-lab/consultations',
  '#/reports': null,
  '#/admin/health': '/api/ri-lab/readiness',
};

function collectRoutes() {
  const routes = [{ name: 'Dashboard', href: '#/dashboard' }];
  for (const section of SIDE_NAV) {
    if (section.path && !section.items) {
      if (section.path !== 'dashboard') routes.push({ name: section.label, href: `#/${section.path}` });
      continue;
    }
    for (const item of section.items || []) {
      if (['ingestion', 'ai-operations'].includes(item.path)) continue;
      routes.push({ name: `${section.label} — ${item.label}`, href: sideNavHref(item) });
    }
  }
  return routes;
}

const routes = collectRoutes();
const results = [];

mkdirSync(OUT, { recursive: true });
await requireUatPersonas(['C'], { label: 'nav-capability' });
await runAs('C', async ({ page }) => {
  for (const route of routes) {
    const apiPath = API_BY_ROUTE[route.href];
    await page.goto(`${LAB}${route.href}`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
    await page.waitForFunction(() => document.documentElement.dataset.riMounted === '1', null, { timeout: 25_000 }).catch(() => {});
    if (['#/feed', '#/horizon', '#/library'].includes(route.href)) {
      await page
        .waitForFunction(
          () =>
            document.querySelectorAll('[data-feed-item], [data-horizon-item], .ri-library-table tbody tr').length > 0 ||
            !/loading connected/i.test(document.body?.innerText || ''),
          null,
          { timeout: 120_000 },
        )
        .catch(() => {});
    }
    const ui = await page.evaluate(() => ({
      h1: document.querySelector('h1')?.innerText?.slice(0, 100) || '',
      appLen: document.getElementById('ri-app')?.innerText?.length || 0,
      notFound: /page not found/i.test(document.querySelector('h1')?.innerText || ''),
    }));
    let api = { status: 0, ok: false, object: false };
    if (apiPath) {
      api = await page.evaluate(async (path) => {
        const res = await fetch(path, { credentials: 'same-origin', cache: 'no-store' });
        let body = null;
        try {
          body = await res.json();
        } catch {
          body = null;
        }
        return { status: res.status, ok: res.ok, object: Boolean(body && typeof body === 'object') };
      }, apiPath);
    }
    const ok = !ui.notFound && ui.appLen > 40 && (apiPath == null ? true : api.ok && api.object);
    results.push({ ...route, ok, ui, api: apiPath ? api : null });
    console.log(ok ? 'PASS' : 'FAIL', route.name);
  }
});

writeFileSync(join(OUT, 'RESULT.json'), JSON.stringify({ generatedAt: new Date().toISOString(), routes: results.length, failed: results.filter((r) => !r.ok).length, results }, null, 2));
if (results.some((r) => !r.ok)) process.exit(1);