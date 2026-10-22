#!/usr/bin/env node
/**
 * Phase 7C.3 — Changes, Impact Assessments, Obligations golden-master parity.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const platformRoot = join(__dir, '..');
const repoRoot = join(platformRoot, '..', '..');
const labRoot = join(repoRoot, 'design-lab', 'regulatory-intelligence');
const compatDir = join(platformRoot, 'lib', 'ri', 'lab-compat');

let fail = 0;
const pass = (m) => console.log(`PASS: ${m}`);
const failMsg = (m) => {
  fail += 1;
  console.error(`FAIL: ${m}`);
};

for (const f of [
  'lifecycle-status.mjs',
  'changes-parity.mjs',
  'impact-parity.mjs',
  'obligations-parity.mjs',
  'obligation-portfolio.mjs',
]) {
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
}
pass('production /ri has no design-lab runtime imports');

const { createFreshState } = await import(pathToFileURL(join(labRoot, 'js', 'migrate.js')).href);
const { hydrateStore } = await import(pathToFileURL(join(labRoot, 'js', 'store.js')).href);
const { compareChangesParity, compareFlagshipChangeChains } = await import(
  pathToFileURL(join(compatDir, 'changes-parity.mjs')).href,
);
const { compareImpactParity } = await import(pathToFileURL(join(compatDir, 'impact-parity.mjs')).href);
const { compareObligationParity } = await import(
  pathToFileURL(join(compatDir, 'obligations-parity.mjs')).href,
);

const state = createFreshState();
hydrateStore(state);

const changes = compareChangesParity(state);
if (changes.match) pass(`changes parity (${changes.labCount} records)`);
else failMsg(`changes parity lab=${changes.labCount} prod=${changes.prodCount}`);

const chains = compareFlagshipChangeChains(state);
if (chains.match) pass('flagship publication → change → impact → obligation chains');
else failMsg(`flagship chains: ${chains.mismatches.join(', ')}`);

const impacts = compareImpactParity(state);
if (impacts.match) pass(`impact assessments parity (${impacts.labCount} records)`);
else failMsg(`impact parity lab=${impacts.labCount} prod=${impacts.prodCount}`);

const obls = compareObligationParity(state);
if (obls.match) {
  pass(
    `obligations parity (total=${obls.labPortfolio.counts.TOTAL} active=${obls.labPortfolio.counts.ACTIVE} overdue=${obls.labPortfolio.flags.overdueActive})`,
  );
} else {
  failMsg('obligations taxonomy or record-set mismatch');
}

const oblPage = readFileSync(join(platformRoot, 'app', 'ri', 'obligations', 'page.tsx'), 'utf8');
if (oblPage.includes('ri-metrics-row')) pass('obligations lab metrics row');
else failMsg('obligations metrics row missing');

const visualDoc = join(platformRoot, 'docs', 'visual-review', 'phase-7c3-lifecycle-parity.md');
if (existsSync(visualDoc)) pass('phase 7C.3 visual parity evidence doc');
else failMsg('phase-7c3-lifecycle-parity.md missing');

const pkg = readFileSync(join(platformRoot, 'package.json'), 'utf8');
if (pkg.includes('test:acceptance:phase7c3')) pass('npm script phase7c3');
else failMsg('npm script phase7c3 missing');

if (fail) {
  console.error(`\nPhase 7C.3 golden master acceptance: FAIL (${fail})`);
  process.exit(1);
}
console.log('\nPhase 7C.3 golden master acceptance: PASS');
