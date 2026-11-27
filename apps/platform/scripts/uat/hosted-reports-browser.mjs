#!/usr/bin/env node
/**
 * Authenticated hosted reporting checks (export where implemented; scheduling marked unverified if absent).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../../lib/ri/eval/eval-paths.mjs';
import { requireUatPersonas, runAs, STAGING_ORIGIN } from './staging-user-sessions.mjs';
import { designLabEntry } from '../staging/staging-release-hosts.mjs';

const day = new Date().toISOString().slice(0, 10);
const OUT = join(REPO_ROOT, 'docs', 'uat', 'evidence', `reports-hosted-${day}`);
const LAB = designLabEntry(STAGING_ORIGIN);

const REPORT_ROUTES = [
  { id: 'executive', hash: '#/reports/executive' },
  { id: 'exposure', hash: '#/reports/exposure' },
  { id: 'obligations', hash: '#/reports/obligations' },
  { id: 'risk-controls', hash: '#/reports/risk-controls' },
  { id: 'assurance', hash: '#/reports/assurance' },
  { id: 'remediation', hash: '#/reports/remediation' },
  { id: 'deadlines', hash: '#/reports/deadlines' },
];

const results = [];
mkdirSync(OUT, { recursive: true });
await requireUatPersonas(['C'], { label: 'reports-hosted' });

await runAs('C', async ({ page }) => {
  for (const route of REPORT_ROUTES) {
    await page.goto(`${LAB}${route.hash}`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
    await page.waitForFunction(() => document.documentElement.dataset.riMounted === '1', null, { timeout: 30_000 }).catch(() => {});
    const ui = await page.evaluate(() => ({
      notFound: /page not found/i.test(document.querySelector('h1')?.innerText || ''),
      len: document.getElementById('ri-app')?.innerText?.length || 0,
      exportBtn: !!document.querySelector('[data-export-report], [data-connected-export]'),
    }));
    results.push({
      id: route.id,
      ok: !ui.notFound && ui.len > 30,
      exportVisible: ui.exportBtn,
      scheduledReportsVerified: false,
      boardPackVerified: false,
    });
    console.log(!ui.notFound ? 'PASS' : 'FAIL', route.id);
  }
});

writeFileSync(
  join(OUT, 'RESULT.json'),
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      staging: STAGING_ORIGIN,
      note: 'Scheduled report delivery and board-pack generation remain NOT VERIFIED unless separate automation exists.',
      failed: results.filter((r) => !r.ok).length,
      results,
    },
    null,
    2,
  ),
);
if (results.some((r) => !r.ok)) process.exit(1);