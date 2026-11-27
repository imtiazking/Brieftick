#!/usr/bin/env node
/**
 * Tranche G — deterministic Ask RI retrieval evaluation (offline, no paid AI).
 */
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { REPO_ROOT } from '../../lib/ri/eval/eval-paths.mjs';

const day = new Date().toISOString().slice(0, 10);
const outDir = join(REPO_ROOT, 'docs', 'uat', 'evidence', `tranche-g-retrieval-eval-${day}`);
const suite = join(REPO_ROOT, 'docs', 'eval', 'ask-ri-v2-eval-suite-v2.1.json');
const outFile = join(outDir, 'RESULT.json');

mkdirSync(outDir, { recursive: true });
const run = spawnSync(
  process.execPath,
  ['./scripts/run-ask-ri-eval-suite.mjs', `--suite=${suite}`, `--out=${outFile}`, '--quiet', '--force'],
  { cwd: join(REPO_ROOT, 'apps', 'platform'), encoding: 'utf8' },
);
if (run.status !== 0) {
  console.error(run.stdout || run.stderr);
  process.exit(run.status ?? 1);
}

const results = JSON.parse(readFileSync(outFile, 'utf8'));
const cases = results.results || [];
const tally = {
  total: cases.length,
  pass: 0,
  partialPass: 0,
  fail: 0,
  correctInsufficientEvidence: 0,
  passWithRefutation: 0,
  engineInsufficientEvidence: 0,
  engineUnresolved: 0,
  substantiveAnswered: 0,
  citationNonZero: 0,
};

for (const row of cases) {
  const outcome = row.outcome;
  if (outcome === 'PASS') tally.pass += 1;
  if (outcome === 'PARTIAL_PASS') tally.partialPass += 1;
  if (outcome === 'FAIL') tally.fail += 1;
  if (outcome === 'CORRECT_INSUFFICIENT_EVIDENCE') tally.correctInsufficientEvidence += 1;
  if (outcome === 'PASS_WITH_REFUTATION') tally.passWithRefutation += 1;
  if (row.engineStatus === 'INSUFFICIENT_EVIDENCE') tally.engineInsufficientEvidence += 1;
  if (row.engineStatus === 'UNRESOLVED') tally.engineUnresolved += 1;
  if (row.engineStatus === 'ANSWERED' || row.engineStatus === 'PARTIAL_ANSWER') tally.substantiveAnswered += 1;
  if ((row.citationCount || 0) > 0) tally.citationNonZero += 1;
}

const summary = {
  generatedAt: new Date().toISOString(),
  engine: 'deterministic',
  suite: 'ask-ri-v2-eval-suite-v2.1.json',
  gitSha: results.gitSha || null,
  tally,
  note: 'INSUFFICIENT_EVIDENCE outcomes are scored as correct abstention, not substantive regulatory answers.',
  inventoryBaseline: 'regulatory-knowledge-foundation-2026-11-27/SUMMARY.json',
};

writeFileSync(join(outDir, 'SUMMARY.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));