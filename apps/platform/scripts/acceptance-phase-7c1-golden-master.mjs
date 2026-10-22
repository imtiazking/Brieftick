#!/usr/bin/env node
/**
 * Phase 7C.1 — golden master parity (Design Lab fixture state vs production parity selectors).
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

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

const doc = join(platformRoot, 'docs', 'RI-GOLDEN-MASTER-PRODUCTIONISATION.md');
if (!existsSync(doc)) failMsg('RI-GOLDEN-MASTER-PRODUCTIONISATION.md missing');
else pass('productionisation map');

const compatDir = join(platformRoot, 'lib', 'ri', 'lab-compat');
for (const f of ['obligation-portfolio.mjs', 'dashboard-parity.mjs', 'index.ts']) {
  if (!existsSync(join(compatDir, f))) failMsg(`missing lab-compat/${f}`);
  else pass(`lab-compat/${f}`);
}

function walkRi(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walkRi(p, acc);
    else if (/\.(tsx?|jsx?)$/.test(name)) acc.push(p);
  }
  return acc;
}

for (const f of walkRi(join(platformRoot, 'app', 'ri'))) {
  const text = readFileSync(f, 'utf8');
  if (text.includes('design-lab/regulatory-intelligence')) failMsg(`design lab import in ${f}`);
  if (/localStorage\.(setItem|getItem)/.test(text)) failMsg(`localStorage business state in ${f}`);
}
pass('production /ri has no design-lab imports or localStorage authority');

const { createFreshState } = await import(pathToFileURL(join(labRoot, 'js', 'migrate.js')).href);
const { hydrateStore, computeDashboardStats } = await import(pathToFileURL(join(labRoot, 'js', 'store.js')).href);
const { computeDashboardParityFromLabState } = await import(
  pathToFileURL(join(compatDir, 'dashboard-parity.mjs')).href,
);

const state = createFreshState();
hydrateStore(state);
const lab = computeDashboardStats();
const prod = computeDashboardParityFromLabState(state);

const pairs = [
  ['openObligations', 'openObligations'],
  ['oblOverdue', 'oblOverdue'],
  ['upcomingDeadlines', 'upcomingDeadlines'],
  ['actionsOpen', 'actionsOpen'],
  ['actionsOverdue', 'actionsOverdue'],
  ['iaDraft', 'iaDraft'],
  ['iaReview', 'iaReview'],
  ['awaitingReview', 'awaitingReview'],
];

for (const [labKey, prodKey] of pairs) {
  if (lab[labKey] === prod[prodKey]) pass(`dashboard parity ${labKey}=${lab[labKey]}`);
  else failMsg(`dashboard parity ${labKey}: lab=${lab[labKey]} prod=${prod[prodKey]}`);
}

const pkg = readFileSync(join(platformRoot, 'package.json'), 'utf8');
if (pkg.includes('test:acceptance:phase7c1')) pass('npm script phase7c1');
else failMsg('npm script phase7c1');

if (fail) {
  console.error(`\nPhase 7C.1 golden master acceptance: FAIL (${fail})`);
  process.exit(1);
}
console.log('\nPhase 7C.1 golden master acceptance: PASS');
