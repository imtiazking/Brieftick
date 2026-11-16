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
import { assessEvidenceQuestionCoverage } from '../lib/ri/reasoner/assess-evidence-question-coverage.mjs';
import { runAskRiV2Pipeline } from '../lib/ri/reasoner/run-ask-ri-v2-pipeline.mjs';
import { createScenarioMockFetch } from '../lib/ri/eval/mock-reasoner-scenarios.mjs';
import { MOCK_ANTHROPIC_API_KEY } from '../lib/ri/reasoner/mock-anthropic-reasoner-fetch.mjs';

/** @type {Array<{id:string,category:string,question:string,scenario:string,expectPolicy:string[],expectCoverage?:string[]}>} */
const UNSEEN_SCENARIOS = [
  {
    id: 'UNSEEN-SUFFICIENT-PRIN',
    category: 'fully_supported',
    question: 'Under PRIN, what high-level expectations apply to a firm’s honesty and integrity?',
    scenario: 'SUFFICIENT',
    expectPolicy: ['ANSWERED', 'PARTIAL_ANSWER'],
    expectCoverage: ['KNOWN'],
  },
  {
    id: 'UNSEEN-SUFFICIENT-SYSC',
    category: 'fully_supported',
    question: 'What are SYSC requirements for establishing and maintaining effective systems and controls?',
    scenario: 'SUFFICIENT',
    expectPolicy: ['ANSWERED', 'PARTIAL_ANSWER'],
  },
  {
    id: 'UNSEEN-INSUFFICIENT-COBS',
    category: 'insufficient',
    question: 'What does COBS 4.2.1R require for retail client disclosure of charges?',
    scenario: 'INSUFFICIENT',
    expectPolicy: ['INSUFFICIENT_EVIDENCE'],
    expectCoverage: ['UNKNOWN'],
  },
  {
    id: 'UNSEEN-INSUFFICIENT-RANDOM',
    category: 'insufficient',
    question: 'What are the Basel IV market risk disclosure rules for commodity warehouse receipts in the UAE?',
    scenario: 'INSUFFICIENT',
    expectPolicy: ['INSUFFICIENT_EVIDENCE'],
    expectCoverage: ['UNKNOWN'],
  },
  {
    id: 'UNSEEN-FAKE-PS',
    category: 'irrelevant_source',
    question: 'Summarise FCA Policy Statement PS88/88 on tokenised deposits.',
    scenario: 'INSUFFICIENT',
    expectPolicy: ['INSUFFICIENT_EVIDENCE', 'BLOCKED'],
    expectCoverage: ['UNKNOWN'],
  },
  {
    id: 'UNSEEN-PARTIAL-FG',
    category: 'partial',
    question: 'What should firms document when monitoring fair value outcomes under Consumer Duty guidance?',
    scenario: 'PARTIAL',
    expectPolicy: ['PARTIAL_ANSWER', 'ANSWERED', 'INSUFFICIENT_EVIDENCE'],
  },
  {
    id: 'UNSEEN-MULTI-PRIN-DUTY',
    category: 'multi_regulation',
    question: 'How do PRIN and the Consumer Duty interact when assessing fair value for retail customers?',
    scenario: 'PARTIAL',
    expectPolicy: ['PARTIAL_ANSWER', 'ANSWERED', 'INSUFFICIENT_EVIDENCE'],
  },
  {
    id: 'UNSEEN-CONFLICT-BIND-GUIDE',
    category: 'binding_vs_guidance',
    question: 'Is FG22/5 binding on firms or only guidance when setting monitoring metrics?',
    scenario: 'PARTIAL',
    expectPolicy: ['PARTIAL_ANSWER', 'ANSWERED', 'INSUFFICIENT_EVIDENCE'],
  },
  {
    id: 'UNSEEN-TEMPORAL-PS22',
    category: 'commencement_date',
    question: 'When did PS22/9 Consumer Duty rules commence for open-ended investment companies?',
    scenario: 'SUFFICIENT',
    expectPolicy: ['ANSWERED', 'PARTIAL_ANSWER', 'INSUFFICIENT_EVIDENCE'],
  },
  {
    id: 'UNSEEN-APPLICABILITY-CU',
    category: 'applicability',
    question: 'Does the Consumer Duty apply to credit unions providing retail banking services?',
    scenario: 'PARTIAL',
    expectPolicy: ['PARTIAL_ANSWER', 'ANSWERED', 'INSUFFICIENT_EVIDENCE'],
  },
  {
    id: 'UNSEEN-WRONG-CITATION-MOCK',
    category: 'citation_integrity',
    question: 'Under CONC, what forbearance expectations apply when a borrower is in persistent debt?',
    scenario: 'INSUFFICIENT',
    expectPolicy: ['INSUFFICIENT_EVIDENCE'],
    expectCoverage: ['UNKNOWN'],
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
  const coverage = engine.coverageAssessment?.questionCoverage ?? preCoverage.questionCoverage;
  const verificationOk = engine.claimVerification?.ok;
  const row = {
    id: sc.id,
    category: sc.category,
    question: sc.question,
    scenario: sc.scenario,
    retrievalMethod: retrieval.retrievalMethod,
    retrievalTopSemantic: retrieval.allRankedChunks?.[0]?.semanticSimilarity,
    sourcePublications: [...new Set((bundle.evidenceChunks || []).map((c) => c.publicationTitle).filter(Boolean))].slice(0, 5),
    questionCoverage: coverage,
    completeness: engine.coverageAssessment?.completeness ?? preCoverage.completeness,
    policyStatus,
    policyReason: engine.stageC?.policyReason,
    citationCount: engine.citations?.length ?? 0,
    claimVerificationOk: verificationOk,
    materialIssueSources: (preCoverage.decisionTrace || []).filter((d) => d.source === 'question_parser' || d.source?.includes?.('extract')),
    coverageMappings: (engine.coverageAssessment?.mappings || preCoverage.mappings || []).map((m) => ({
      issueId: m.issueId,
      status: m.status,
      source: m.source,
    })),
    pass: true,
    remainingDefects: [],
  };
  results.push(row);

  const policyOk = sc.expectPolicy.includes(policyStatus);
  if (!policyOk) {
    row.pass = false;
    row.remainingDefects.push(`policy ${policyStatus} not in ${sc.expectPolicy.join(',')}`);
    failures.push(`${sc.id} policy ${policyStatus}`);
  }

  if (sc.expectCoverage && !sc.expectCoverage.includes(coverage)) {
    row.pass = false;
    row.remainingDefects.push(`coverage ${coverage} not in ${sc.expectCoverage.join(',')}`);
    failures.push(`${sc.id} coverage ${coverage}`);
  }

  if (row.pass) ok(`${sc.id}: coverage=${coverage} policy=${policyStatus}`);
}

const out = join(REPO_ROOT, 'docs/eval/PRODUCTION-COVERAGE-UNSEEN-QUESTIONS.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(
  out,
  JSON.stringify(
    {
      schemaVersion: 'forgeniq.coverage.unseen-questions.v2',
      capturedAt: new Date().toISOString(),
      disclaimer: 'Mocked provider; regulatory accuracy requires SME review — not claimed here.',
      scenarioCount: UNSEEN_SCENARIOS.length,
      programmePass: failures.length === 0,
      results,
      failures,
    },
    null,
    2,
  ),
);

console.log(JSON.stringify({ ok: failures.length === 0, out, failures }, null, 2));
process.exit(failures.length ? 1 : 0);