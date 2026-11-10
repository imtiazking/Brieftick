#!/usr/bin/env node
/**
 * Connected staging adapter contract — design-lab source must match bundle after prebuild sync.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execSync } from 'node:child_process';
import { createApiPlatformAdapter } from '../../../design-lab/regulatory-intelligence/js/adapters/api-platform-adapter.js';

const platform = join(dirname(fileURLToPath(import.meta.url)), '..');
const labSrc = join(platform, '..', '..', 'design-lab', 'regulatory-intelligence');
const bundle = join(platform, 'design-lab-bundle', 'regulatory-intelligence');
const adapterStubMarker = 'Future production API adapter contract (non-functional in Design Lab)';

let fail = 0;
const pass = (id, detail) => console.log(`PASS: ${id} — ${detail}`);
const failTest = (id, detail) => {
  fail += 1;
  console.error(`FAIL: ${id} — ${detail}`);
};

function assertAdapterSource(root, label) {
  const p = join(root, 'js', 'adapters', 'api-platform-adapter.js');
  if (!existsSync(p)) {
    failTest(`${label}_exists`, 'missing api-platform-adapter.js');
    return;
  }
  const text = readFileSync(p, 'utf8');
  if (text.includes(adapterStubMarker)) {
    failTest(`${label}_not_stub`, 'stub adapter must not ship to staging');
  } else pass(`${label}_not_stub`, 'no stub marker');
  if (!text.includes('async bootstrap()')) failTest(`${label}_bootstrap`, 'missing async bootstrap()');
  else pass(`${label}_bootstrap`, 'bootstrap present in source');
  if (!text.includes('async probe()')) failTest(`${label}_probe`, 'missing async probe()');
  else pass(`${label}_probe`, 'probe present in source');
}

assertAdapterSource(labSrc, 'design-lab');

const adapter = createApiPlatformAdapter({ apiBaseUrl: '/api/ri-lab' });
if (typeof adapter.bootstrap !== 'function') failTest('runtime_bootstrap', 'bootstrap is not a function');
else pass('runtime_bootstrap', 'bootstrap callable');
if (typeof adapter.probe !== 'function') failTest('runtime_probe', 'probe is not a function');
else pass('runtime_probe', 'probe callable');
if (typeof adapter.restoreBootstrap !== 'function') failTest('runtime_restore', 'restoreBootstrap missing');
else pass('runtime_restore', 'restoreBootstrap callable');

const connectivity = readFileSync(join(labSrc, 'js', 'platform', 'lab-connectivity.js'), 'utf8');
if (!connectivity.includes('await adapter.bootstrap()')) {
  failTest('callsite', 'lab-connectivity must await adapter.bootstrap()');
} else pass('callsite', 'activateConnectedSession uses adapter.bootstrap()');

try {
  execSync('node ./scripts/sync-design-lab-bundle.mjs', { cwd: platform, stdio: 'pipe' });
  pass('prebuild', 'sync-design-lab-bundle');
} catch (e) {
  failTest('prebuild', 'sync-design-lab-bundle failed');
}

assertAdapterSource(bundle, 'bundle');

const bundleModule = pathToFileURL(
  join(bundle, 'js', 'adapters', 'api-platform-adapter.js'),
).href;
try {
  const mod = await import(bundleModule);
  const fromBundle = mod.createApiPlatformAdapter({ apiBaseUrl: '/api/ri-lab' });
  if (typeof fromBundle.bootstrap !== 'function') {
    failTest('bundle_runtime', 'bundled adapter missing bootstrap');
  } else pass('bundle_runtime', 'bundle module bootstrap callable');
} catch (e) {
  failTest('bundle_import', String(e?.message || e));
}

if (!fail) console.log('\nacceptance-phase-8-design-lab-adapter-contract: PASS\n');
else {
  console.error(`\nacceptance-phase-8-design-lab-adapter-contract: FAIL (${fail})\n`);
  process.exit(1);
}
