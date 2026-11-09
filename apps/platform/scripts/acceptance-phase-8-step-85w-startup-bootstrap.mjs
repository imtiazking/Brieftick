#!/usr/bin/env node
/**
 * Regression — Design Lab connected startup must not block on stale catalogue reload loops.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const lab = join(__dir, '..', '..', '..', 'design-lab', 'regulatory-intelligence');
let fail = 0;

function pass(id, detail) {
  console.log(`PASS: ${id} — ${detail}`);
}

function failTest(id, detail) {
  fail += 1;
  console.error(`FAIL: ${id} — ${detail}`);
}

const catalogue = readFileSync(join(lab, 'js/platform/connected-catalogue.js'), 'utf8');
const ensureBlock = catalogue.match(/export async function ensureConnectedCatalogueLoaded[\s\S]*?\n\}/)?.[0] || '';
if (ensureBlock.includes('connectedCatalogueHasStaleFindingLineage')) {
  failTest('ensure_no_stale_global', 'ensureConnectedCatalogueLoaded must not global-invalid ready catalogue');
} else {
  pass('ensure_no_stale_global', 'stale lineage refresh removed from ensureConnectedCatalogueLoaded');
}

const labConn = readFileSync(join(lab, 'js/platform/lab-connectivity.js'), 'utf8');
if (!labConn.includes('session_probe_timeout')) {
  failTest('probe_timeout', 'session probe must use withTimeout');
} else {
  pass('probe_timeout', 'session probe wrapped in withTimeout');
}
if (!labConn.includes('bootstrap_catalogue_timeout')) {
  failTest('catalogue_timeout', 'post-bootstrap catalogue load must use withTimeout');
} else {
  pass('catalogue_timeout', 'catalogue follow-up load wrapped in withTimeout');
}

const appJs = readFileSync(join(lab, 'js/app.js'), 'utf8');
if (!appJs.includes("boot?.mode === 'connected'")) {
  failTest('init_nonblocking', 'init must not await ensureConnectedCatalogueLoaded before first render');
} else {
  pass('init_nonblocking', 'catalogue ensure runs after bootstrap without blocking UI');
}

const migrate = readFileSync(join(lab, 'js/migrate.js'), 'utf8');
if (!migrate.includes("fresh.connectivity.mode === 'connecting'")) {
  failTest('migrate_interrupted', 'persisted connecting must migrate to recoverable error');
} else {
  pass('migrate_interrupted', 'interrupted connect state migrates on load');
}

if (!fail) console.log('\nacceptance-phase-8-step-85w-startup-bootstrap: PASS\n');
else {
  console.error(`\nacceptance-phase-8-step-85w-startup-bootstrap: FAIL (${fail})\n`);
  process.exit(1);
}
