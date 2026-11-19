#!/usr/bin/env node
/**
 * PS26/1 live-extraction release candidate — Phase 5 + PS26-specific offline suites on current HEAD.
 */
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REPO_ROOT } from '../lib/ri/eval/eval-paths.mjs';

const platformRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const headSha = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' }).stdout?.trim();

const EXTRA = [
  'acceptance-ps26-1-runtime-deps.mjs',
  'acceptance-ps26-1-persist-controlled-dry-run.mjs',
  'acceptance-ps26-1-persist-controlled-offline.mjs',
  'acceptance-ps26-1-lab-anthropic-budget-guard.mjs',
  'acceptance-ps26-1-uc-ri-005-execution-controls.mjs',
];

function runNode(script) {
  const t0 = Date.now();
  const r = spawnSync('node', [join('scripts', script)], {
    cwd: platformRoot,
    encoding: 'utf8',
    env: { ...process.env, ANTHROPIC_API_KEY: '', RI_AI_EXECUTION_ENABLED: '0' },
  });
  return {
    script,
    status: (r.status ?? 1) === 0 ? 'PASS' : 'FAIL',
    exitCode: r.status,
    durationMs: Date.now() - t0,
    tail: (r.stderr || r.stdout || '').slice(-300),
  };
}

const phase5 = spawnSync('node', ['scripts/run-forgeniq-phase5-engineering-regression.mjs'], {
  cwd: platformRoot,
  encoding: 'utf8',
  env: { ...process.env, ANTHROPIC_API_KEY: '', RI_AI_EXECUTION_ENABLED: '0' },
});
const phase5Pass = (phase5.status ?? 1) === 0;

const ps26Rows = EXTRA.map(runNode);
const hardFail = ps26Rows.filter((r) => r.status === 'FAIL').length + (phase5Pass ? 0 : 1);

const report = {
  schemaVersion: 'forgeniq.ps26.live-extraction.rc-regression.v1',
  capturedAt: new Date().toISOString(),
  candidateCommitSha: headSha,
  worktreeRoot: REPO_ROOT,
  phase5EngineeringRegression: {
    status: phase5Pass ? 'PASS' : 'FAIL',
    exitCode: phase5.status,
    artefact: 'docs/eval/FORGENIQ-PHASE5-ENGINEERING-REGRESSION.json',
  },
  ps26Suites: ps26Rows,
  programmePass: hardFail === 0,
  note: 'Results from this commit worktree only — no inferred passes from other branches.',
};
const out = join(REPO_ROOT, 'docs/eval/FORGENIQ-PS26-LIVE-EXTRACTION-RC.json');
writeFileSync(out, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exit(hardFail ? 1 : 0);