/**
 * Run controlled scenario through full V2 pipeline — coverage from assess-evidence-question-coverage only.
 */
import { attachBm25ToIndex, scoreQuestionWithMethod } from '../semantic/offline-retrieval-methods.mjs';
import { runAskRiV2Pipeline } from '../reasoner/run-ask-ri-v2-pipeline.mjs';
import { createScenarioMockFetch } from './mock-reasoner-scenarios.mjs';
import { assembleEvidenceBundle } from '../reasoner/evidence-assembler.mjs';
import { MOCK_ANTHROPIC_API_KEY } from '../reasoner/mock-anthropic-reasoner-fetch.mjs';
import { scoreEvalCase } from './score-eval-case.mjs';
import { classifyEvalLayers } from './eval-outcome-taxonomy.mjs';

/** @typedef {'SUFFICIENT' | 'PARTIAL' | 'INSUFFICIENT'} EvidenceScenario */

/**
 * @param {object} index
 * @param {object} caseRow
 * @param {EvidenceScenario} scenario
 */
export async function runEvidenceGroundedScenario(index, caseRow, scenario) {
  const bm25Index = attachBm25ToIndex(index);
  const retrieval = await scoreQuestionWithMethod(bm25Index, caseRow.question, caseRow, 0.28, 'hybrid');
  const ranked = retrieval.allRankedChunks || [];

  let mockBundle = null;
  if (scenario === 'INSUFFICIENT' && ranked.length) {
    mockBundle = assembleEvidenceBundle(bm25Index, ranked.slice(0, 1), {});
  } else if (ranked.length) {
    mockBundle = assembleEvidenceBundle(bm25Index, ranked, {});
  }

  const mockFetch = mockBundle ? createScenarioMockFetch(mockBundle, scenario) : null;

  const engineResult = await runAskRiV2Pipeline(bm25Index, caseRow.question, caseRow, {
    dryRun: scenario === 'INSUFFICIENT' && !mockFetch,
    bm25Attached: true,
    providerDeps: mockFetch
      ? {
          skipExecutionGuard: true,
          apiKeyOverride: MOCK_ANTHROPIC_API_KEY,
          fetchFn: mockFetch,
        }
      : undefined,
  });

  const scored = scoreEvalCase(caseRow, engineResult, { simulateCatalogueAttach: false, evidenceAvailable: true });
  const layers = classifyEvalLayers(engineResult, scored);

  const evidenceCondition =
    caseRow?.testId === 'EVAL-B-03'
      ? 'MISSING_PRIMARY_HANDBOOK_NOT_GENUINE_PARTIAL'
      : scenario === 'PARTIAL'
        ? 'CONTROLLED_MOCK_PARTIAL'
        : scenario;

  return {
    testId: caseRow.testId,
    scenario,
    evidenceCondition,
    evidenceLimitationCode: engineResult.stageC?.evidenceLimitationCode,
    applicationPolicyStatus: engineResult.status,
    policyReason: engineResult.stageC?.policyReason,
    questionCoverage: engineResult.coverageAssessment?.questionCoverage || engineResult.evidenceBundle?.questionCoverage,
    coverageCompleteness: engineResult.coverageAssessment?.completeness,
    coverageReasons: engineResult.coverageAssessment?.reasons || [],
    scorerOutcome: scored.outcome,
    evalLayers: layers,
    citationCount: engineResult.citations?.length ?? 0,
    blocked: engineResult.status === 'BLOCKED' || Boolean(engineResult.preReasonerBlock),
    blockReason: engineResult.preReasonerBlock || null,
  };
}