#!/usr/bin/env node
/**
 * SME review sheet — focus cases from SME-REVIEW-PACK-FINAL + offline mock runs.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { EVAL_SUITE_V21_PATH, REPO_ROOT, AUTHENTIC_CORPUS_B2_DIR } from '../lib/ri/eval/eval-paths.mjs';
import { buildSemanticIndex } from '../lib/ri/semantic/semantic-retrieval-eval.mjs';
import { runAskRiV2Pipeline } from '../lib/ri/reasoner/run-ask-ri-v2-pipeline.mjs';
import { attachBm25ToIndex, scoreQuestionWithMethod } from '../lib/ri/semantic/offline-retrieval-methods.mjs';
import { assembleEvidenceBundle } from '../lib/ri/reasoner/evidence-assembler.mjs';
import { createScenarioMockFetch } from '../lib/ri/eval/mock-reasoner-scenarios.mjs';
import { MOCK_ANTHROPIC_API_KEY } from '../lib/ri/reasoner/mock-anthropic-reasoner-fetch.mjs';

const PACK_PATH = join(REPO_ROOT, 'docs/eval/SME-REVIEW-PACK-FINAL.json');
const UNSEEN_PATH = join(REPO_ROOT, 'docs/eval/PRODUCTION-COVERAGE-UNSEEN-QUESTIONS.json');
const pack = JSON.parse(readFileSync(PACK_PATH, 'utf8'));
const unseen = JSON.parse(readFileSync(UNSEEN_PATH, 'utf8'));
const suite = JSON.parse(readFileSync(EVAL_SUITE_V21_PATH, 'utf8'));
const caseById = new Map((suite.cases || []).map((c) => [c.testId, c]));

const index = await buildSemanticIndex(AUTHENTIC_CORPUS_B2_DIR);
const bm = attachBm25ToIndex(index);

const CASES = [
  { sheetId: 'SME-PRIN', unseenId: 'UNSEEN-SUFFICIENT-PRIN', scenario: 'SUFFICIENT' },
  { sheetId: 'SME-FG-PARTIAL', unseenId: 'UNSEEN-PARTIAL-FG', scenario: 'PARTIAL' },
  { sheetId: 'SME-BIND-GUIDE', unseenId: 'UNSEEN-CONFLICT-BIND-GUIDE', scenario: 'PARTIAL' },
  { sheetId: 'SME-MULTI-REG', unseenId: 'UNSEEN-MULTI-PRIN-DUTY', scenario: 'PARTIAL' },
  { sheetId: 'SME-COBS-ABSENT', testId: 'EVAL-B-03', scenario: 'INSUFFICIENT' },
  { sheetId: 'SME-MISSING-PS', testId: 'EVAL-I-01', scenario: 'INSUFFICIENT' },
];

async function runQuestion(question, caseRow, scenario) {
  const retrieval = await scoreQuestionWithMethod(bm, question, caseRow || {}, 0.28, 'hybrid');
  const ranked = retrieval.allRankedChunks || [];
  const bundle = ranked.length ? assembleEvidenceBundle(bm, ranked, {}) : { evidenceChunks: [] };
  const mockFetch = ranked.length ? createScenarioMockFetch(bundle, scenario) : null;
  return runAskRiV2Pipeline(bm, question, caseRow || {}, {
    bm25Attached: true,
    providerDeps: mockFetch
      ? { skipExecutionGuard: true, apiKeyOverride: MOCK_ANTHROPIC_API_KEY, fetchFn: mockFetch }
      : undefined,
  });
}

const rows = [];

for (const spec of CASES) {
  let question;
  let expectedAnswer = 'SME to confirm against authoritative regulatory sources';
  const caseRow = spec.testId ? caseById.get(spec.testId) : {};
  if (spec.unseenId) {
    question = unseen.results.find((r) => r.id === spec.unseenId)?.question;
  } else {
    question = caseRow.question;
    expectedAnswer =
      caseRow.expectedIdealResult?.outcomeClassification || caseRow.expectedResultClassification || expectedAnswer;
  }

  const engine = await runQuestion(question, caseRow, spec.scenario);
  const evidence = (engine.citations || []).map((c) => ({
    publicationTitle: c.publicationTitle,
    publicationReference: c.publicationReference,
    sectionReference: c.sectionReference,
    physicalPageNumber: c.physicalPageNumber,
    excerpt: String(c.excerpt || '').slice(0, 200),
  }));

  const focus = pack.focusAreas.find((f) =>
    spec.unseenId ? f.references?.includes(spec.unseenId) : f.references?.includes(spec.testId),
  );

  rows.push({
    sheetId: spec.sheetId,
    regulatoryQuestion: question,
    expectedAnswer,
    actualPolicyStatus: engine.status,
    actualAnswerPreview: String(engine.answer || '').slice(0, 400),
    engineeringCoverage: engine.coverageAssessment?.questionCoverage,
    supportingRegulatoryEvidence: evidence,
    exactSourceCitations: evidence,
    applicability: 'SME to confirm firm scope / client category',
    effectiveDates: 'Not asserted — confirm from cited sources',
    interpretationQuestions: focus?.smeMustConfirm || [],
    smeRegulatoryAccuracyApproved: false,
    smeApproverName: null,
    smeApprovalDate: null,
  });
}

const out = join(REPO_ROOT, 'docs/eval/SME-REVIEW-SHEET.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(
  out,
  JSON.stringify(
    {
      schemaVersion: 'forgeniq.sme.review-sheet.v1',
      capturedAt: new Date().toISOString(),
      derivedFrom: 'docs/eval/SME-REVIEW-PACK-FINAL.json',
      disclaimer: 'Mocked offline provider — not regulatory approval',
      rows,
    },
    null,
    2,
  ),
);
console.log(JSON.stringify({ ok: true, out, count: rows.length }, null, 2));