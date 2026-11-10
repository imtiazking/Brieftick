#!/usr/bin/env node
/**
 * Ensures design-lab is source of truth: prebuild must preserve Compliance Actions + connected catalogue.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const platform = join(dirname(fileURLToPath(import.meta.url)), '..');
const labSrc = join(platform, '..', '..', 'design-lab', 'regulatory-intelligence');
const bundle = join(platform, 'design-lab-bundle', 'regulatory-intelligence');
let fail = 0;

function pass(id, detail) {
  console.log(`PASS: ${id} — ${detail}`);
}
function failTest(id, detail) {
  fail += 1;
  console.error(`FAIL: ${id} — ${detail}`);
}

const markers = [
  { id: 'store_uat_actions', file: 'js/store.js', pat: 'getViewAuthorisedUatActions' },
  { id: 'catalogue_merge', file: 'js/platform/connected-catalogue.js', pat: 'mergeActionCatalogueRow' },
  { id: 'mode_writes', file: 'js/platform/connected-mode.js', pat: 'isConnectedActionWritesEnabled' },
  { id: 'panels_create', file: 'js/platform/connected-action-panels.js', pat: 'renderConnectedActionCreateBanner' },
  { id: 'risk_link', file: 'js/platform/connected-risk-control-panels.js', pat: 'renderConnectedRiskLinkPanel' },
  { id: 'control_save', file: 'js/platform/connected-work-writes.js', pat: 'patchConnectedControl' },
  {
    id: 'governance_dashboard_connected',
    file: 'js/governance-views.js',
    pat: 'export function renderDashboardGovernanceSummaryConnected',
  },
  {
    id: 'views_imports_governance_connected',
    file: 'js/views.js',
    pat: 'renderDashboardGovernanceSummaryConnected',
  },
  {
    id: 'api_adapter_bootstrap',
    file: 'js/adapters/api-platform-adapter.js',
    pat: 'async bootstrap()',
  },
  {
    id: 'api_adapter_probe',
    file: 'js/adapters/api-platform-adapter.js',
    pat: 'async probe()',
  },
  {
    id: 'lab_connectivity_bootstrap',
    file: 'js/platform/lab-connectivity.js',
    pat: 'adapter.bootstrap()',
  },
];

for (const root of [{ label: 'design-lab', base: labSrc }]) {
  for (const m of markers) {
    const p = join(root.base, m.file);
    if (!existsSync(p)) {
      failTest(`${root.label}_${m.id}`, `missing ${m.file}`);
      continue;
    }
    const text = readFileSync(p, 'utf8');
    if (!text.includes(m.pat)) failTest(`${root.label}_${m.id}`, `missing ${m.pat}`);
    else pass(`${root.label}_${m.id}`, m.file);
  }
}

try {
  execSync('node ./scripts/sync-design-lab-bundle.mjs', { cwd: platform, stdio: 'pipe' });
  pass('prebuild', 'sync-design-lab-bundle exited 0');
} catch {
  failTest('prebuild', 'sync-design-lab-bundle failed');
}

for (const m of markers) {
  const p = join(bundle, m.file);
  const text = readFileSync(p, 'utf8');
  if (!text.includes(m.pat)) failTest(`bundle_${m.id}`, `prebuild dropped ${m.pat}`);
  else pass(`bundle_${m.id}`, 'survives prebuild');
}

if (!fail) console.log('\nacceptance-phase-8-step-85w-design-lab-prebuild-sync: PASS\n');
else {
  console.error(`\nacceptance-phase-8-step-85w-design-lab-prebuild-sync: FAIL (${fail})\n`);
  process.exit(1);
}
