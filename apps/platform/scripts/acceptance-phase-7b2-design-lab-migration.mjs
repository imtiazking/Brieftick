#!/usr/bin/env node
/**
 * Phase 7B.2 — Design Lab experience migration (production apps/platform only).
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const platformRoot = join(__dir, '..');
const repoRoot = join(platformRoot, '..', '..');

let fail = 0;
const pass = (m) => console.log(`PASS: ${m}`);
const failMsg = (m) => {
  fail += 1;
  console.error(`FAIL: ${m}`);
};

const docs = [
  'docs/RI-DESIGN-LAB-PARITY.md',
  'docs/RI-VISUAL-PARITY-CHECKLIST.md',
];
for (const d of docs) {
  if (!existsSync(join(platformRoot, d))) failMsg(`missing ${d}`);
  else pass(d);
}

const landscapeRoutes = [
  'app/ri/landscape/page.tsx',
  'app/ri/landscape/catalogue/page.tsx',
  'app/ri/landscape/regulator/[id]/page.tsx',
];
for (const r of landscapeRoutes) {
  if (!existsSync(join(platformRoot, r))) failMsg(`missing ${r}`);
  else pass(`route ${r}`);
}

if (!existsSync(join(platformRoot, 'lib/ri/catalogue-display.ts'))) failMsg('catalogue-display.ts');
else pass('catalogue-display.ts');

const subnav = readFileSync(join(platformRoot, 'components/ri/ri-subnav.tsx'), 'utf8');
if (subnav.includes('/ri/landscape')) pass('subnav landscape');
else failMsg('subnav landscape');

const aiGov = readFileSync(join(platformRoot, 'app/ri/ai-governance/page.tsx'), 'utf8');
if (
  !aiGov.includes('RiAiPlaceholder') &&
  aiGov.includes('Governance and oversight of FORGENIQ AI') &&
  aiGov.includes('AI_USE_CASE_CATALOG')
) {
  pass('AI governance productionised');
} else failMsg('AI governance productionised');

const aiOps = readFileSync(join(platformRoot, 'app/ri/ai-operations/page.tsx'), 'utf8');
if (
  !aiOps.includes('RiAiPlaceholder') &&
  aiOps.includes('Operational monitoring of FORGENIQ AI')
) {
  pass('AI operations productionised');
} else failMsg('AI operations productionised');

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (/\.(tsx?|jsx?)$/.test(name)) acc.push(p);
  }
  return acc;
}

const riFiles = walk(join(platformRoot, 'app', 'ri'));
for (const f of riFiles) {
  const text = readFileSync(f, 'utf8');
  if (text.includes('design-lab/regulatory-intelligence')) failMsg(`design lab import in ${f}`);
}
pass('no design-lab runtime imports under app/ri');

const refMod = await import(pathToFileURL(join(repoRoot, 'packages/reference-data/index.mjs')).href);
if (refMod.REGULATORS.length === 36) pass('36 regulators in shared catalogue');
else failMsg(`regulator count ${refMod.REGULATORS.length}`);
if (refMod.REGULATORY_SOURCES.length === 41) pass('41 sources in shared catalogue');
else failMsg(`source count ${refMod.REGULATORY_SOURCES.length}`);
const enabled = refMod.REGULATORY_SOURCES.filter((s) => s.integration?.productionStatus === 'ENABLED');
if (enabled.length === 0) pass('zero production-enabled catalogue sources');
else failMsg(`production enabled ${enabled.length}`);

const fca = refMod.REGULATORY_SOURCES.find((s) => s.sourceId === 'SRC-FCA-PUBLICATIONS-RSS');
if (fca?.integration?.verificationStatus === 'LIVE_VERIFIED' && fca.integration?.productionStatus === 'NOT_ENABLED') {
  pass('FCA status layers');
} else failMsg('FCA status layers');

const parity = readFileSync(join(platformRoot, 'docs', 'RI-DESIGN-LAB-PARITY.md'), 'utf8');
if (parity.includes('MIGRATE_NOW')) pass('parity doc MIGRATE_NOW taxonomy');
else failMsg('parity MIGRATE_NOW');

if (fail) {
  console.error(`\nPhase 7B.2 acceptance: FAIL (${fail})`);
  process.exit(1);
}
console.log('\nPhase 7B.2 Design Lab migration acceptance: PASS');
