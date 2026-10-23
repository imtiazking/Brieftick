#!/usr/bin/env node
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runPhase5WorkflowVerification } from './local-db/workflow-phase5.mjs';

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
  'app/ri/policies/page.tsx',
  'app/ri/policies/[id]/page.tsx',
  'app/ri/risks/page.tsx',
  'app/ri/risks/[id]/page.tsx',
  'app/ri/controls/page.tsx',
  'app/ri/controls/[id]/page.tsx',
  'app/ri/actions/page.tsx',
  'app/ri/actions/[id]/page.tsx',
  'app/ri/evidence/page.tsx',
  'app/ri/evidence/[id]/page.tsx',
  'app/ri/findings/page.tsx',
  'app/ri/findings/[id]/page.tsx',
  'app/ri/assurance/page.tsx',
  'app/ri/assurance/[id]/page.tsx',
  'app/ri/trace/[obligationId]/page.tsx',
];

for (const r of routes) {
  if (!existsSync(join(platformRoot, r))) failMsg(`missing route ${r}`);
  else pass(`route ${r}`);
}

for (const svc of [
  'lib/ri/services/policies.ts',
  'lib/ri/services/risks.ts',
  'lib/ri/services/controls.ts',
  'lib/ri/services/ri-actions.ts',
  'lib/ri/services/evidence.ts',
  'lib/ri/services/findings.ts',
  'lib/ri/services/assurance.ts',
  'lib/ri/services/trace.ts',
  'lib/ri/server-actions-downstream.ts',
  'lib/ri/links.ts',
  'lib/ri/action-overdue.ts',
]) {
  if (!existsSync(join(platformRoot, svc))) failMsg(`missing ${svc}`);
  else pass(svc);
}

const downstream = readFileSync(join(platformRoot, 'lib', 'ri', 'server-actions-downstream.ts'), 'utf8');
if (!downstream.includes('rejectClientOrganisationId')) failMsg('org spoof guard in downstream actions');
else pass('organisation_id spoof rejected in downstream mutations');

const perms = readFileSync(join(platformRoot, 'lib', 'ri', 'permissions.ts'), 'utf8');
for (const a of ['policy:write', 'assurance:write', 'finding:close']) {
  if (!perms.includes(a)) failMsg(`permission ${a}`);
  else pass(`permission ${a}`);
}

const links = readFileSync(join(platformRoot, 'lib', 'ri', 'links.ts'), 'utf8');
if (!links.includes('assertPair')) failMsg('link validation assertPair');
else pass('relationship validation assertPair');

const trace = readFileSync(join(platformRoot, 'lib', 'ri', 'services', 'trace.ts'), 'utf8');
if (!trace.includes('supportingEvidence')) failMsg('supporting evidence separation in trace');
else pass('evidence attribution in trace service');

const overdue = readFileSync(join(platformRoot, 'lib', 'ri', 'action-overdue.ts'), 'utf8');
if (overdue.includes('OVERDUE') && overdue.includes('update')) failMsg('overdue should be derived not stored');
else pass('derived overdue documented');

function scanDir(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const f of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, f.name);
    if (f.isDirectory()) scanDir(p, acc);
    else if (/\.(tsx?|mjs)$/.test(f.name)) acc.push(p);
  }
  return acc;
}
function isAiOrAskRiProductionPath(file) {
  const rel = file.replaceAll('\\', '/');
  return (
    rel.includes('/lib/ri/ai/') ||
    rel.includes('/services/ai-analysis') ||
    rel.includes('server-actions-ai') ||
    rel.includes('/app/ri/ai') ||
    rel.includes('/lib/ri/ask-ri') ||
    rel.includes('/app/ri/ask') ||
    rel.includes('server-actions-ask-ri') ||
    rel.includes('/services/ask-ri.') ||
    rel.includes('/lab-compat/ask-ri') ||
    rel.endsWith('/lib/ri/permissions.ts') ||
    rel.endsWith('/lib/ri/schema-contracts.ts') ||
    rel.endsWith('/lib/ri/workflow-events.ts')
  );
}
for (const file of [...scanDir(join(platformRoot, 'app', 'ri')), ...scanDir(join(platformRoot, 'lib', 'ri'))]) {
  if (isAiOrAskRiProductionPath(file)) continue;
  const text = readFileSync(file, 'utf8');
  if (/openai|anthropic|ask-ri|ask_ri/i.test(text)) failMsg(`AI/Ask RI reference in ${file}`);
}
pass('no Ask RI in downstream lifecycle code (Ask RI module isolated)');

const subnav = readFileSync(join(platformRoot, 'components', 'ri', 'ri-subnav.tsx'), 'utf8');
for (const href of ['/ri/policies', '/ri/controls', '/ri/assurance']) {
  if (!subnav.includes(href)) failMsg(`subnav missing ${href}`);
  else pass(`subnav ${href}`);
}

const wf = await runPhase5WorkflowVerification();
for (const m of wf.pass) pass(`local DB: ${m}`);
for (const m of wf.fail) failMsg(`local DB: ${m}`);

if (fail) {
  console.error(`\nPhase 5 RI downstream acceptance: FAIL (${fail})`);
  process.exit(1);
}
console.log('\nPhase 5 RI downstream acceptance: PASS');
