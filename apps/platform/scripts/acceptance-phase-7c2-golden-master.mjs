#!/usr/bin/env node
/**
 * Phase 7C.2 — Horizon, Calendar, Publications golden-master parity vs Design Lab state.
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
  'date-window.mjs',
  'horizon-parity.mjs',
  'calendar-parity.mjs',
  'publications-parity.mjs',
  'regulator-keys.mjs',
]) {
  if (!existsSync(join(compatDir, f))) failMsg(`missing lab-compat/${f}`);
  else pass(`lab-compat/${f}`);
}

for (const svc of ['horizon.ts', 'calendar.ts', 'publications.ts']) {
  if (!existsSync(join(platformRoot, 'lib', 'ri', 'services', svc))) failMsg(`missing services/${svc}`);
  else pass(`services/${svc}`);
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
  if (/from\s+['"].*seed-data/.test(text)) failMsg(`fixture seed import in ${f}`);
}
pass('production /ri has no design-lab or seed-data runtime imports');

const { createFreshState } = await import(pathToFileURL(join(labRoot, 'js', 'migrate.js')).href);
const { hydrateStore } = await import(pathToFileURL(join(labRoot, 'js', 'store.js')).href);
const { compareHorizonParity } = await import(pathToFileURL(join(compatDir, 'horizon-parity.mjs')).href);
const { compareCalendarParity } = await import(pathToFileURL(join(compatDir, 'calendar-parity.mjs')).href);
const {
  comparePublicationsListParity,
  comparePublicationRelationshipsParity,
} = await import(pathToFileURL(join(compatDir, 'publications-parity.mjs')).href);
const refMod = await import(pathToFileURL(join(repoRoot, 'packages/reference-data/index.mjs')).href);

const state = createFreshState();
hydrateStore(state);

const horizon = compareHorizonParity(state);
if (horizon.match) pass(`horizon parity (${horizon.labCount} rows)`);
else failMsg(`horizon parity lab=${horizon.labCount} prod=${horizon.prodCount}`);

const calendar = compareCalendarParity(state);
if (calendar.match) pass(`calendar parity (${calendar.labCount} events)`);
else failMsg(`calendar parity lab=${calendar.labCount} prod=${calendar.prodCount}`);

const pubs = comparePublicationsListParity(state);
if (pubs.match) pass(`publications list parity (${pubs.labCount} rows)`);
else failMsg(`publications list lab=${pubs.labCount} prod=${pubs.prodCount}`);

const rel = comparePublicationRelationshipsParity(state);
if (rel.match) pass('publication detail relationships parity');
else failMsg(`publication relationships mismatches: ${rel.mismatches.join(', ')}`);

if (refMod.REGULATORS.length === 36) pass('global catalogue 36 regulators');
else failMsg(`regulator count ${refMod.REGULATORS.length} (expected 36)`);
if (refMod.REGULATORY_SOURCES.length === 41) pass('global catalogue 41 sources');
else failMsg(`source count ${refMod.REGULATORY_SOURCES.length} (expected 41)`);

const horizonPage = readFileSync(join(platformRoot, 'app', 'ri', 'horizon', 'page.tsx'), 'utf8');
if (horizonPage.includes('ri-list-compact')) pass('horizon lab list presentation');
else failMsg('horizon page missing ri-list-compact');

const calPage = readFileSync(join(platformRoot, 'app', 'ri', 'calendar', 'page.tsx'), 'utf8');
if (calPage.includes('ri-cal-list')) pass('calendar lab list presentation');
else failMsg('calendar page missing ri-cal-list');

const detailPage = readFileSync(join(platformRoot, 'app', 'ri', 'publications', '[id]', 'page.tsx'), 'utf8');
if (detailPage.includes('#source') && detailPage.includes('external_key')) pass('publication source provenance fields');
else failMsg('publication detail source tab incomplete');

const pkg = readFileSync(join(platformRoot, 'package.json'), 'utf8');
if (pkg.includes('test:acceptance:phase7c2')) pass('npm script phase7c2');
else failMsg('npm script phase7c2 missing');

if (fail) {
  console.error(`\nPhase 7C.2 golden master acceptance: FAIL (${fail})`);
  process.exit(1);
}
console.log('\nPhase 7C.2 golden master acceptance: PASS');
