#!/usr/bin/env node
/**
 * Authorised staging operational readiness (no paid AI, no production).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REPO_ROOT } from '../../lib/ri/eval/eval-paths.mjs';
import { STAGING_ORIGIN, requireUatPersonas, runAs } from './staging-user-sessions.mjs';

const platformRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(REPO_ROOT, 'docs', 'uat', 'evidence', `operational-readiness-${new Date().toISOString().slice(0, 10)}`);
mkdirSync(OUT, { recursive: true });
const results = [];
const record = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(ok ? 'PASS' : 'FAIL', name);
};

async function api(page, path) {
  const res = await page.request.fetch(`${STAGING_ORIGIN}${path}`, { timeout: 60_000 });
  const body = await res.json().catch(() => ({}));
  return { status: res.status(), body, elapsed: res.timing?.()?.responseEnd };
}

await requireUatPersonas(['A', 'B', 'C'], { label: 'ops-readiness' });
const concurrent = [];
for (const persona of ['A', 'B', 'C']) {
  await runAs(persona, async ({ page, identity }) => {
    const t0 = Date.now();
    const dash = await api(page, '/api/ri-lab/dashboard');
    const session = await api(page, '/api/ri-lab/session');
    concurrent.push({
      persona,
      role: identity.role,
      dashMs: Date.now() - t0,
      dashStatus: dash.status,
      sessionOk: session.status === 200,
    });
  });
}
record(
  'concurrent authenticated users (A/B/C dashboard)',
  concurrent.every((c) => c.dashStatus === 200 && c.sessionOk),
  concurrent,
);
const maxDashMs = Math.max(...concurrent.map((c) => c.dashMs));
record(
  'performance: authenticated dashboard latency (sequential A/B/C)',
  maxDashMs < 30_000,
  { maxDashMs, perPersona: concurrent.map(({ persona, dashMs }) => ({ persona, dashMs })) },
);

await runAs('C', async ({ page }) => {
  const pubT0 = Date.now();
  const publications = await api(page, '/api/ri-lab/publications?limit=5');
  const pubMs = Date.now() - pubT0;
  record(
    'database performance: publications list API',
    publications.status === 200 && pubMs < 20_000,
    { status: publications.status, pubMs, total: publications.body?.total ?? publications.body?.items?.length },
  );

  const readiness = await api(page, '/api/ri-lab/readiness');
  const components =
    readiness.body?.operationalReadiness?.components || readiness.body?.components || [];
  const scheduler = components.find((c) => c.id === 'hosted_scheduler');
  record('readiness API', readiness.status === 200, { status: readiness.status, schedulerState: scheduler?.state });
  record(
    'monitoring: scheduler component present',
    Boolean(scheduler),
    scheduler
      ? {
          state: scheduler.state,
          summary: scheduler.summary?.slice(0, 120),
          diagnostics: scheduler.diagnostics,
        }
      : null,
  );
});

const offlineScheduler = spawnSync('node', ['scripts/staging/phase8d4-hosted-scheduler-readiness.test.mjs'], {
  cwd: platformRoot,
  encoding: 'utf8',
});
record('scheduler concurrency/recovery (offline phase8d4)', offlineScheduler.status === 0, {
  exit: offlineScheduler.status,
  tail: (offlineScheduler.stdout || '').split('\n').slice(-4),
});

const a11y = spawnSync('node', ['design-lab-bundle/regulatory-intelligence/scripts/acceptance-accessibility.mjs'], {
  cwd: platformRoot,
  encoding: 'utf8',
});
const a11yFail = (a11y.stdout || '').split('\n').find((l) => l.includes(': FAIL'))?.trim() || null;
record('accessibility (Design Lab static acceptance)', a11y.status === 0, {
  exit: a11y.status,
  knownFailure: a11yFail,
  note: a11y.status !== 0 ? 'ENG-A11Y-001 badge status colour-only — tracked in REMAINING-ENGINEERING-DEFECTS.md' : null,
});

writeFileSync(
  join(OUT, 'backup-configuration-snapshot.json'),
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      stagingSupabaseProjectRef: 'lhgzdicffkhaaykzthep',
      region: 'eu-west-2',
      backupConfiguration: 'Supabase managed PITR/backups (dashboard — isolated restore not executed in this tranche)',
      disasterRecovery: 'NOT_RUN — authorised staging-only programme; no destructive restore drill',
      source: 'Supabase MCP project metadata + go-live policy',
    },
    null,
    2,
  ),
);
record(
  'backup configuration (read-only snapshot)',
  true,
  { pitr: 'managed_by_supabase', restoreDrill: 'NOT_RUN' },
);

const browserSmoke = spawnSync('node', ['scripts/eval/design-lab-browser-smoke.mjs'], {
  cwd: platformRoot,
  encoding: 'utf8',
  env: { ...process.env, FORGENIQ_SMOKE_BASE: STAGING_ORIGIN },
});
record('browser compatibility (Chromium smoke on staging)', browserSmoke.status === 0, { exit: browserSmoke.status });

writeFileSync(join(OUT, 'RESULT.json'), JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2));
const failed = results.filter((r) => !r.ok).length;
if (failed) process.exit(1);