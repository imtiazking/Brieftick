#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runPhase7c7WorkflowVerification } from './local-db/workflow-phase-7c7.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const platformRoot = join(__dir, '..');
const repoRoot = join(platformRoot, '..', '..');
const labRoot = join(repoRoot, 'design-lab', 'regulatory-intelligence');

let fail = 0;
const pass = (m) => console.log(`PASS: ${m}`);
const failMsg = (m) => {
  fail += 1;
  console.error(`FAIL: ${m}`);
};

if (!existsSync(join(platformRoot, 'docs', 'RI-ASK-RI-GOLDEN-MASTER-PRODUCTIONISATION.md'))) {
  failMsg('productionisation map');
} else pass('RI-ASK-RI-GOLDEN-MASTER-PRODUCTIONISATION.md');

if (!existsSync(join(platformRoot, 'app', 'ri', 'ask', 'page.tsx'))) failMsg('/ri/ask route');
else pass('/ri/ask route');

const perms = readFileSync(join(platformRoot, 'lib', 'ri', 'permissions.ts'), 'utf8');
if (perms.includes("'ask-ri:read'")) pass('ask-ri:read permission');
else failMsg('ask-ri:read');

for (const f of walk(join(platformRoot, 'app', 'ri'))) {
  if (readFileSync(f, 'utf8').includes('design-lab/regulatory-intelligence')) {
    failMsg(`design lab import in ${f}`);
  }
}
pass('no design-lab imports under app/ri');

const evalRaw = JSON.parse(readFileSync(join(labRoot, 'scripts', 'ask-ri-eval-set.json'), 'utf8'));
const evalQuestions = Array.isArray(evalRaw) ? evalRaw : evalRaw.questions ?? [];
const { createFreshState } = await import(pathToFileURL(join(labRoot, 'js', 'migrate.js')).href);
const { hydrateStore } = await import(pathToFileURL(join(labRoot, 'js', 'store.js')).href);
const { compareAskRiPortVsLab } = await import(
  pathToFileURL(join(platformRoot, 'lib', 'ri', 'lab-compat', 'ask-ri-parity.mjs')).href,
);

const state = createFreshState();
hydrateStore(state);
let parityOk = 0;
for (const q of evalQuestions.slice(0, 6)) {
  const cmp = await compareAskRiPortVsLab(state, q.question);
  if (cmp.match) parityOk += 1;
  else failMsg(`parity ${q.id} lab=${cmp.labState} port=${cmp.portState}`);
}
if (parityOk >= 4) pass(`golden parity sample (${parityOk}/6)`);

const unseen = JSON.parse(readFileSync(join(platformRoot, 'scripts', 'ask-ri-unseen-eval.json'), 'utf8'));
const { runAskRiDeterministic } = await import(
  pathToFileURL(join(platformRoot, 'lib', 'ri', 'ask-ri', 'run-ask-ri.mjs')).href,
);
for (const u of unseen) {
  const r = runAskRiDeterministic(state, u.question);
  if (u.expect === 'UNRESOLVED' && r.status !== 'UNRESOLVED') failMsg(`unseen ${u.id}`);
  else if (u.expect === 'UNRESOLVED_OR_BLOCKED' && r.status === 'ANSWERED') failMsg(`unseen ${u.id} false answer`);
  else pass(`unseen ${u.id}`);
}

const portAi = join(platformRoot, 'lib', 'ri', 'ask-ri', 'port', 'ai');
const hardcode = evalQuestions.some((q) =>
  readFileSync(join(portAi, 'ri-graph-plan.js'), 'utf8').includes(q.question),
);
if (hardcode) failMsg('eval string hard-coded in planner');
else pass('no eval prompt hard-coding in planner');

const wf = await runPhase7c7WorkflowVerification();
for (const m of wf.pass) pass(`local DB: ${m}`);
for (const m of wf.fail) failMsg(`local DB: ${m}`);

if (fail) {
  console.error(`\nPhase 7C.7 Ask RI acceptance: FAIL (${fail})`);
  process.exit(1);
}
console.log('\nPhase 7C.7 Ask RI golden master acceptance: PASS');

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (/\.(tsx?|jsx?)$/.test(name)) acc.push(p);
  }
  return acc;
}
