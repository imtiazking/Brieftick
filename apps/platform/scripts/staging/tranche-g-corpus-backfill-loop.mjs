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
const ticks = Number(process.env.TRANCHE_G_CORPUS_TICKS || 0);
const maxTicks = Number(process.env.TRANCHE_G_CORPUS_MAX_TICKS || 300);
const cooldownMs = Number(process.env.TRANCHE_G_CORPUS_COOLDOWN_MS || 30_000);
const tickLimit = ticks > 0 ? ticks : maxTicks;
const outDir = join(REPO_ROOT, 'docs', 'uat', 'evidence', 'regulatory-knowledge-foundation-2026-11-27');
mkdirSync(outDir, { recursive: true });
const evidenceName = process.env.TRANCHE_G_CORPUS_EVIDENCE?.trim() || 'CORPUS-BACKFILL-LOOP.json';
const evidencePath = join(outDir, evidenceName);

const report = { generatedAt: new Date().toISOString(), tickLimit, results: [] };
if (process.env.TRANCHE_G_CORPUS_RESUME === 'true') {
  report.resumeReason = 'prior_loop_exited_on_terminal_leq_remaining_bug_fixed_2026-11-27';
  report.priorEvidence = 'CORPUS-BACKFILL-LOOP.json';
}

for (let i = 0; i < tickLimit; i++) {
  const run = spawnSync('node', ['./scripts/staging/hosted-corpus-snapshot-tick.mjs'], {
    cwd: platformRoot,
    encoding: 'utf8',
    shell: false,
  });
  let parsed = {};
  try {
    const trimmed = (run.stdout || '').trim();
    const jsonStart = trimmed.indexOf('{');
    const jsonText = jsonStart >= 0 ? trimmed.slice(jsonStart) : trimmed;
    parsed = JSON.parse(jsonText || '{}');
  } catch {
    parsed = { ok: false, parseError: true, stdout: run.stdout?.slice(0, 500), stderr: run.stderr?.slice(0, 500) };
  }
  report.results.push({ index: i + 1, exitCode: run.status, ...parsed });
  writeFileSync(evidencePath, JSON.stringify(report, null, 2));
  console.log(`tick ${i + 1}/${tickLimit} ok=${parsed.ok} remaining=${parsed.remainingWithoutSnapshot ?? '?'}`);
  if (parsed.remainingWithoutSnapshot === 0) break;
  if (run.status !== 0 && parsed.status === 404) {
    console.error('corpus-snapshot-tick route not deployed yet');
    break;
  }
  if (i + 1 < tickLimit) {
    await new Promise((r) => setTimeout(r, cooldownMs));
  }
}

const last = report.results[report.results.length - 1];
const stalled = report.results.length >= 5 && report.results.slice(-5).every((r) => r.remainingWithoutSnapshot === last?.remainingWithoutSnapshot);
process.exit(last?.ok === true && !stalled ? 0 : stalled ? 2 : 1);