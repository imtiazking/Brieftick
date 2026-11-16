#!/usr/bin/env node
/**
 * Regression — missing handbook corpus cannot establish KNOWN coverage (production + eval harness path).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EVAL_SUITE_V21_PATH, REPO_ROOT, AUTHENTIC_CORPUS_B2_DIR } from '../lib/ri/eval/eval-paths.mjs';
import { buildSemanticIndex } from '../lib/ri/semantic/semantic-retrieval-eval.mjs';
import { runEvidenceGroundedScenario } from '../lib/ri/eval/run-evidence-grounded-scenario.mjs';
import { assessEvidenceQuestionCoverage } from '../lib/ri/reasoner/assess-evidence-question-coverage.mjs';
import { attachBm25ToIndex, scoreQuestionWithMethod } from '../lib/ri/semantic/offline-retrieval-methods.mjs';
import { assembleEvidenceBundle } from '../lib/ri/reasoner/evidence-assembler.mjs';

const failures = [];
const ok = (m) => console.log(`OK: ${m}`);

const suite = JSON.parse(readFileSync(EVAL_SUITE_V21_PATH, 'utf8'));
const caseRow = (suite.cases || []).find((c) => c.testId === 'EVAL-B-03');
if (!caseRow) {
  console.error('EVAL-B-03 missing from suite');
  process.exit(1);
}

const index = await buildSemanticIndex(AUTHENTIC_CORPUS_B2_DIR);
const bm = attachBm25ToIndex(index);

const retrieval = await scoreQuestionWithMethod(bm, caseRow.question, caseRow, 0.28, 'hybrid');
const bundle = assembleEvidenceBundle(bm, retrieval.allRankedChunks || [], {});
const direct = assessEvidenceQuestionCoverage({
  question: caseRow.question,
  bundle,
  retrieval,
  productionMode: true,
});

if (direct.questionCoverage === 'KNOWN') {
  failures.push(`EVAL-B-03 production assessor returned KNOWN (reasons: ${(direct.reasons || []).join(';')})`);
} else {
  ok(`EVAL-B-03 production coverage=${direct.questionCoverage} (COBS handbook absent)`);
}

for (const scenario of ['SUFFICIENT', 'PARTIAL', 'INSUFFICIENT']) {
  const row = await runEvidenceGroundedScenario(index, caseRow, scenario);
  if (row.questionCoverage === 'KNOWN') {
    failures.push(`EVAL-B-03 ${scenario} harness coverage KNOWN`);
  } else {
    ok(`EVAL-B-03 ${scenario} harness coverage=${row.questionCoverage}`);
  }
  if (row.applicationPolicyStatus === 'ANSWERED') {
    failures.push(`EVAL-B-03 ${scenario} policy must not ANSWERED without COBS handbook`);
  }
  if (scenario === 'PARTIAL' && row.applicationPolicyStatus === 'PARTIAL_ANSWER') {
    failures.push(`EVAL-B-03 PARTIAL must not PARTIAL_ANSWER — no supported material COBS aspect`);
  } else if (scenario === 'PARTIAL' && row.applicationPolicyStatus === 'INSUFFICIENT_EVIDENCE') {
    ok(`EVAL-B-03 PARTIAL policy=${row.applicationPolicyStatus} reason=${row.policyReason}`);
  }
}

const out = join(REPO_ROOT, 'docs/eval/EVIDENCE-COVERAGE-MISSING-PROVISION-RESULTS.json');
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
mkdirSync(dirname(out), { recursive: true });
writeFileSync(
  out,
  JSON.stringify(
    {
      schemaVersion: 'forgeniq.coverage.missing-provision.v1',
      capturedAt: new Date().toISOString(),
      directAssessment: direct,
      programmePass: failures.length === 0,
      failures,
    },
    null,
    2,
  ),
);

console.log(JSON.stringify({ ok: failures.length === 0, out, failures }, null, 2));
process.exit(failures.length ? 1 : 0);