#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getConnectorForSource } from '../lib/ri/ingestion/connector-registry.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const platformRoot = join(__dir, '..');
const repoRoot = join(platformRoot, '..', '..');

let fail = 0;
const pass = (m) => console.log(`PASS: ${m}`);
const failMsg = (m) => {
  fail += 1;
  console.error(`FAIL: ${m}`);
};

const parityDoc = join(platformRoot, 'docs', 'RI-DESIGN-LAB-PARITY.md');
if (!existsSync(parityDoc)) failMsg('RI-DESIGN-LAB-PARITY.md missing');
else pass('parity matrix document');

const parityText = existsSync(parityDoc) ? readFileSync(parityDoc, 'utf8') : '';
for (const label of [
  'PRODUCTION_COMPLETE',
  'BACKEND_COMPLETE_UI_MISSING',
  'PARTIAL',
  'WAIT_FOR_AI',
  'WAIT_FOR_ASK_RI',
  'DESIGN_LAB_ONLY',
]) {
  if (!parityText.includes(label)) failMsg(`parity doc missing status ${label}`);
  else pass(`parity status ${label} documented`);
}

const routes = [
  'app/ri/page.tsx',
  'app/ri/horizon/page.tsx',
  'app/ri/calendar/page.tsx',
  'app/ri/work-queue/page.tsx',
  'app/ri/landscape/page.tsx',
  'app/ri/reporting/page.tsx',
  'app/ri/governance/page.tsx',
  'app/ri/ai-governance/page.tsx',
  'app/ri/ai-operations/page.tsx',
];
for (const r of routes) {
  if (!existsSync(join(platformRoot, r))) failMsg(`missing route ${r}`);
  else pass(`route ${r}`);
}

const services = [
  'lib/ri/services/dashboard.ts',
  'lib/ri/services/horizon.ts',
  'lib/ri/services/calendar.ts',
  'lib/ri/services/work-queue.ts',
  'lib/ri/services/reporting.ts',
];
for (const s of services) {
  if (!existsSync(join(platformRoot, s))) failMsg(`missing ${s}`);
  else pass(s);
}

const subnav = readFileSync(join(platformRoot, 'components', 'ri', 'ri-subnav.tsx'), 'utf8');
for (const href of ['/ri/horizon', '/ri/calendar', '/ri/work-queue', '/ri/reporting']) {
  if (!subnav.includes(href)) failMsg(`subnav missing ${href}`);
  else pass(`subnav ${href}`);
}

const dashboard = readFileSync(join(platformRoot, 'lib', 'ri', 'services', 'dashboard.ts'), 'utf8');
if (dashboard.includes('OBLIGATION_STATUS_GROUPS')) pass('dashboard uses obligation taxonomy groups');
else failMsg('dashboard taxonomy');

if (/design-lab\/regulatory-intelligence/.test(readFileSync(join(platformRoot, 'app', 'ri', 'page.tsx'), 'utf8'))) {
  failMsg('dashboard imports design lab');
} else pass('no design lab import on dashboard');

const legacyIds = [
  'SRC-FCA-PUBLICATIONS-RSS',
  'SRC-PRA-PUBLICATIONS',
  'SRC-HMT-PUBLICATIONS',
  'SRC-UK-LEGISLATION-ATOM',
  'SRC-TPR-DOCUMENT-LIBRARY',
  'SRC-BASEL-FRAMEWORK',
];
const manifestPath = join(repoRoot, 'integrations', 'regulatory-sources', 'manifests', 'core-legacy-design-lab-parity.json');
if (!existsSync(manifestPath)) failMsg('core legacy manifest');
else pass('core legacy manifest');

for (const id of legacyIds) {
  if (!getConnectorForSource(id)) failMsg(`no production connector for ${id}`);
  else pass(`connector ${id}`);
}

const catalogue = readFileSync(
  join(repoRoot, 'packages', 'reference-data', 'catalogue', 'regulatory-sources.mjs'),
  'utf8',
);
if (catalogue.includes("production_status") || catalogue.includes('NOT_ENABLED')) {
  pass('catalogue references production enablement policy');
}
if (/production_status\s*=\s*'ENABLED'/.test(catalogue)) failMsg('catalogue enables production source');
else pass('no ENABLED in catalogue defaults');

const pkg = readFileSync(join(platformRoot, 'package.json'), 'utf8');
if (!pkg.includes('test:acceptance:phase7b')) failMsg('phase7b npm script');
else pass('npm script test:acceptance:phase7b');

if (fail) {
  console.error(`\nPhase 7B RI experience parity acceptance: FAIL (${fail})`);
  process.exit(1);
}
console.log('\nPhase 7B RI experience parity acceptance: PASS');
