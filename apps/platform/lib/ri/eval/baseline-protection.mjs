import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { BASELINE_DIR } from './eval-paths.mjs';

/** Frozen historical baselines — never overwrite with --force. */
export const PROTECTED_HISTORICAL_BASELINES = [
  'deterministic-v1-2026-11-10.json',
  'deterministic-v2-2026-11-10.json',
  'deterministic-v2.1-2026-11-10.json',
].map((name) => join(BASELINE_DIR, name));

export function sha256File(absPath) {
  const buf = readFileSync(absPath);
  return createHash('sha256').update(buf).digest('hex');
}

export function isProtectedBaselinePath(outPath) {
  const abs = resolve(outPath);
  return PROTECTED_HISTORICAL_BASELINES.some((p) => resolve(p) === abs);
}

export function assertBaselineWriteAllowed({ outPath, force }) {
  const abs = resolve(outPath);
  if (!existsSync(abs)) return { ok: true, abs };
  if (isProtectedBaselinePath(abs)) {
    return {
      ok: false,
      abs,
      error: 'protected_historical_baseline',
      message: `Refusing to overwrite protected historical baseline: ${abs}`,
    };
  }
  if (!force) {
    return {
      ok: false,
      abs,
      error: 'output_exists',
      message: `Output exists (use --force to overwrite): ${abs}`,
    };
  }
  return { ok: true, abs };
}

export function defaultTimestampedBaselinePath() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return join(BASELINE_DIR, `deterministic-v1-run-${stamp}.json`);
}

export function verifyProtectedBaselineHashes() {
  const results = [];
  for (const p of PROTECTED_HISTORICAL_BASELINES) {
    if (!existsSync(p)) {
      results.push({ path: p, ok: false, error: 'missing' });
      continue;
    }
    results.push({ path: p, ok: true, sha256: sha256File(p) });
  }
  return results;
}
