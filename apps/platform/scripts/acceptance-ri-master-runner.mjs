#!/usr/bin/env node
/**
 * Spawn a child with bounded wall-clock timeout, diagnostics, and forced termination (Windows-safe).
 */
import { spawn, spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanupOrphanEmbeddedPgDirs } from './local-db/harness.mjs';

const DEFAULT_STEP_TIMEOUT_MS = Number(process.env.RI_MASTER_STEP_TIMEOUT_MS || 20 * 60 * 1000);
const DEFAULT_SUITE_TIMEOUT_MS = Number(process.env.RI_MASTER_SUITE_TIMEOUT_MS || 75 * 60 * 1000);

const __dir = dirname(fileURLToPath(import.meta.url));
const platformRoot = join(__dir, '..');

function resolveSpawnCommand(command, args) {
  if (process.platform !== 'win32') return { command, args, shell: false };
  if (command === 'npm' || command === 'npx') {
    return {
      command,
      args,
      shell: true,
    };
  }
  return { command, args, shell: false };
}

export function killProcessTree(pid) {
  if (!pid) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      /* */
    }
  }
}

function killTree(child) {
  killProcessTree(child?.pid);
}

/** Remove only orphan embedded PG dirs (never a live owner from another process). */
export function cleanupLocalPgVerifyDirs() {
  cleanupOrphanEmbeddedPgDirs();
}

/**
 * @param {{ label: string, command: string, args: string[], cwd: string, timeoutMs?: number }} opts
 */
function settleStep({ settledRef, clearFns, resolve, started, label, payload }) {
  if (settledRef.v) return;
  settledRef.v = true;
  for (const fn of clearFns) fn();
  resolve({ ...payload, elapsedMs: performance.now() - started });
}

export function runBoundedStep({ label, command, args, cwd, timeoutMs = DEFAULT_STEP_TIMEOUT_MS }) {
  const started = performance.now();
  const { command: resolvedCommand, args: resolvedArgs, shell } = resolveSpawnCommand(command, args);
  console.log(
    `\n=== ${label} ===\n[diag] spawn ${resolvedCommand} ${resolvedArgs.join(' ')} (timeout ${Math.round(timeoutMs / 1000)}s)\n`,
  );
  return new Promise((resolve) => {
    const settledRef = { v: false };
    const clearFns = [];
    const child = spawn(resolvedCommand, resolvedArgs, {
      cwd,
      stdio: 'inherit',
      shell,
      windowsHide: true,
      env: { ...process.env, FORGENIQ_RI_MASTER_STEP: label },
    });
    const onTimeout = () => {
      console.error(`\n[diag] TIMEOUT after ${timeoutMs}ms — terminating: ${label} (pid=${child.pid ?? 'n/a'})\n`);
      killTree(child);
      cleanupLocalPgVerifyDirs();
      settleStep({
        settledRef,
        clearFns,
        resolve,
        started,
        label,
        payload: { ok: false, code: 'step_timeout', signal: null },
      });
    };
    const timer = setTimeout(onTimeout, timeoutMs);
    clearFns.push(() => clearTimeout(timer));
    const watchdog = setInterval(() => {
      const elapsed = performance.now() - started;
      if (elapsed > timeoutMs + 5000 && !settledRef.v) {
        console.error(`[diag] watchdog force-timeout ${label} ${Math.round(elapsed / 1000)}s`);
        onTimeout();
      }
    }, 30_000);
    clearFns.push(() => clearInterval(watchdog));
    child.on('exit', (code, signal) => {
      if (settledRef.v) return;
      console.log(
        `\n[diag] step done ${label} exit=${code ?? 'null'} signal=${signal ?? 'null'} ${((performance.now() - started) / 1000).toFixed(1)}s\n`,
      );
      settleStep({
        settledRef,
        clearFns,
        resolve,
        started,
        label,
        payload: { ok: code === 0, code, signal },
      });
    });
    child.on('error', (err) => {
      console.error(`\n[diag] spawn error ${label}:`, err.message);
      settleStep({
        settledRef,
        clearFns,
        resolve,
        started,
        label,
        payload: { ok: false, code: 'spawn_error', signal: null, error: err.message },
      });
    });
  });
}

export const masterTimeouts = { DEFAULT_STEP_TIMEOUT_MS, DEFAULT_SUITE_TIMEOUT_MS };