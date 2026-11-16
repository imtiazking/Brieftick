#!/usr/bin/env node
/**
 * SME review pack — engineering assertions marked; no auto-approval of ideals.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { EVAL_SUITE_V21_PATH, REPO_ROOT, AUTHENTIC_CORPUS_B2_DIR } from '../lib/ri/eval/eval-paths.mjs';
import { buildSemanticIndex } from '../lib/ri/semantic/semantic-retrieval-eval.mjs';
import { attachBm25ToIndex, scoreQuestionWithMethod } from '../lib/ri/semantic/offline-retrieval-methods.mjs';
import { assembleEvidenceBundle } from '../lib/ri/reasoner/evidence-assembler.mjs';
import { runAskRiV2Pipeline } from '../lib/ri/reasoner/run-ask-ri-v2-pipeline.mjs';
import {
  MOCK_ANTHROPIC_API_KEY,
  createMockAnthropicReasonerFetch,
} from '../lib/ri/reasoner/mock-anthropic-reasoner-fetch.mjs';

const THEMES = [
  'EVAL-B-01',
  'EVAL-B-03',
  'EVAL-C-02',
  'EVAL-C-03',
  'EVAL-D-02',
  'EVAL-C-04',
  'EVAL-I-01',
  'EVAL-E-01',
  'EVAL-G-02',
  'EVAL-H-01',
];

const suite = JSON.parse(readFileSync(EVAL_SUITE_V21_PATH, 'utf8'));
const caseById = new Map((suite.cases || []).map((c) => [c.testId, c]));
const index = await buildSemanticIndex(AUTHENTIC_CORPUS_B2_DIR);
const bm25Index = attachBm25ToIndex(index);

const pack = [];

for (const testId of THEMES) {
  const caseRow = caseById.get(testId);
  const retrieval = await scoreQuestionWithMethod(bm25Index, caseRow.question, caseRow, 0.28, 'hybrid');
  const ranked = retrieval.allRankedChunks || [];
  const bundle = ranked.length ? assembleEvidenceBundle(bm25Index, ranked, {}) : null;

  let engineResult = { status: 'NOT_RUN' };
  if (bundle?.evidenceChunks?.length) {
    const mockFetch = createMockAnthropicReasonerFetch(bundle);
    engineResult = await runAskRiV2Pipeline(bm25Index, caseRow.question, caseRow, {
      dryRun: false,
      bm25Attached: true,
      providerDeps: {
        skipExecutionGuard: true,
        apiKeyOverride: MOCK_ANTHROPIC_API_KEY,
        fetchFn: mockFetch,
      },
    });
  } else {
    engineResult = await runAskRiV2Pipeline(bm25Index, caseRow.question, caseRow, { dryRun: false, bm25Attached: true });
  }

  const passages = (bundle?.evidenceChunks || []).slice(0, 5).map((c) => ({
    evidenceChunkId: c.evidenceChunkId,
    publicationId: c.publicationId,
    publicationTitle: c.publicationTitle,
    publicationReference: c.publicationReference,
    sectionReference: c.sectionReference,
    physicalPageNumber: c.physicalPageNumber,
    excerptSha256: createHash('sha256').update(String(c.verbatimText || '').slice(0, 500), 'utf8').digest('hex'),
    excerptPreview: String(c.verbatimText || '').slice(0, 280),
  }));

  pack.push({
    testId,
    question: caseRow.question,
    expectedIdealResult: caseRow.expectedIdealResult,
    expectedIdealApproved: false,
    engineeringMockStatus: engineResult.status,
    engineeringMockSufficiency: 'ENGINEERING_ASSERTION_NOT_SME_APPROVED',
    sourceDocuments: bundle?.publicationsRepresented || [],
    evidencePassages: passages,
    citations: (engineResult.citations || []).map((c) => ({
      publicationId: c.publicationId,
      physicalPageNumber: c.physicalPageNumber,
      sectionReference: c.sectionReference,
    })),
    coverageAssessment: engineResult.coverageAssessment || null,
    applicableDates: null,
    expectedRegulatoryInterpretation: caseRow.requiredAnswerThemes || [],
    unresolvedForSme: [
      'Confirm expectedIdealResult against authoritative sources',
      'Confirm mock sufficiency is not regulatory truth',
      caseRow.reviewStatus === 'AWAITING_SME_REVIEW' ? 'Suite reviewStatus AWAITING_SME_REVIEW' : null,
    ].filter(Boolean),
  });
}

const outPath = join(REPO_ROOT, 'docs/eval/SME-REVIEW-PACK-10-THEMES.json');
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(
  outPath,
  JSON.stringify(
    {
      schemaVersion: 'forgeniq.eval.sme-review-pack.v1',
      capturedAt: new Date().toISOString(),
      programmePass: false,
      smeSignOff: null,
      cases: pack,
    },
    null,
    2,
  ),
);
console.log(JSON.stringify({ ok: true, outPath, cases: pack.length }, null, 2));