#!/usr/bin/env node
/**
 * Staging scheduler env activation (forgeniq-platform-staging production scope only).
 * Never prints secrets. Optionally rotates CRON_SECRET when --rotate-cron is passed.
 */
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const SCOPE = 'imis-projects-8e15dca0';
const PROJECT = 'forgeniq-platform-staging';

const ACTIVATE = {
  FORGENIQ_RI_SCHEDULER_CRON_ENABLED: 'true',
  FORGENIQ_INGEST_ENV: 'staging',
  RI_AI_EXECUTION_ENABLED: 'false',
};

function vercel(args, input) {
  return spawnSync('vercel', args, {
    encoding: 'utf8',
    shell: process.platform === 'win32',
    windowsHide: true,
    input,
  });
}

function upsert(name, value) {
  const ls = vercel(['env', 'ls', 'production', `--scope=${SCOPE}`, `--project=${PROJECT}`]);
  const present = new RegExp(`^\\s*${name}\\s`, 'm').test(ls.stdout || '');
  if (present) {
    return vercel([
      'env',
      'update',
      name,
      '--environment',
      'production',
      '--value',
      value,
      '--yes',
      '--sensitive',
      `--scope=${SCOPE}`,
      `--project=${PROJECT}`,
    ]);
  }
  return vercel([
    'env',
    'add',
    name,
    'production',
    '--value',
    value,
    '--yes',
    '--sensitive',
    `--scope=${SCOPE}`,
    `--project=${PROJECT}`,
  ]);
}

const dryRun = process.argv.includes('--dry-run');
const rotateCron = process.argv.includes('--rotate-cron');
const skipSchedulerEnable = process.argv.includes('--skip-scheduler-enable');
const secretPath = join(process.cwd(), '.vercel', '.cron-secret-session');

const plan = { dryRun, rotateCron, updates: [] };

const activateEntries = { ...ACTIVATE };
if (skipSchedulerEnable) delete activateEntries.FORGENIQ_RI_SCHEDULER_CRON_ENABLED;

for (const [name, value] of Object.entries(activateEntries)) {
  plan.updates.push({ name, action: 'upsert', value });
}

let cronRotated = false;
if (rotateCron) {
  const secret = randomBytes(32).toString('hex');
  if (!dryRun) {
    writeFileSync(secretPath, secret, { encoding: 'utf8', mode: 0o600 });
  }
  plan.updates.push({ name: 'CRON_SECRET', action: 'rotate', len: secret.length });
  if (!dryRun) {
    const out = upsert('CRON_SECRET', secret);
    cronRotated = out.status === 0;
    if (!cronRotated) {
      if (existsSync(secretPath)) unlinkSync(secretPath);
      console.log(JSON.stringify({ ok: false, step: 'CRON_SECRET', detail: String(out.stderr || out.stdout).slice(0, 200) }));
      process.exit(1);
    }
  }
}

const results = [];
for (const [name, value] of Object.entries(activateEntries)) {
  if (dryRun) {
    results.push({ name, value, action: 'would_upsert' });
    continue;
  }
  const out = upsert(name, value);
  results.push({
    name,
    value: name.includes('SECRET') ? '[redacted]' : value,
    ok: out.status === 0,
    detail: out.status === 0 ? undefined : String(out.stderr || out.stdout).slice(0, 200),
  });
  if (out.status !== 0) {
    console.log(JSON.stringify({ ok: false, results, cronRotated, cronSecretFile: cronRotated ? secretPath : null }));
    process.exit(1);
  }
}

console.log(
  JSON.stringify({
    ok: true,
    dryRun,
    rotateCron,
    cronRotated,
    cronSecretFile: cronRotated && !dryRun ? secretPath : null,
    results: dryRun ? plan.updates : results,
    note: 'Redeploy staging for env changes to take effect on hosted routes.',
  }),
);