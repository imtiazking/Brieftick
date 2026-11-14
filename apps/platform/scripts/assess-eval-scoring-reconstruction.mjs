#!/usr/bin/env node
/**
 * Offline scoring reconstruction audit (no scoreEvalCase, no API).
 * Usage: node ./scripts/assess-eval-scoring-reconstruction.mjs [--test-id=EVAL-H-04] [--report=path]
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EVAL_SUITE_V21_PATH, REPO_ROOT } from '../lib/ri/eval/eval-paths.mjs';
import { assessScoringReconstructionInputs } from '../lib/ri/eval/eval-scoring-reconstruction.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const defaultReport = join(
  ROOT,
  'docs/eval/runs/phase-2c2-ask-ri-v2-eval-live-claude-haiku-5-5-2026-11-10T22-17-34-994Z.json',
);

function parseArgs(argv) {
  let testId = 'EVAL-H-04';
  let report = defaultReport;
  for (const a of argv) {
    if (a.startsWith('--test-id=')) testId = a.slice('--test-id='.length);
    if (a.startsWith('--report=')) report = a.slice('--report='.length);
  }
  return { testId, report };
}

const cli = parseArgs(process.argv.slice(2));
const suite = JSON.parse(readFileSync(EVAL_SUITE_V21_PATH, 'utf8'));
const report = JSON.parse(readFileSync(cli.report, 'utf8'));
const row = (report.results || []).find((r) => r.testId === cli.testId);
const caseRow = (suite.cases || []).find((c) => c.testId === cli.testId);

if (!row) {
  console.log(JSON.stringify({ ok: false, error: 'case_not_in_report', testId: cli.testId }));
  process.exit(1);
}

const audit = assessScoringReconstructionInputs(row, caseRow || null);
console.log(
  JSON.stringify(
    {
      testId: cli.testId,
      reportPath: cli.report,
      observedHistorical: {
        outcome: row.outcome,
        engineStatus: row.engineStatus,
        v2ExecutionStatus: row.v2ExecutionStatus,
        citationCount: row.citationCount,
        hasAnswerPreviewOnly: Boolean(row.answerPreview && !row.answer),
      },
      reconstruction: audit,
      distinction:
        'Observed outcomes in the report are historical harness results; D01–D11 / CF-* cannot be independently reproduced from this report without full answer + citations.',
    },
    null,
    2,
  ),
);
