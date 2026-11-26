#!/usr/bin/env node
/**
 * Phase 8D.4 — hosted scheduler readiness (offline, no network, no database).
 * Route present, fail-closed auth, environment gates, read-only plan gating, default-off cron config.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertHostedSchedulerEnvironment,
  isHostedSchedulerEnabled,
  planHostedSchedulerInvocation,
  runHostedSchedulerInvocation,
} from '../../lib/ri/ingestion/ops/hosted-scheduler-run.mjs';

const platformRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SECRET = 'test-cron-secret-min-16-chars';
const STAGING_URL =
  'postgresql://postgres.lhgzdicffkhaaykzthep:pw@aws-0-eu-west-2.pooler.supabase.com:5432/postgres';
const OTHER_URL = 'postgresql://postgres.aaaaaaaaaaaaaaaaaaaa:pw@aws-0-eu-west-2.pooler.supabase.com:5432/postgres';

const ENV_KEYS = [
  'CRON_SECRET',
  'FORGENIQ_RI_SCHEDULER_CRON_ENABLED',
  'FORGENIQ_INGEST_ENV',
  'FORGENIQ_ENV',
  'FORGENIQ_PHASE84_LIVE_VALIDATION',
  'STAGING_DATABASE_URL',
  'FORGENIQ_LOCAL_PG_URL',
  'DATABASE_URL',
];

function resetEnv(overrides = {}) {
  for (const k of ENV_KEYS) delete process.env[k];
  Object.assign(process.env, {
    CRON_SECRET: SECRET,
    FORGENIQ_RI_SCHEDULER_CRON_ENABLED: 'true',
    FORGENIQ_INGEST_ENV: 'staging',
    STAGING_DATABASE_URL: STAGING_URL,
    ...overrides,
  });
  for (const [k, v] of Object.entries(overrides)) if (v === undefined) delete process.env[k];
}

let failures = 0;
async function check(label, fn) {
  try {
    await fn();
    console.log(`PASS: ${label}`);
  } catch (e) {
    failures += 1;
    console.error(`FAIL: ${label} — ${e.message}`);
  }
}

async function expectError(fn, expected) {
  try {
    await fn();
  } catch (e) {
    if (e.message === expected) return;
    throw new Error(`expected ${expected}, got ${e.message}`);
  }
  throw new Error(`expected ${expected}, got success`);
}

const routePath = join(platformRoot, 'app', 'api', 'internal', 'ri-ingestion', 'scheduler-tick', 'route.ts');

await check('scheduler route file exists', () => {
  if (!existsSync(routePath)) throw new Error('missing route.ts');
});

await check('route exports GET and POST, nodejs runtime, dryRun branch', () => {
  const src = readFileSync(routePath, 'utf8');
  for (const needle of [
    'export async function GET',
    'export async function POST',
    "runtime = 'nodejs'",
    "searchParams.get('dryRun') === '1'",
    'planHostedSchedulerInvocation',
  ]) {
    if (!src.includes(needle)) throw new Error(`route missing: ${needle}`);
  }
});

await check('route is public to Clerk middleware but guarded by its own bearer auth', () => {
  const mw = readFileSync(join(platformRoot, 'middleware.ts'), 'utf8');
  if (!mw.includes('/api/internal/ri-ingestion/scheduler-tick')) {
    throw new Error('middleware does not exempt scheduler-tick (cron has no Clerk session)');
  }
});

await check('vercel.json registers four UTC scheduler crons (execution still gated by FORGENIQ_RI_SCHEDULER_CRON_ENABLED)', () => {
  const v = JSON.parse(readFileSync(join(platformRoot, 'vercel.json'), 'utf8'));
  if (!Array.isArray(v.crons) || v.crons.length !== 4) throw new Error(`expected 4 crons, got ${JSON.stringify(v.crons)}`);
  const path = '/api/internal/ri-ingestion/scheduler-tick';
  if (!v.crons.every((c) => c.path === path)) throw new Error(`cron path must be ${path}`);
});

await check('enable flag off → hosted_scheduler_disabled', async () => {
  resetEnv({ FORGENIQ_RI_SCHEDULER_CRON_ENABLED: 'false' });
  await expectError(() => assertHostedSchedulerEnvironment(), 'hosted_scheduler_disabled');
  resetEnv({ FORGENIQ_RI_SCHEDULER_CRON_ENABLED: undefined });
  await expectError(() => assertHostedSchedulerEnvironment(), 'hosted_scheduler_disabled');
  if (isHostedSchedulerEnabled()) throw new Error('isHostedSchedulerEnabled true while unset');
});

await check('enable flag must be exactly "true"', async () => {
  resetEnv({ FORGENIQ_RI_SCHEDULER_CRON_ENABLED: 'TRUE' });
  await expectError(() => assertHostedSchedulerEnvironment(), 'hosted_scheduler_disabled');
  resetEnv({ FORGENIQ_RI_SCHEDULER_CRON_ENABLED: '1' });
  await expectError(() => assertHostedSchedulerEnvironment(), 'hosted_scheduler_disabled');
});

await check('disabled tick fails before any database connection', async () => {
  resetEnv({ FORGENIQ_RI_SCHEDULER_CRON_ENABLED: 'false', STAGING_DATABASE_URL: 'postgresql://unreachable.invalid:1/x' });
  await expectError(
    () => runHostedSchedulerInvocation({ invocationKind: 'VERCEL_CRON', cronSecretFromRequest: SECRET }),
    'hosted_scheduler_disabled',
  );
});

await check('non-staging ingest env → hosted_scheduler_requires_staging_env', async () => {
  resetEnv({ FORGENIQ_INGEST_ENV: 'production' });
  await expectError(() => assertHostedSchedulerEnvironment(), 'hosted_scheduler_requires_staging_env');
});

await check('Phase 84 manual bypass env → hosted_scheduler_phase84_bypass_forbidden', async () => {
  resetEnv({ FORGENIQ_PHASE84_LIVE_VALIDATION: 'true' });
  await expectError(() => assertHostedSchedulerEnvironment(), 'hosted_scheduler_phase84_bypass_forbidden');
});

await check('no database URL → hosted_scheduler_database_url_missing', async () => {
  resetEnv({ STAGING_DATABASE_URL: undefined });
  await expectError(() => assertHostedSchedulerEnvironment(), 'hosted_scheduler_database_url_missing');
});

await check('non-staging Supabase project → rejected', async () => {
  resetEnv({ STAGING_DATABASE_URL: OTHER_URL });
  let threw = false;
  try {
    assertHostedSchedulerEnvironment();
  } catch {
    threw = true;
  }
  if (!threw) throw new Error('accepted a non-staging project ref');
});

await check('staging config accepted when enabled', async () => {
  resetEnv();
  const r = assertHostedSchedulerEnvironment();
  if (r.projectRef !== 'lhgzdicffkhaaykzthep') throw new Error(`projectRef ${r.projectRef}`);
});

await check('dry-run plan: wrong bearer → unauthorized (before DB)', async () => {
  resetEnv({ STAGING_DATABASE_URL: 'postgresql://unreachable.invalid:1/x' });
  await expectError(() => planHostedSchedulerInvocation({ cronSecretFromRequest: 'wrong-secret-value-xx' }), 'hosted_scheduler_unauthorized');
  await expectError(() => planHostedSchedulerInvocation({}), 'hosted_scheduler_unauthorized');
});

await check('dry-run plan: still enforces staging env + project even when disabled', async () => {
  resetEnv({ FORGENIQ_RI_SCHEDULER_CRON_ENABLED: 'false', FORGENIQ_INGEST_ENV: 'production' });
  await expectError(() => planHostedSchedulerInvocation({ cronSecretFromRequest: SECRET }), 'hosted_scheduler_requires_staging_env');
});

await check('tick: weak server secret fails closed', async () => {
  resetEnv({ CRON_SECRET: 'short' });
  await expectError(
    () => runHostedSchedulerInvocation({ invocationKind: 'VERCEL_CRON', cronSecretFromRequest: 'short' }),
    'hosted_scheduler_cron_secret_missing_or_weak',
  );
});

for (const k of ENV_KEYS) delete process.env[k];

if (failures > 0) {
  console.error(`\nphase8d4 hosted scheduler readiness: ${failures} FAILED`);
  process.exit(1);
}
console.log('\nphase8d4 hosted scheduler readiness: ALL PASS');
