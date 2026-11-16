#!/usr/bin/env node
/**
 * Production coverage path — questions NOT in eval suite; no eval metadata.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { EVAL_SUITE_V21_PATH, REPO_ROOT, AUTHENTIC_CORPUS_B2_DIR } from '../lib/ri/eval/eval-paths.mjs';
import { buildSemanticIndex } from '../lib/ri/semantic/semantic-retrieval-eval.mjs';
import { attachBm25ToIndex, scoreQuestionWithMethod } from '../lib/ri/semantic/offline-retrieval-methods.mjs';
import { assembleEvidenceBundle } from '../lib/ri/reasoner/evidence-assembler.mjs';
import { assessEvidenceQuestionCoverage, refineCoverageAfterVerification } from '../lib/ri/reasoner/assess-evidence-question-coverage.mjs';
import { runAskRiV2Pipeline } from '../lib/ri/reasoner/run-ask-ri-v2-pipeline.mjs';
import { createScenarioMockFetch } from '../lib/ri/eval/mock-reasoner-scenarios.mjs';
import { MOCK_ANTHROPIC_API_KEY } from '../lib/ri/reasoner/mock-anthropic-reasoner-fetch.mjs';
import { resolveFinalRegulatoryStatus } from '../lib/ri/reasoner/evidence-sufficiency-policy.mjs';

const UNSEEN_SCENARIOS = [
  {
    id: 'UNSEEN-SUFFICIENT-PRIN',
    question: 'Under PRIN, what high-level expectations apply to a firm’s honesty and integrity?',
    scenario: 'SUFFICIENT',
    expectPolicy: ['ANSWERED', 'PARTIAL_ANSWER'],
  },
  {
    id: 'UNSEEN-INSUFFICIENT-COBS',
    question: 'What does COBS 4.2.1R require for retail client disclosure of charges?',
    scenario: 'INSUFFICIENT',
    expectPolicy: ['INSUFFICIENT_EVIDENCE'],
  },
  {
    id: 'UNSEEN-FAKE-PS',
    question: 'Summarise FCA Policy Statement PS88/88 on tokenised deposits.',
    scenario: 'INSUFFICIENT',
    expectPolicy: ['INSUFFICIENT_EVIDENCE', 'BLOCKED'],
  },
  {
    id: 'UNSEEN-PARTIAL-FG',
    question: 'What should firms document when monitoring fair value outcomes under Consumer Duty guidance?',
    scenario: 'PARTIAL',
    expectPolicy: ['PARTIAL_ANSWER', 'ANSWERED', 'INSUFFICIENT_EVIDENCE'],
  },
];

const suite = JSON.parse(readFileSync(EVAL_SUITE_V21_PATH, 'utf8'));
const suiteQuestions = new Set((suite.cases || []).map((c) => String(c.question || '').trim()).filter(Boolean));
const failures = [];
const ok = (m) => console.log(`OK: ${m}`);

for (const sc of UNSEEN_SCENARIOS) {
  if (suiteQuestions.has(sc.question.trim())) failures.push(`${sc.id} duplicates suite question`);
}

const index = await buildSemanticIndex(AUTHENTIC_CORPUS_B2_DIR);
const bm25Index = attachBm25ToIndex(index);
const results = [];

for (const sc of UNSEEN_SCENARIOS) {
  const caseRow = {};
  const retrieval = await scoreQuestionWithMethod(bm25Index, sc.question, caseRow, 0.28, 'hybrid');
  const ranked = retrieval.allRankedChunks || [];
  const bundle = ranked.length ? assembleEvidenceBundle(bm25Index, ranked, {}) : { evidenceChunks: [] };
  const preCoverage = assessEvidenceQuestionCoverage({
    question: sc.question,
    bundle,
    retrieval,
    productionMode: true,
  });

  const mockFetch = ranked.length ? createScenarioMockFetch(bundle, sc.scenario) : null;
  const engine = await runAskRiV2Pipeline(bm25Index, sc.question, caseRow, {
    dryRun: !mockFetch,
    bm25Attached: true,
    providerDeps: mockFetch
      ? { skipExecutionGuard: true, apiKeyOverride: MOCK_ANTHROPIC_API_KEY, fetchFn: mockFetch }
      : undefined,
  });

  const policyStatus = typeof engine.status === 'string' ? engine.status : engine.status?.status;
  const row = {
    id: sc.id,
    question: sc.question,
    scenario: sc.scenario,
    preCoverage,
    pipelineCoverage: engine.coverageAssessment,
    policyStatus,
    policyReason: engine.stageC?.policyReason,
    citationCount: engine.citations?.length ?? 0,
    decisionTrace: engine.coverageAssessment?.decisionTrace || preCoverage.decisionTrace,
  };
  results.push(row);

  const policyOk = sc.expectPolicy.includes(policyStatus);
  row.policyMatchesExpectation = policyOk;
  if (!policyOk) failures.push(`${sc.id} policy ${policyStatus} not in expected ${sc.expectPolicy.join(',')}`);
  else ok(`${sc.id}: coverage=${engine.coverageAssessment?.questionCoverage} policy=${policyStatus}`);
}

const out = join(REPO_ROOT, 'docs/eval/PRODUCTION-COVERAGE-UNSEEN-QUESTIONS.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(
  out,
  JSON.stringify(
    {
      schemaVersion: 'forgeniq.coverage.unseen-questions.v1',
      capturedAt: new Date().toISOString(),
      programmePass: false,
      results,
      failures,
    },
    null,
    2,
  ),
);

console.log(JSON.stringify({ ok: failures.length === 0, out, failures }, null, 2));
process.exit(failures.length ? 1 : 0);