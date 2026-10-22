#!/usr/bin/env node
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runPhase6IngestionVerification } from './local-db/workflow-phase6.mjs';

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
  join(platformRoot, 'supabase', 'migrations', '20260323160000_ri_ingestion.sql'),
  'utf8',
);
for (const t of ['ingestion_runs', 'ingestion_items', 'regulatory_publication_versions', 'source_ingestion_mode']) {
  if (!migration.includes(t)) failMsg(`migration missing ${t}`);
  else pass(`migration ${t}`);
}

const routes = [
  'app/ri/admin/sources/page.tsx',
  'app/ri/admin/ingestion/page.tsx',
  'app/ri/admin/ingestion/[runId]/page.tsx',
];
for (const r of routes) {
  if (!existsSync(join(platformRoot, r))) failMsg(`missing ${r}`);
  else pass(`route ${r}`);
}

for (const f of [
  'lib/ri/ingestion/ingest-engine.mjs',
  'lib/ri/ingestion/eligibility.mjs',
  'lib/ri/ingestion/adapter.mjs',
  'lib/ri/ingestion/connector-registry.mjs',
  'scripts/ri-ingest.mjs',
]) {
  if (!existsSync(join(platformRoot, f))) failMsg(`missing ${f}`);
  else pass(f);
}

const engine = readFileSync(join(platformRoot, 'lib', 'ri', 'ingestion', 'ingest-engine.mjs'), 'utf8');
if (engine.includes('regulatory_changes') || engine.includes('organisation_publications')) {
  failMsg('ingest engine must not auto-create tenant workflow');
} else pass('no downstream auto-create in engine');

const eligibility = readFileSync(join(platformRoot, 'lib', 'ri', 'ingestion', 'eligibility.mjs'), 'utf8');
if (!eligibility.includes('SANCTIONS_DATA')) failMsg('sanctions data gate');
else pass('SANCTIONS_DATA excluded from RI ingestion');

const adapter = readFileSync(join(platformRoot, 'lib', 'ri', 'ingestion', 'adapter.mjs'), 'utf8');
if (adapter.includes('window') || adapter.includes('document.')) failMsg('browser in adapter');
else pass('connectors server-side adapter only');

const pkg = readFileSync(join(platformRoot, 'package.json'), 'utf8');
if (!pkg.includes('ri:ingest')) failMsg('ri:ingest script');
else pass('npm run ri:ingest');

function scanDir(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const f of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, f.name);
    if (f.isDirectory()) scanDir(p, acc);
    else if (/\.(tsx?|mjs)$/.test(f.name)) acc.push(p);
  }
  return acc;
}
for (const file of scanDir(join(platformRoot, 'lib', 'ri', 'ingestion'))) {
  const text = readFileSync(file, 'utf8');
  if (/cron|schedule|vercel\.json/i.test(text)) failMsg(`scheduler reference in ${file}`);
}
pass('no scheduler in ingestion layer');

const wf = await runPhase6IngestionVerification();
for (const m of wf.pass) pass(`local DB: ${m}`);
for (const m of wf.fail) failMsg(`local DB: ${m}`);

if (fail) {
  console.error(`\nPhase 6 RI ingestion acceptance: FAIL (${fail})`);
  process.exit(1);
}
console.log('\nPhase 6 RI ingestion acceptance: PASS');
