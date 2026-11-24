#!/usr/bin/env node
/**
 * Hosted: My Tasks API counts for Users A, B, C (mine vs team scope).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../../lib/ri/eval/eval-paths.mjs';
import { STAGING_ORIGIN, runAs, requireUatPersonas } from './staging-user-sessions.mjs';

const OUT = join(REPO_ROOT, 'docs', 'uat', 'evidence', 'my-tasks-staging-2026-11-24');
mkdirSync(OUT, { recursive: true });

await requireUatPersonas(['A', 'B', 'C'], { label: 'my-tasks-abc' });

async function fetchTasks(page, scope) {
  return page.evaluate(async (scope) => {
    const res = await fetch(`/api/ri-lab/my-tasks?scope=${scope}&pageSize=25&viewFilter=OPEN`, {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    });
    const body = await res.json().catch(() => ({}));
    return { ok: res.ok && body.ok, metrics: body.metrics, filteredTotal: body.filteredTotal, sample: (body.items || []).slice(0, 3) };
  }, scope);
}

const report = { generatedAt: new Date().toISOString(), personas: {} };

for (const key of ['A', 'B', 'C']) {
  report.personas[key] = await runAs(key, async ({ page }) => {
    await page.goto(`${STAGING_ORIGIN}/design-lab/regulatory-intelligence/index.html#/dashboard`, {
      waitUntil: 'domcontentloaded',
      timeout: 120_000,
    });
    const mine = await fetchTasks(page, 'mine');
    const team = await fetchTasks(page, 'team');
    return { mine, team };
  });
}

report.ok =
  report.personas.A?.mine?.ok &&
  report.personas.B?.mine?.ok &&
  report.personas.C?.mine?.ok &&
  report.personas.B?.team?.filteredTotal >= report.personas.B?.mine?.filteredTotal;

writeFileSync(join(OUT, 'MY-TASKS-ABC.json'), JSON.stringify(report, null, 2));

if (!report.ok) {
  console.error('staging-my-tasks-abc: FAIL', report);
  process.exit(1);
}
console.log('staging-my-tasks-abc: PASS', report);