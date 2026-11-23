#!/usr/bin/env node
/** Run full RI master acceptance three consecutive times (reproducibility gate). */
import { spawn } from 'node:child_process';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { killProcessTree, masterTimeouts, cleanupLocalPgVerifyDirs } from './acceptance-ri-master-runner.mjs';
import { watchChildLiveness } from './acceptance-ri-master-proc-liveness.mjs';
import {
  acquireMasterTripleLock,
  releaseMasterTripleLock,
  cleanupOrphanEmbeddedPgDirs,
} from './local-db/harness.mjs';

const platformRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(platformRoot, '..', '..');
const evalDir = join(repoRoot, 'docs', 'eval');
const JOURNAL = join(evalDir, 'RI-MASTER-TRIPLE-JOURNAL.jsonl');
const SUITE_TIMEOUT_MS = Number(process.env.RI_MASTER_SUITE_TIMEOUT_MS || masterTimeouts.DEFAULT_SUITE_TIMEOUT_MS);

const sessionId = process.env.RI_MASTER_TRIPLE_SESSION || `${Date.now()}-${process.pid}`;

function appendJournal(entry) {
  mkdirSync(evalDir, { recursive: true });
  appendFileSync(JOURNAL, `${JSON.stringify(entry)}\n`, 'utf8');
}

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

writeFileSync(
  join(evalDir, `RI-MASTER-TRIPLE-${sessionId}-START.json`),
  JSON.stringify(
    {
      sessionId,
      parentPid: process.pid,
      startedAt: new Date().toISOString(),
      suiteTimeoutMs: SUITE_TIMEOUT_MS,
    },
    null,
    2,
  ),
);

function runMasterOnce(runIndex) {
  return new Promise((resolve) => {
    const startedAt = new Date().toISOString();
    const started = performance.now();
    console.log(`\n========== RI master run ${runIndex}/3 (suite timeout ${Math.round(SUITE_TIMEOUT_MS / 1000)}s) ==========\n`);
    cleanupLocalPgVerifyDirs();
    const child = spawn(process.execPath, [join(platformRoot, 'scripts', 'acceptance-ri-master.mjs')], {
      cwd: platformRoot,
      stdio: 'inherit',
      windowsHide: true,
    });
    let settled = false;
    const clearFns = [];
    const finish = (payload) => {
      if (settled) return;
      settled = true;
      for (const fn of clearFns) fn();
      const finishedAt = new Date().toISOString();
      const journal = {
        sessionId,
        runIndex,
        parentPid: process.pid,
        childPid: child.pid ?? null,
        startedAt,
        finishedAt,
        elapsedMs: performance.now() - started,
        ...payload,
      };
      appendJournal(journal);
      const pgCleanup = cleanupOrphanEmbeddedPgDirs();
      journal.pgCleanup = pgCleanup;
      resolve(journal);
    };
    const onSuiteTimeout = () => {
      console.error(`\n[diag] SUITE TIMEOUT run ${runIndex}/3 after ${SUITE_TIMEOUT_MS}ms (pid=${child.pid})\n`);
      killProcessTree(child.pid);
      cleanupLocalPgVerifyDirs();
      finish({
        ok: false,
        code: 'suite_timeout',
        signal: null,
        terminationInitiator: 'parent',
      });
    };
    const timer = setTimeout(onSuiteTimeout, SUITE_TIMEOUT_MS);
    clearFns.push(() => clearTimeout(timer));
    const watchdog = setInterval(() => {
      const elapsed = performance.now() - started;
      if (elapsed > SUITE_TIMEOUT_MS + 10_000 && !settled) onSuiteTimeout();
    }, 60_000);
    clearFns.push(() => clearInterval(watchdog));
    clearFns.push(
      watchChildLiveness({
        child,
        isSettled: () => settled,
        onVanished: () => {
          if (settled) return;
          console.error(
            `\n[diag] master child vanished before exit event run ${runIndex}/3 (pid=${child.pid} initiator=os)\n`,
          );
          killProcessTree(child.pid);
          cleanupLocalPgVerifyDirs();
          finish({
            ok: false,
            code: 'child_vanished',
            signal: null,
            terminationInitiator: 'os',
          });
        },
      }),
    );
    child.on('exit', (code, signal) => {
      finish({
        ok: code === 0,
        code,
        signal,
        terminationInitiator: signal ? 'signal' : 'child',
      });
    });
    child.on('error', (err) => {
      console.error(`[diag] master spawn error run ${runIndex}/3:`, err.message);
      finish({
        ok: false,
        code: 'spawn_error',
        error: err.message,
        terminationInitiator: 'parent',
      });
    });
  });
}

let failed = 0;
const runResults = [];
for (let i = 1; i <= 3; i += 1) {
  // eslint-disable-next-line no-await-in-loop
  const r = await runMasterOnce(i);
  runResults.push(r);
  if (!r.ok) {
    failed += 1;
    console.error(`RI master run ${i}/3 FAILED (${r.code ?? r.signal ?? 'unknown'})`);
    break;
  }
  console.log(`RI master run ${i}/3 PASS (${(r.elapsedMs / 1000).toFixed(1)}s)`);
}

const summary = {
  sessionId,
  parentPid: process.pid,
  finishedAt: new Date().toISOString(),
  completeSuccessRuns: runResults.filter((r) => r.ok).length,
  requiredSuccessRuns: 3,
  gatePass: failed === 0 && runResults.length === 3,
  runs: runResults,
};
writeFileSync(join(evalDir, `RI-MASTER-TRIPLE-${sessionId}-SUMMARY.json`), JSON.stringify(summary, null, 2));
appendJournal({ type: 'summary', ...summary });
process.exit(failed ? 1 : 0);