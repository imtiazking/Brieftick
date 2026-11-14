#!/usr/bin/env node
/**
 * Stage D — verify offline scoring-evidence export reconstructs scoreEvalCase outcomes (mock/dry-run only).
 */
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { EVAL_SUITE_V21_PATH, REPO_ROOT } from '../lib/ri/eval/eval-paths.mjs';
import { assessScoringReconstructionInputs } from '../lib/ri/eval/eval-scoring-reconstruction.mjs';
import {
  loadScoringEvidenceBundle,
  reconstructScoringFromEvidence,
  compareScoringRecords,
} from '../lib/ri/eval/scoring-evidence-export.mjs';

const platformRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE_TEST_IDS = ['EVAL-B-01', 'EVAL-D-02', 'EVAL-H-01'];
const failures = [];
const ok = (m) => console.log(`OK: ${m}`);
const fail = (m) => {
  failures.push(m);
  console.error(`FAIL: ${m}`);
};

const suite = JSON.parse(readFileSync(EVAL_SUITE_V21_PATH, 'utf8'));
const caseById = new Map((suite.cases || []).map((c) => [c.testId, c]));

const historicalReport = join(
  REPO_ROOT,
  'docs/eval/runs/phase-2c2-ask-ri-v2-eval-live-claude-haiku-5-5-2026-11-10T22-17-34-994Z.json',
);
if (existsSync(historicalReport)) {
  const hist = JSON.parse(readFileSync(historicalReport, 'utf8'));
  const row = (hist.results || []).find((r) => r.testId === 'EVAL-H-04');
  const audit = assessScoringReconstructionInputs(row, caseById.get('EVAL-H-04') || null);
  if (audit.reconstructable) fail('historical sanitised report must remain NOT_RECONSTRUCTABLE');
  else ok(`historical live report preserved as ${audit.status} (no fabrication)`);
} else {
  ok('historical live report not present — skipped historical NOT_RECONSTRUCTABLE check');
}

const workDir = mkdtempSync(join(tmpdir(), 'forgeniq-scoring-evidence-'));
const localPath = join(workDir, 'scoring-evidence-local.json');
const manifestPath = join(REPO_ROOT, 'docs/eval/scoring-evidence/baselines/stage-d-dry-run-v1-manifest.json');
const evalOut = join(workDir, 'eval-report.json');

const r = spawnSync(
  process.execPath,
  [
    'scripts/run-ask-ri-v2-eval-2c2.mjs',
    '--dry-run',
    `--test-ids=${BASELINE_TEST_IDS.join(',')}`,
    `--out=${evalOut}`,
    `--scoring-evidence-local=${localPath}`,
    `--scoring-evidence-manifest=${manifestPath}`,
    '--force',
  ],
  { cwd: platformRoot, encoding: 'utf8', maxBuffer: 30 * 1024 * 1024 },
);

if (r.status !== 0) {
  console.error(r.stderr?.slice(0, 3000));
  rmSync(workDir, { recursive: true, force: true });
  process.exit(r.status || 1);
}

const bundle = loadScoringEvidenceBundle(localPath);
if (!bundle?.records?.length) fail('scoring evidence local bundle missing records');
else ok(`local scoring-evidence bundle: ${bundle.records.length} records`);

let reconstructionPasses = 0;
for (const record of bundle.records || []) {
  const caseRow = caseById.get(record.testId);
  if (!caseRow) {
    fail(`suite case missing for ${record.testId}`);
    continue;
  }
  const rescored = reconstructScoringFromEvidence(record, caseRow);
  const original = {
    outcome: record.actual.outcome,
    dimensions: record.actual.dimensions,
    criticalFailures: record.actual.criticalFailures,
  };
  const cmp = compareScoringRecords(original, rescored);
  if (!cmp.match) {
    fail(`${record.testId} reconstruction mismatch: ${JSON.stringify(cmp.mismatches.slice(0, 3))}`);
  } else {
    reconstructionPasses += 1;
    ok(`${record.testId} scoring reconstruction match`);
  }
}

if (reconstructionPasses !== BASELINE_TEST_IDS.length) {
  fail(`expected ${BASELINE_TEST_IDS.length} reconstruction matches, got ${reconstructionPasses}`);
}

if (!existsSync(manifestPath)) fail('committed sanitised manifest not written');
else {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const hasFullAnswer = JSON.stringify(manifest).includes('"answer"');
  if (hasFullAnswer) fail('manifest must not contain full answer text');
  else ok('committed manifest is sanitised (hashes + outcomes only)');
}

rmSync(workDir, { recursive: true, force: true });

const summary = {
  ok: failures.length === 0,
  programmePass: false,
  baselineTestIds: BASELINE_TEST_IDS,
  reconstructionPasses,
  historicalD01D11LiveRuns: 'NOT_RECONSTRUCTABLE_WITHOUT_LOCAL_ARTEFACT',
  failures,
};
console.log(JSON.stringify(summary, null, 2));
process.exit(failures.length ? 1 : 0);