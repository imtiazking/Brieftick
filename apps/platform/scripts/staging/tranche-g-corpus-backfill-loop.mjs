#!/usr/bin/env node
/**
 * Invoke hosted corpus backfill ticks with cooldown (default 45s) until limit or remaining=0.
 */
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REPO_ROOT } from '../../lib/ri/eval/eval-paths.mjs';

const platformRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ticks = Number(process.env.TRANCHE_G_CORPUS_TICKS || 20);
const cooldownMs = Number(process.env.TRANCHE_G_CORPUS_COOLDOWN_MS || 45_000);
const outDir = join(REPO_ROOT, 'docs', 'uat', 'evidence', 'regulatory-knowledge-foundation-2026-11-27');
mkdirSync(outDir, { recursive: true });

const report = { generatedAt: new Date().toISOString(), ticks, results: [] };

for (let i = 0; i < ticks; i++) {
  const run = spawnSync('node', ['./scripts/staging/hosted-corpus-snapshot-tick.mjs'], {
    cwd: platformRoot,
    encoding: 'utf8',
    shell: false,
  });
  let parsed = {};
  try {
    parsed = JSON.parse((run.stdout || '').trim().split('\n').pop() || '{}');
  } catch {
    parsed = { ok: false, parseError: true, stdout: run.stdout?.slice(0, 500), stderr: run.stderr?.slice(0, 500) };
  }
  report.results.push({ index: i + 1, exitCode: run.status, ...parsed });
  writeFileSync(join(outDir, 'CORPUS-BACKFILL-LOOP.json'), JSON.stringify(report, null, 2));
  console.log(`tick ${i + 1}/${ticks} ok=${parsed.ok} remaining=${parsed.remainingWithoutSnapshot ?? '?'}`);
  if (parsed.remainingWithoutSnapshot === 0) break;
  if (run.status !== 0 && parsed.status === 404) {
    console.error('corpus-snapshot-tick route not deployed yet');
    break;
  }
  if (i + 1 < ticks) {
    await new Promise((r) => setTimeout(r, cooldownMs));
  }
}

process.exit(report.results.some((r) => r.ok === false) ? 1 : 0);