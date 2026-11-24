#!/usr/bin/env node
/**
 * Hosted Design Lab triage and module read. No writes and no paid AI.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../../lib/ri/eval/eval-paths.mjs';
import { runAs, STAGING_ORIGIN } from '../uat/staging-user-sessions.mjs';

const LAB = `${STAGING_ORIGIN}/design-lab/regulatory-intelligence/index.html`;
const OUT = join(REPO_ROOT, 'docs', 'uat', 'evidence', 'triage-2026-11-24');
mkdirSync(OUT, { recursive: true });

const routes = [
  ['dashboard', '#/dashboard', 'dashboard'],
  ['publications', '#/library', 'publications'],
  ['obligation-triage', '#/triage/obligations', 'obligation-triage'],
  ['non-obligation-triage', '#/triage/non-obligations', 'non-obligation-triage'],
  ['exception-triage', '#/triage/exceptions', 'exception-triage'],
  ['obligations', '#/obligations', 'obligations'],
  ['impacts', '#/assessments', 'impact-assessments'],
  ['reporting', '#/reports', 'reporting'],
  ['changes', '#/changes', 'changes'],
  ['risks', '#/risks', 'risks'],
  ['controls', '#/controls', 'controls'],
  ['actions', '#/actions', 'actions'],
  ['evidence', '#/evidence', 'evidence'],
  ['notifications', '#/notifications', 'notifications'],
  ['audit', '#/audit', 'audit'],
  ['admin', '#/admin', 'admin'],
];

const anon = await fetch(`${STAGING_ORIGIN}/api/ri-lab/triage`, { headers: { accept: 'application/json' } });
const scriptRes = await fetch(`${STAGING_ORIGIN}/design-lab/regulatory-intelligence/js/platform/connected-triage.js`, {
  headers: { 'cache-control': 'no-cache' },
});
const scriptText = scriptRes.ok ? await scriptRes.text() : '';

const hosted = await runAs('A', async ({ page }) => {
  const triage = await page.request.get(`${STAGING_ORIGIN}/api/ri-lab/triage`);
  const triageBody = await triage.json().catch(() => null);
  const pages = [];
  for (const [name, hash, file] of routes) {
    await page.goto(`${LAB}${hash}`, { waitUntil: 'domcontentloaded' });
    if (name === 'dashboard') {
      await page.waitForFunction(
        () => {
          const title = document.querySelector('.ri-page-head__title')?.textContent || '';
          return /\d+ publication/.test(title) || title.includes('Loading staging catalogue');
        },
        { timeout: 90_000 },
      );
    } else if (name.endsWith('triage')) {
      await page.waitForFunction(() => {
        const el = document.querySelector('[data-triage-status]');
        return el && !el.textContent.includes('Loading this organisation');
      }, { timeout: 60000 }).catch(() => {});
      await page.waitForTimeout(1000);
    } else {
      await page.waitForTimeout(2500);
    }
    const snap = await page.evaluate(() => ({
      title: document.querySelector('h1, .ri-page-head__title')?.textContent?.trim() || '',
      body: document.querySelector('#app, main, body')?.innerText?.slice(0, 500) || '',
      triageCounts: Object.fromEntries([...document.querySelectorAll('[data-triage-count]')].map((el) => [el.getAttribute('data-triage-count'), el.textContent])),
    }));
    await page.screenshot({ path: join(OUT, `${file}.png`), fullPage: true });
    pages.push({ name, hash, ...snap });
  }
  return { triageHttp: triage.status(), triageBody, pages };
});

const report = {
  generatedAt: new Date().toISOString(),
  anonymousTriageHttp: anon.status,
  deployedTriageScript: scriptRes.status === 200 && scriptText.includes('Obligation Triage') && scriptText.includes('data-triage-count'),
  ...hosted,
};
writeFileSync(join(OUT, 'result.json'), JSON.stringify({
  ...report,
  pages: report.pages.map((p) => ({ name: p.name, hash: p.hash, title: p.title, triageCounts: p.triageCounts, body: p.body })),
}, null, 2));
console.log(JSON.stringify({
  anonymousTriageHttp: anon.status,
  deployedTriageScript: report.deployedTriageScript,
  triageHttp: hosted.triageHttp,
  counts: hosted.triageBody?.counts || null,
  truncated: hosted.triageBody?.truncated || null,
  pages: hosted.pages.map((p) => ({ name: p.name, title: p.title, counts: p.triageCounts })),
}, null, 2));
