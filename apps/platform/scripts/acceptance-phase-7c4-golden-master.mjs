#!/usr/bin/env node
/**
 * Phase 7C.4 — downstream assurance golden-master parity.
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
  'evidence-attribution-parity.mjs',
  'action-overdue-parity.mjs',
  'downstream-parity.mjs',
  'trace-parity.mjs',
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
  if (readFileSync(f, 'utf8').includes('design-lab/regulatory-intelligence')) {
    failMsg(`design lab import in ${f}`);
  }
}
pass('production /ri has no design-lab runtime imports');

const traceSvc = readFileSync(join(platformRoot, 'lib', 'ri', 'services', 'trace.ts'), 'utf8');
if (traceSvc.includes('supportingEvidence') && traceSvc.includes('directEvidence')) {
  pass('trace service direct vs supporting evidence');
} else failMsg('trace service evidence separation');

const { createFreshState } = await import(pathToFileURL(join(labRoot, 'js', 'migrate.js')).href);
const { hydrateStore } = await import(pathToFileURL(join(labRoot, 'js', 'store.js')).href);
const { compareEvd009GoldenMaster } = await import(
  pathToFileURL(join(compatDir, 'evidence-attribution-parity.mjs')).href,
);
const {
  comparePoliciesParity,
  compareRisksParity,
  compareControlsParity,
  compareActionsParity,
  compareEvidenceParity,
  compareFindingsParity,
  compareAssuranceParity,
} = await import(pathToFileURL(join(compatDir, 'downstream-parity.mjs')).href);
const { compareTraceFlagships } = await import(pathToFileURL(join(compatDir, 'trace-parity.mjs')).href);

const state = createFreshState();
hydrateStore(state);

const policies = comparePoliciesParity(state);
if (policies.match) pass(`policies parity (${policies.labCount})`);
else failMsg(`policies parity lab=${policies.labCount} prod=${policies.prodCount}`);

const risks = compareRisksParity(state);
if (risks.match) pass(`risks parity (${risks.labCount})`);
else failMsg(`risks parity lab=${risks.labCount} prod=${risks.prodCount}`);

const controls = compareControlsParity(state);
if (controls.match) pass(`controls parity (${controls.labCount})`);
else failMsg(`controls parity lab=${controls.labCount} prod=${controls.prodCount}`);

const actions = compareActionsParity(state);
if (actions.match) pass(`actions parity (${actions.labCount})`);
else failMsg(`actions parity lab=${actions.labCount} prod=${actions.prodCount}`);

const evidence = compareEvidenceParity(state);
if (evidence.match) pass(`evidence parity (${evidence.labCount})`);
else failMsg(`evidence parity lab=${evidence.labCount} prod=${evidence.prodCount}`);

const evd9 = compareEvd009GoldenMaster(state);
if (evd9.match) pass('EVD-009 direct/supporting attribution');
else failMsg('EVD-009 attribution regression');

const findings = compareFindingsParity(state);
if (findings.match) pass(`findings parity (${findings.labCount})`);
else failMsg(`findings parity lab=${findings.labCount} prod=${findings.prodCount}`);

const assurance = compareAssuranceParity(state);
if (assurance.match) pass(`assurance parity (${assurance.labCount})`);
else failMsg(`assurance parity lab=${assurance.labCount} prod=${assurance.prodCount}`);

const trace = compareTraceFlagships(state);
if (trace.match) pass('flagship traceability chains');
else failMsg(`trace chains: ${trace.mismatches.join(', ')}`);

const oblDetail = readFileSync(join(platformRoot, 'app', 'ri', 'obligations', '[id]', 'page.tsx'), 'utf8');
if (oblDetail.includes('Direct evidence') && oblDetail.includes('Supporting evidence')) {
  pass('obligation detail evidence distinction');
} else failMsg('obligation detail evidence panels');

const visualDoc = join(platformRoot, 'docs', 'visual-review', 'phase-7c4-downstream-parity.md');
if (existsSync(visualDoc)) pass('phase 7C.4 visual parity doc');
else failMsg('phase-7c4-downstream-parity.md missing');

const pkg = readFileSync(join(platformRoot, 'package.json'), 'utf8');
if (pkg.includes('test:acceptance:phase7c4')) pass('npm script phase7c4');
else failMsg('npm script phase7c4');

if (fail) {
  console.error(`\nPhase 7C.4 golden master acceptance: FAIL (${fail})`);
  process.exit(1);
}
console.log('\nPhase 7C.4 golden master acceptance: PASS');
