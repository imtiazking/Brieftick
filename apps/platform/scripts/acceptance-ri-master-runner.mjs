#!/usr/bin/env node
/**
 * Spawn a child with bounded wall-clock timeout, diagnostics, and forced termination (Windows-safe).
 */
import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';

const DEFAULT_STEP_TIMEOUT_MS = Number(process.env.RI_MASTER_STEP_TIMEOUT_MS || 20 * 60 * 1000);
const DEFAULT_SUITE_TIMEOUT_MS = Number(process.env.RI_MASTER_SUITE_TIMEOUT_MS || 75 * 60 * 1000);

function killTree(child) {
  if (!child?.pid) return;
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    child.kill('SIGKILL');
  }
}

/**
 * @param {{ label: string, command: string, args: string[], cwd: string, timeoutMs?: number }} opts
 */
export function runBoundedStep({ label, command, args, cwd, timeoutMs = DEFAULT_STEP_TIMEOUT_MS }) {
  const started = performance.now();
  console.log(`\n=== ${label} ===\n[diag] spawn ${command} ${args.join(' ')} (timeout ${Math.round(timeoutMs / 1000)}s)\n`);
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      stdio: 'inherit',
      shell: process.platform === 'win32',
      env: { ...process.env, FORGENIQ_RI_MASTER_STEP: label },
    });
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      console.error(`\n[diag] TIMEOUT after ${timeoutMs}ms — terminating: ${label}\n`);
      killTree(child);
      settled = true;
      resolve({ ok: false, code: 'step_timeout', signal: null, elapsedMs: performance.now() - started });
    }, timeoutMs);
    child.on('exit', (code, signal) => {
      if (settled) return;
      clearTimeout(timer);
      settled = true;
      const elapsedMs = performance.now() - started;
      console.log(`\n[diag] step done ${label} exit=${code ?? 'null'} signal=${signal ?? 'null'} ${(elapsedMs / 1000).toFixed(1)}s\n`);
      resolve({ ok: code === 0, code, signal, elapsedMs });
    });
    child.on('error', (err) => {
      if (settled) return;
      clearTimeout(timer);
      settled = true;
      console.error(`\n[diag] spawn error ${label}:`, err.message);
      resolve({ ok: false, code: 'spawn_error', signal: null, elapsedMs: performance.now() - started });
    });
  });
}

export const masterTimeouts = { DEFAULT_STEP_TIMEOUT_MS, DEFAULT_SUITE_TIMEOUT_MS };