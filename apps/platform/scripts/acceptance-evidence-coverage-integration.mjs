#!/usr/bin/env node
/**
 * Full-pipeline integration — real coverage determination (no manual questionCoverage=KNOWN).
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { EVAL_SUITE_V21_PATH, REPO_ROOT, AUTHENTIC_CORPUS_B2_DIR } from '../lib/ri/eval/eval-paths.mjs';
import { buildSemanticIndex } from '../lib/ri/semantic/semantic-retrieval-eval.mjs';
import { runEvidenceGroundedScenario } from '../lib/ri/eval/run-evidence-grounded-scenario.mjs';

const THEMES = [
  { theme: 'sufficient_evidence', testId: 'EVAL-B-01' },
  { theme: 'insufficient_evidence', testId: 'EVAL-B-03' },
  { theme: 'conflicting_evidence', testId: 'EVAL-C-02' },
  { theme: 'partial_evidence', testId: 'EVAL-C-03' },
  { theme: 'guidance_vs_binding', testId: 'EVAL-D-02' },
  { theme: 'incorrect_citations', testId: 'EVAL-C-04' },
  { theme: 'missing_source', testId: 'EVAL-I-01' },
  { theme: 'unsupported_conclusions', testId: 'EVAL-E-01' },
  { theme: 'multi_source', testId: 'EVAL-G-02' },
  { theme: 'abstention', testId: 'EVAL-H-01' },
];

const SCENARIOS = ['SUFFICIENT', 'PARTIAL', 'INSUFFICIENT'];
const failures = [];
const ok = (m) => console.log(`OK: ${m}`);

const suite = JSON.parse(readFileSync(EVAL_SUITE_V21_PATH, 'utf8'));
const caseById = new Map((suite.cases || []).map((c) => [c.testId, c]));
const index = await buildSemanticIndex(AUTHENTIC_CORPUS_B2_DIR);

const results = [];

for (const { theme, testId } of THEMES) {
  const caseRow = caseById.get(testId);
  for (const scenario of SCENARIOS) {
    const row = await runEvidenceGroundedScenario(index, caseRow, scenario);
    results.push({ theme, ...row });

    if (testId === 'EVAL-B-03' && caseRow.evidenceAvailability === 'NOT_IN_SUITE') {
      if (row.questionCoverage !== 'UNKNOWN') failures.push('EVAL-B-03 must retain UNKNOWN (NOT_IN_SUITE)');
      else ok(`EVAL-B-03 ${scenario}: correct corpus abstention (NOT_IN_SUITE)`);
      continue;
    }

    if (testId === 'EVAL-I-01') {
      ok(`EVAL-I-01 ${scenario}: ${row.blocked ? 'BLOCKED' : row.applicationPolicyStatus}`);
      continue;
    }

    if (row.scenario === 'INSUFFICIENT' && row.applicationPolicyStatus !== 'INSUFFICIENT_EVIDENCE' && !row.blocked) {
      failures.push(`${testId} INSUFFICIENT scenario should abstain (got ${row.applicationPolicyStatus})`);
    }

    ok(`${testId} ${scenario}: coverage=${row.questionCoverage} policy=${row.applicationPolicyStatus} scorer=${row.scorerOutcome}`);
  }
}

const out = join(REPO_ROOT, 'docs/eval/EVIDENCE-COVERAGE-INTEGRATION-RESULTS.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(
  out,
  JSON.stringify(
    {
      schemaVersion: 'forgeniq.eval.coverage-integration.v1',
      capturedAt: new Date().toISOString(),
      programmePass: false,
      regulatoryAccuracyPass: false,
      note: 'Uses assess-evidence-question-coverage; outcomes vary by corpus mapping — not pass/fail vs ideal.',
      results,
      failures,
    },
    null,
    2,
  ),
);

console.log(JSON.stringify({ ok: failures.length === 0, out, failures, programmePass: false }, null, 2));
process.exit(failures.length ? 1 : 0);