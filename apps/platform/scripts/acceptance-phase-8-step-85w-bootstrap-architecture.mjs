#!/usr/bin/env node
/**
 * Connected bootstrap architecture — single-flight, soft refresh, session/catalogue split.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  canRestorePersistedConnectedSession,
  applyPersistedConnectedRestore,
  CONNECTING_WATCHDOG_MS,
} from '../../../design-lab/regulatory-intelligence/js/platform/lab-bootstrap-coordinator.js';

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

const labConn = readFileSync(join(lab, 'js/platform/lab-connectivity.js'), 'utf8');
if (
  labConn.includes('export async function activateConnectedSession') &&
  labConn.includes('activateConnectedSession(state)') &&
  !labConn.match(/withTimeout\([\s\S]*activateConnectedBackend\(state\)/)
) {
  pass('session_before_catalogue', 'bootstrap validates session before catalogue load');
} else {
  failTest('session_before_catalogue', 'bootstrap must not await catalogue inside session timeout');
}

if (!labConn.includes('softRefresh') || !labConn.includes('canRestorePersistedConnectedSession')) {
  failTest('soft_refresh', 'bootstrap must support soft refresh from persisted session');
} else {
  pass('soft_refresh', 'soft refresh path present');
}

const appJs = readFileSync(join(lab, 'js/app.js'), 'utf8');
if (!appJs.includes('runBootstrapSingleton') || !appJs.includes('startConnectingWatchdog')) {
  failTest('singleton_watchdog', 'app must single-flight bootstrap and run connecting watchdog');
} else {
  pass('singleton_watchdog', 'singleton + watchdog wired in init');
}
if (!appJs.includes('__FORGENIQ_RI_CONNECTIVITY_DIAG__')) {
  failTest('diag_hook', 'connectivity diag export for browser');
} else {
  pass('diag_hook', 'browser diag hook');
}

const migrate = readFileSync(join(lab, 'js/migrate.js'), 'utf8');
if (!migrate.includes('fresh.platformConfig.backendReady = true')) {
  failTest('migrate_backend_ready', 'migrate must restore backendReady for connected sessions');
} else {
  pass('migrate_backend_ready', 'persisted backendReady on connected restore');
}

const state = {
  platformConfig: {
    adapterMode: 'api',
    featureFlags: { apiAdapter: true },
    backendSession: { ok: true, userId: 'user_test' },
    backendReady: false,
  },
  connectivity: { mode: 'connected', lastCheckedAt: new Date().toISOString() },
};
if (!canRestorePersistedConnectedSession(state)) failTest('restore_fn', 'canRestore should accept fresh connected persist');
else pass('restore_fn', 'canRestore fresh session');
applyPersistedConnectedRestore(state);
if (state.platformConfig.backendReady !== true || state.connectivity.mode !== 'connected') {
  failTest('apply_restore', 'applyPersistedConnectedRestore must set backendReady');
} else {
  pass('apply_restore', 'applyPersistedConnectedRestore sets backendReady');
}

if (CONNECTING_WATCHDOG_MS < 20_000 || CONNECTING_WATCHDOG_MS > 60_000) {
  failTest('watchdog_ms', `watchdog ${CONNECTING_WATCHDOG_MS} out of expected range`);
} else {
  pass('watchdog_ms', `watchdog ${CONNECTING_WATCHDOG_MS}ms`);
}

if (!fail) console.log('\nacceptance-phase-8-step-85w-bootstrap-architecture: PASS\n');
else {
  console.error(`\nacceptance-phase-8-step-85w-bootstrap-architecture: FAIL (${fail})\n`);
  process.exit(1);
}
