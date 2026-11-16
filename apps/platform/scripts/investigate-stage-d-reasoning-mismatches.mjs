#!/usr/bin/env node
/**
 * Root-cause investigation for Stage D/C mocked reasoning mismatches (no live Anthropic).
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AUTHENTIC_CORPUS_B2_DIR, EVAL_SUITE_V21_PATH, REPO_ROOT } from '../lib/ri/eval/eval-paths.mjs';
import { buildSemanticIndex } from '../lib/ri/semantic/semantic-retrieval-eval.mjs';
import { attachBm25ToIndex, scoreQuestionWithMethod } from '../lib/ri/semantic/offline-retrieval-methods.mjs';
import { assembleEvidenceBundle } from '../lib/ri/reasoner/evidence-assembler.mjs';
import { runAskRiV2Pipeline } from '../lib/ri/reasoner/run-ask-ri-v2-pipeline.mjs';
import {
  MOCK_ANTHROPIC_API_KEY,
  createMockAnthropicReasonerFetch,
} from '../lib/ri/reasoner/mock-anthropic-reasoner-fetch.mjs';
import { resolveFinalRegulatoryStatus } from '../lib/ri/reasoner/evidence-sufficiency-policy.mjs';

const THEMES = [
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

function classifyMismatchRootCause(entry) {
  if (entry.preReasonerBlock || entry.actualEngineStatus === 'BLOCKED') {
    return { class: 'A', category: 'Correct abstention / block — missing or invalid source fixture', corrective: 'Keep expectation; validate pre-reasoner gate' };
  }
  if (entry.policyReason === 'UNKNOWN_COVERAGE_NO_INVENTED_GAPS' || entry.policyReason === 'UNKNOWN_COVERAGE_UNVERIFIED') {
    return {
      class: 'B',
      category: 'Incorrect abstention despite verified mock claims — fail-closed questionCoverage UNKNOWN',
      corrective: 'Eval harness: set bundle.questionCoverage KNOWN when retrieval hits; or SME live eval',
    };
  }
  if (entry.expectedIdeal === 'ANSWERED' && entry.scoredOutcome === 'FAIL') {
    return { class: 'E', category: 'Policy enforcement vs substantive ideal — not mock content accuracy', corrective: 'Use evidence-grounded scenarios; SME for substance' };
  }
  return { class: 'A', category: 'Harness limits — mock does not encode regulatory substance', corrective: 'Evidence-grounded scenarios + SME' };
}

const suite = JSON.parse(readFileSync(EVAL_SUITE_V21_PATH, 'utf8'));
const caseById = new Map((suite.cases || []).map((c) => [c.testId, c]));
const index = await buildSemanticIndex(AUTHENTIC_CORPUS_B2_DIR);
const bm25Index = attachBm25ToIndex(index);

const investigations = [];

for (const { theme, testId } of THEMES) {
  const caseRow = caseById.get(testId);
  const ideal = caseRow?.expectedIdealResult || {};
  const expectedIdeal = ideal.responseState || ideal.outcomeClassification || caseRow?.expectedResultClassification;

  const retrieval = await scoreQuestionWithMethod(bm25Index, caseRow.question, caseRow, 0.28, 'hybrid');
  const ranked = retrieval.allRankedChunks || [];
  const bundleDefault = ranked.length ? assembleEvidenceBundle(bm25Index, ranked, {}) : null;
  const bundleKnown = ranked.length ? assembleEvidenceBundle(bm25Index, ranked, { questionCoverage: 'KNOWN' }) : null;

  let engineResult = null;
  if (ranked.length) {
    const mockFetch = createMockAnthropicReasonerFetch(assembleEvidenceBundle(bm25Index, ranked, {}));
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

  const verified = engineResult.verification?.verifiedClaims?.length ?? 0;
  const policyDefault = engineResult.stageC?.policyReason || null;

  const entry = {
    theme,
    testId,
    question: caseRow?.question,
    expectedIdealResult: ideal,
    expectedIdeal,
    actualMockedStatus: engineResult.status,
    scoredOutcome: engineResult.outcome ?? null,
    policyReason: policyDefault,
    evidenceSupplied: {
      rankedChunks: ranked.length,
      bundleChunks: bundleDefault?.evidenceChunks?.length ?? 0,
      publicationsRepresented: bundleDefault?.publicationsRepresented || [],
      expectedPublicationIds: caseRow?.expectedPublicationIds || [],
      corpusSourceAvailable: (caseRow?.evidenceAvailability || '') !== 'NOT_IN_SUITE',
    },
    sufficiencyMock: engineResult.sufficiency || engineResult.modelOutput?.sufficiencyAssessment?.overall || null,
    sufficiencyPolicyApplied: Boolean(engineResult.stageC?.applied),
    questionCoverageInBundle: bundleDefault?.questionCoverage || 'UNKNOWN',
    questionCoverageKnownWouldApply: bundleKnown?.questionCoverage,
    verifiedClaimCount: verified,
    citationCount: engineResult.citations?.length ?? 0,
    preReasonerBlock: engineResult.preReasonerBlock || null,
    mismatchVsIdeal: expectedIdeal && String(engineResult.status) !== String(expectedIdeal),
  };

  const policyIfKnown =
    ranked.length && engineResult.modelOutput
      ? resolveFinalRegulatoryStatus({
          responseState: engineResult.modelOutput.responseState,
          sufficiencyOverall: engineResult.modelOutput.sufficiencyAssessment?.overall,
          verifiedClaimCount: verified,
          unresolvedAspects: engineResult.modelOutput.unresolvedAspects || [],
          questionCoverage: 'KNOWN',
        })
      : null;
  entry.counterfactualWithKnownCoverage = policyIfKnown
    ? { status: policyIfKnown.status, reason: policyIfKnown.reason }
    : null;

  const root = classifyMismatchRootCause({
    ...entry,
    actualEngineStatus: engineResult.status,
    expectedIdeal,
  });
  entry.mismatchClass = root.class;
  entry.rootCauseCategory = root.category;
  entry.recommendedCorrectiveAction = root.corrective;

  investigations.push(entry);
}

const outPath = join(REPO_ROOT, 'docs/eval/STAGE-D-REASONING-MISMATCH-ROOT-CAUSE.json');
mkdirSync(dirname(outPath), { recursive: true });
const doc = {
  schemaVersion: 'forgeniq.eval.reasoning-mismatch-investigation.v1',
  capturedAt: new Date().toISOString(),
  baselineCommit: 'a6e8e18eb48449f718b716f4c5f0236df4a4b9d7',
  programmePass: false,
  regulatoryAccuracyPass: false,
  primaryRootCause:
    'Stage C fail-closed policy with bundle.questionCoverage UNKNOWN suppresses ANSWERED despite mock DIRECT_SUPPORT and verified claims (UNKNOWN_COVERAGE_NO_INVENTED_GAPS).',
  secondaryRootCause: 'Prior acceptance compared ideal outcomeClassification to policy status without KNOWN coverage or outcome-taxonomy mapping.',
  investigations,
};
writeFileSync(outPath, JSON.stringify(doc, null, 2));
console.log(JSON.stringify({ ok: true, outPath, count: investigations.length }, null, 2));