#!/usr/bin/env node
/** Poll child PID; detect OS termination when Node "exit" event is lost (seen on Windows). */
import { isEmbeddedOwnerProcessAlive } from './local-db/harness.mjs';

const DEFAULT_GRACE_MS = process.platform === 'win32' ? 4000 : 750;

/**
 * @param {{
 *   child: import('node:child_process').ChildProcess,
 *   onVanished: () => void,
 *   intervalMs?: number,
 *   graceMs?: number,
 *   isSettled?: () => boolean,
 * }} opts
 * @returns {() => void}
 */
export function watchChildLiveness({
  child,
  onVanished,
  intervalMs = 4000,
  graceMs = DEFAULT_GRACE_MS,
  isSettled,
} = {}) {
  let armed = true;
  let graceTimer = null;
  const tick = () => {
    if (!armed) return;
    const pid = child.pid;
    if (!pid) return;
    if (!isEmbeddedOwnerProcessAlive(pid)) {
      if (graceTimer) return;
      graceTimer = setTimeout(() => {
        graceTimer = null;
        if (!armed || isSettled?.()) return;
        if (pid && isEmbeddedOwnerProcessAlive(pid)) return;
        armed = false;
        onVanished();
      }, graceMs);
    }
  };
  const timer = setInterval(tick, intervalMs);
  return () => {
    armed = false;
    clearInterval(timer);
    if (graceTimer) clearTimeout(graceTimer);
  };
}