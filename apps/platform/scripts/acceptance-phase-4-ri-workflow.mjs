#!/usr/bin/env node
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runPhase4WorkflowVerification } from './local-db/workflow-phase4.mjs';

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

const routes = [
  'app/ri/publications/page.tsx',
  'app/ri/publications/[id]/page.tsx',
  'app/ri/changes/page.tsx',
  'app/ri/changes/[id]/page.tsx',
  'app/ri/impact-assessments/page.tsx',
  'app/ri/impact-assessments/[id]/page.tsx',
  'app/ri/obligations/page.tsx',
  'app/ri/obligations/[id]/page.tsx',
];

for (const r of routes) {
  if (!existsSync(join(platformRoot, r))) failMsg(`missing route ${r}`);
  else pass(`route ${r}`);
}

for (const svc of [
  'lib/ri/services/publications.ts',
  'lib/ri/services/triage.ts',
  'lib/ri/services/applicability.ts',
  'lib/ri/services/changes.ts',
  'lib/ri/services/impact.ts',
  'lib/ri/services/obligations.ts',
  'lib/ri/server-actions.ts',
  'lib/ri/permissions.ts',
]) {
  if (!existsSync(join(platformRoot, svc))) failMsg(`missing ${svc}`);
  else pass(svc);
}

const actions = readFileSync(join(platformRoot, 'lib', 'ri', 'server-actions.ts'), 'utf8');
if (!actions.includes('rejectClientOrganisationId')) failMsg('org spoof guard in actions');
else pass('organisation_id spoof rejected in mutations');

const clientTs = readFileSync(join(platformRoot, 'lib', 'supabase', 'client.ts'), 'utf8');
if (clientTs.includes('SERVICE_ROLE')) failMsg('client exposes service role');
else pass('no service role in browser client');

const src = readFileSync(join(platformRoot, 'lib', 'ri', 'services', 'impact.ts'), 'utf8');
if (!src.includes('approver_user_id = params.userId')) failMsg('approver must be server-set');
else pass('approver assigned server-side on approve');

function scanDir(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const f of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, f.name);
    if (f.isDirectory()) scanDir(p, acc);
    else if (/\.(tsx?|mjs)$/.test(f.name)) acc.push(p);
  }
  return acc;
}
for (const file of [...scanDir(join(platformRoot, 'app', 'ri')), ...scanDir(join(platformRoot, 'lib', 'ri'))]) {
  const text = readFileSync(file, 'utf8');
  if (/openai|anthropic|ask-ri|ask_ri/i.test(text)) failMsg(`AI/Ask RI reference in ${file}`);
}
pass('no AI / Ask RI in RI workflow code');

if (!existsSync(join(platformRoot, 'docs', 'RI-PERMISSIONS.md'))) failMsg('RI-PERMISSIONS.md');
else pass('permissions documented');

if (!existsSync(join(platformRoot, 'docs', 'RI-WORKFLOW-MAP.md'))) failMsg('RI-WORKFLOW-MAP.md');
else pass('workflow map documented');

if (!existsSync(join(platformRoot, 'scripts', 'ri-seed-dev-publication.mjs'))) {
  failMsg('dev publication seed script');
} else pass('dev fixture script (not public form)');

const wf = await runPhase4WorkflowVerification();
for (const m of wf.pass) pass(`local DB: ${m}`);
for (const m of wf.fail) failMsg(`local DB: ${m}`);

const lab = join(repoRoot, 'design-lab', 'regulatory-intelligence', 'js', 'router.js');
if (!existsSync(lab)) failMsg('frozen RI');
else pass('frozen design-lab untouched');

if (fail) {
  console.error(`\nPhase 4 RI workflow acceptance: FAIL (${fail})`);
  process.exit(1);
}
console.log('\nPhase 4 RI workflow acceptance: PASS');
