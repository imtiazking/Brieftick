#!/usr/bin/env node
/** Run full RI master acceptance three consecutive times (reproducibility gate). */
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { killProcessTree, masterTimeouts } from './acceptance-ri-master-runner.mjs';
import {
  acquireMasterTripleLock,
  releaseMasterTripleLock,
} from './local-db/harness.mjs';

const platformRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const SUITE_TIMEOUT_MS = Number(process.env.RI_MASTER_SUITE_TIMEOUT_MS || masterTimeouts.DEFAULT_SUITE_TIMEOUT_MS);

const lock = acquireMasterTripleLock();
if (!lock.ok) {
  console.error(
    JSON.stringify({
      ok: false,
      code: lock.code,
      existingPid: lock.existingPid,
      message: 'Another RI master suite is already running; refusing concurrent triple.',
    }),
  );
  process.exit(2);
}
process.on('exit', () => releaseMasterTripleLock());

function runMasterOnce(runIndex) {
  return new Promise((resolve) => {
    const started = performance.now();
    console.log(`\n========== RI master run ${runIndex}/3 (suite timeout ${Math.round(SUITE_TIMEOUT_MS / 1000)}s) ==========\n`);
    const child = spawn(process.execPath, [join(platformRoot, 'scripts', 'acceptance-ri-master.mjs')], {
      cwd: platformRoot,
      stdio: 'inherit',
      windowsHide: true,
    });
    let settled = false;
    const finish = (payload) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearInterval(watchdog);
      resolve(payload);
    };
    const onSuiteTimeout = () => {
      console.error(`\n[diag] SUITE TIMEOUT run ${runIndex}/3 after ${SUITE_TIMEOUT_MS}ms (pid=${child.pid})\n`);
      killProcessTree(child.pid);
      finish({ ok: false, code: 'suite_timeout', elapsedMs: performance.now() - started });
    };
    const timer = setTimeout(onSuiteTimeout, SUITE_TIMEOUT_MS);
    const watchdog = setInterval(() => {
      const elapsed = performance.now() - started;
      if (elapsed > SUITE_TIMEOUT_MS + 10_000 && !settled) onSuiteTimeout();
    }, 60_000);
    child.on('exit', (code, signal) => {
      finish({
        ok: code === 0,
        code,
        signal,
        elapsedMs: performance.now() - started,
      });
    });
    child.on('error', (err) => {
      console.error(`[diag] master spawn error run ${runIndex}/3:`, err.message);
      finish({ ok: false, code: 'spawn_error', error: err.message, elapsedMs: performance.now() - started });
    });
  });
}

let failed = 0;
for (let i = 1; i <= 3; i += 1) {
  // eslint-disable-next-line no-await-in-loop
  const r = await runMasterOnce(i);
  if (!r.ok) {
    failed += 1;
    console.error(`RI master run ${i}/3 FAILED (${r.code ?? r.signal ?? 'unknown'})`);
    break;
  }
  console.log(`RI master run ${i}/3 PASS (${(r.elapsedMs / 1000).toFixed(1)}s)`);
}
process.exit(failed ? 1 : 0);