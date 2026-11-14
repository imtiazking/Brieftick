#!/usr/bin/env node
/**
 * Stage C/D — bounded offline mocked-provider theme acceptance vs expectedIdealResult.
 * programmePass remains false; SME review flags explicit.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EVAL_SUITE_V21_PATH, REPO_ROOT } from '../lib/ri/eval/eval-paths.mjs';
import { AUTHENTIC_CORPUS_B2_DIR } from '../lib/ri/eval/eval-paths.mjs';
import { buildSemanticIndex } from '../lib/ri/semantic/semantic-retrieval-eval.mjs';
import { attachBm25ToIndex, scoreQuestionWithMethod } from '../lib/ri/semantic/offline-retrieval-methods.mjs';
import { assembleEvidenceBundle } from '../lib/ri/reasoner/evidence-assembler.mjs';
import { runAskRiV2Pipeline } from '../lib/ri/reasoner/run-ask-ri-v2-pipeline.mjs';
import { scoreEvalCase } from '../lib/ri/eval/score-eval-case.mjs';
import {
  MOCK_ANTHROPIC_API_KEY,
  createMockAnthropicReasonerFetch,
} from '../lib/ri/reasoner/mock-anthropic-reasoner-fetch.mjs';
import { resolveFinalRegulatoryStatus } from '../lib/ri/reasoner/evidence-sufficiency-policy.mjs';

const THEME_MAP = [
  { theme: 'sufficient_evidence', testId: 'EVAL-B-01' },
  { theme: 'partial_evidence', testId: 'EVAL-C-03' },
  { theme: 'insufficient_evidence', testId: 'EVAL-B-03' },
  { theme: 'conflicting_regulations', testId: 'EVAL-C-02' },
  { theme: 'binding_rules_vs_guidance', testId: 'EVAL-D-02' },
  { theme: 'incorrect_unsupported_citations', testId: 'EVAL-C-04' },
  { theme: 'multiple_regulatory_sources', testId: 'EVAL-G-02' },
  { theme: 'unsupported_regulatory_conclusions', testId: 'EVAL-E-01' },
  { theme: 'correct_abstention', testId: 'EVAL-H-01' },
  { theme: 'accurate_regulatory_interpretation', testId: 'EVAL-B-02' },
];

const failures = [];
const results = [];
const smeRequired = [];
const ok = (m) => console.log(`OK: ${m}`);

const suite = JSON.parse(readFileSync(EVAL_SUITE_V21_PATH, 'utf8'));
const caseById = new Map((suite.cases || []).map((c) => [c.testId, c]));
const index = await buildSemanticIndex(AUTHENTIC_CORPUS_B2_DIR);
const bm25Index = attachBm25ToIndex(index);

for (const { theme, testId } of THEME_MAP) {
  const caseRow = caseById.get(testId);
  if (!caseRow) {
    failures.push(`missing_case_${testId}`);
    continue;
  }

  const ideal = caseRow.expectedIdealResult || {};
  const retrieval = await scoreQuestionWithMethod(bm25Index, caseRow.question, caseRow, 0.28, 'hybrid');
  const ranked = retrieval.allRankedChunks || [];
  const mockBundle = ranked.length ? assembleEvidenceBundle(bm25Index, ranked, {}) : null;

  let engineResult;
  if (mockBundle) {
    const mockFetch = createMockAnthropicReasonerFetch(mockBundle);
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
    engineResult = await runAskRiV2Pipeline(bm25Index, caseRow.question, caseRow, { dryRun: true });
  }

  const scored = scoreEvalCase(caseRow, engineResult, { simulateCatalogueAttach: false, evidenceAvailable: true });
  const sufficiency = engineResult.sufficiency || null;
  const policy = resolveFinalRegulatoryStatus({
    responseState: engineResult.status,
    sufficiencyOverall: sufficiency?.overall || sufficiency?.classification || null,
    verifiedClaimCount: engineResult.claimClassifications?.length ?? engineResult.citations?.length ?? 0,
    unresolvedAspects: engineResult.unresolvedAspects || [],
    questionCoverage: sufficiency?.questionCoverage || 'UNKNOWN',
    regulatoryIndexAbsent: Boolean(engineResult.preReasonerBlock),
  });
  const finalStatus = policy?.status || engineResult.status;

  const expectedState = ideal.responseState || ideal.outcomeClassification || caseRow.expectedResultClassification;
  const structuralMismatch =
    expectedState && finalStatus && String(finalStatus) !== String(expectedState) && expectedState !== 'PARTIAL_PASS';

  const row = {
    theme,
    testId,
    mockProvider: Boolean(mockBundle),
    expectedIdealResult: ideal,
    expectedResultClassification: caseRow.expectedResultClassification || null,
    actual: {
      status: finalStatus,
      v2ExecutionStatus: engineResult.v2ExecutionStatus,
      outcome: scored.outcome,
      citationCount: engineResult.citations?.length ?? 0,
      sufficiency: sufficiency?.classification || sufficiency?.overall || null,
      providerInvoked: Boolean(engineResult.providerInvoked),
    },
    structuralMismatch,
    regulatoryAccuracyVerified: false,
    smeReviewRequired:
      caseRow.reviewStatus === 'AWAITING_SME_REVIEW' ||
      caseRow.requiredHumanReviewStatus === 'HUMAN_REVIEW_REQUIRED' ||
      ideal.requiresEvidenceGroundedAnswer === true,
  };
  results.push(row);

  if (row.smeReviewRequired) {
    smeRequired.push({
      testId,
      theme,
      reviewStatus: caseRow.reviewStatus,
      referenceReviewStatus: caseRow.referenceReviewStatus,
      reason: 'expectedIdealResult and regulatory substance require SME — mock cannot satisfy',
    });
  }

  ok(`${theme} (${testId}): status=${finalStatus} outcome=${scored.outcome} mock=${row.mockProvider}`);
}

const outPath = join(REPO_ROOT, 'docs/eval/runs/stage-c-d-mocked-reasoning-themes-latest.json');
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(
  outPath,
  JSON.stringify(
    {
      schemaVersion: 'forgeniq.eval.stage-c-d-mocked-themes.v1',
      capturedAt: new Date().toISOString(),
      programmePass: false,
      regulatoryAccuracyPass: false,
      mockProviderOnly: true,
      results,
      smeReviewRequired: smeRequired,
      structuralMismatches: results.filter((r) => r.structuralMismatch).map((r) => ({ testId: r.testId, theme: r.theme })),
      failures,
    },
    null,
    2,
  ),
);

console.log(
  JSON.stringify(
    {
      ok: failures.length === 0,
      programmePass: false,
      themeCount: results.length,
      smeCases: smeRequired.length,
      structuralMismatches: results.filter((r) => r.structuralMismatch).length,
      output: 'docs/eval/runs/stage-c-d-mocked-reasoning-themes-latest.json',
      failures,
    },
    null,
    2,
  ),
);
process.exit(failures.length ? 1 : 0);