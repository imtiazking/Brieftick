#!/usr/bin/env node
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runPhase7OperationsVerification } from './local-db/workflow-phase7.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const platformRoot = join(__dir, '..');
const repoRoot = join(platformRoot, '..', '..');

let fail = 0;
function pass(msg) {
  console.log(`PASS: ${msg}`);
}
function failMsg(msg) {
  fail += 1;
  console.error(`FAIL: ${msg}`);
}

const migration = readFileSync(
  join(platformRoot, 'supabase', 'migrations', '20260324170000_ri_ingestion_operations.sql'),
  'utf8',
);
for (const t of [
  'regulatory_source_operations',
  'operational_alerts',
  'notification_events',
  'source_health_status',
  'ingestion_operational_events',
]) {
  if (!migration.includes(t)) failMsg(`migration missing ${t}`);
  else pass(`migration ${t}`);
}

if (!existsSync(join(platformRoot, 'app/ri/admin/alerts/page.tsx'))) failMsg('alerts admin route');
else pass('route /ri/admin/alerts');

for (const f of [
  'lib/ri/ingestion/ops/scheduler.mjs',
  'lib/ri/ingestion/ops/executor.mjs',
  'lib/ri/ingestion/ops/retry-policy.mjs',
  'lib/ri/ingestion/ops/health.mjs',
  'scripts/ri-scheduler-test.mjs',
]) {
  if (!existsSync(join(platformRoot, f))) failMsg(`missing ${f}`);
  else pass(f);
}

const pkg = readFileSync(join(platformRoot, 'package.json'), 'utf8');
if (!pkg.includes('ri:scheduler:test')) failMsg('ri:scheduler:test script');
else pass('npm run ri:scheduler:test');

const vercel = join(repoRoot, 'vercel.json');
if (existsSync(vercel)) {
  const v = readFileSync(vercel, 'utf8');
  if (/cron|schedule/i.test(v) && /ri|ingest/i.test(v)) failMsg('production scheduler in vercel.json');
  else pass('no RI cron in vercel.json');
} else pass('no vercel.json cron');

function scanNoCron(dir) {
  if (!existsSync(dir)) return;
  for (const f of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, f.name);
    if (f.isDirectory()) scanNoCron(p);
    else if (f.name.endsWith('.mjs') || f.name.endsWith('.ts')) {
      const t = readFileSync(p, 'utf8');
      if (/vercel.*cron|cron\.json/i.test(t)) failMsg(`cron reference ${p}`);
    }
  }
}
scanNoCron(join(platformRoot, 'lib', 'ri', 'ingestion'));
pass('no automated production scheduler code');

const wf = await runPhase7OperationsVerification();
for (const m of wf.pass) pass(`local DB: ${m}`);
for (const m of wf.fail) failMsg(`local DB: ${m}`);

if (fail) {
  console.error(`\nPhase 7 RI ingestion ops acceptance: FAIL (${fail})`);
  process.exit(1);
}
console.log('\nPhase 7 RI ingestion ops acceptance: PASS');
