#!/usr/bin/env node
/**
 * Stage D expanded dry-run regression — themes mapped to v2.1 cases; programmePass stays false.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { verifyProtectedBaselineHashes } from '../lib/ri/eval/baseline-protection.mjs';
import { REPO_ROOT } from '../lib/ri/eval/eval-paths.mjs';

const platformRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const runsDir = join(REPO_ROOT, 'docs', 'eval', 'runs');

const THEME_CASES = [
  { theme: 'accurate_evidence_backed', testId: 'EVAL-B-01' },
  { theme: 'insufficient_evidence', testId: 'EVAL-B-03' },
  { theme: 'conflicting_evidence', testId: 'EVAL-C-02' },
  { theme: 'partial_evidence', testId: 'EVAL-C-03' },
  { theme: 'guidance_vs_binding_law', testId: 'EVAL-D-02' },
  { theme: 'incorrect_source_citations', testId: 'EVAL-C-04' },
  { theme: 'missing_source_material', testId: 'EVAL-I-01' },
  { theme: 'unsupported_obligations', testId: 'EVAL-E-01' },
  { theme: 'cross_document_reasoning', testId: 'EVAL-G-02' },
  { theme: 'abstention_regulatory_interpretation', testId: 'EVAL-H-01' },
];

const testIds = THEME_CASES.map((t) => t.testId).join(',');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outPath = join(runsDir, `stage-d-regression-${stamp}.json`);

const r = spawnSync(
  process.execPath,
  ['scripts/run-ask-ri-v2-eval-2c2.mjs', '--dry-run', `--test-ids=${testIds}`, `--out=${outPath}`, '--force'],
  { cwd: platformRoot, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 },
);

if (r.status !== 0) {
  console.error(r.stderr?.slice(0, 2000));
  process.exit(r.status || 1);
}

const report = JSON.parse(readFileSync(outPath, 'utf8'));
const baselines = verifyProtectedBaselineHashes();

const deviations = [];
const resultsById = new Map((report.results || []).map((row) => [row.testId, row]));
for (const theme of THEME_CASES) {
  const row = resultsById.get(theme.testId);
  if (!row) {
    deviations.push({ theme: theme.theme, testId: theme.testId, issue: 'missing_result' });
    continue;
  }
  if (row.v2ExecutionStatus === 'BLOCKED_UNEXPECTED') {
    deviations.push({ theme: theme.theme, testId: theme.testId, issue: 'blocked_unexpected', detail: row });
  }
}

const protectedBaseline = join(REPO_ROOT, 'docs', 'eval', 'baseline', 'deterministic-v2.1-2026-11-10.json');
let baselineCompare = { compared: false, note: 'V2 dry-run outcomes are not byte-identical to deterministic baseline' };
if (existsSync(protectedBaseline)) {
  const baselineSha = createHash('sha256').update(readFileSync(protectedBaseline)).digest('hex');
  const match = baselines.find((b) => b.path?.includes('deterministic-v2.1'));
  baselineCompare = {
    compared: true,
    baselineSha256: baselineSha,
    protectedRecordSha256: match?.sha256 ?? null,
    hashMatch: match?.sha256 === baselineSha,
  };
}

const envelope = {
  schemaVersion: 'forgeniq.eval.stage-d-regression.v1',
  capturedAt: new Date().toISOString(),
  programmePass: false,
  programmePassCriteria:
    'Full SME acceptance of expanded regression themes + live provider spot-checks (Stage E) — not dry-run alone',
  dryRunOnly: true,
  themes: THEME_CASES,
  sourceReportPath: outPath.replace(/\\/g, '/'),
  caseCount: report.caseCount,
  summary: report.summary,
  deviations,
  baselineCompare,
  protectedBaselines: baselines,
  acceptanceCriteriaMet: deviations.length === 0 && report.caseCount === THEME_CASES.length,
};

mkdirSync(runsDir, { recursive: true });
const summaryPath = join(runsDir, `stage-d-regression-summary-${stamp}.json`);
writeFileSync(summaryPath, JSON.stringify(envelope, null, 2));

console.log(
  JSON.stringify(
    {
      ok: r.status === 0,
      programmePass: false,
      outPath,
      summaryPath,
      deviations: deviations.length,
      acceptanceCriteriaMet: envelope.acceptanceCriteriaMet,
    },
    null,
    2,
  ),
);
process.exit(deviations.length ? 1 : 0);