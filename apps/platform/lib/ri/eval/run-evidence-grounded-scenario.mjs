/**
 * Run one eval case under a controlled evidence scenario (offline mock, authentic corpus).
 */
import { attachBm25ToIndex, scoreQuestionWithMethod } from '../semantic/offline-retrieval-methods.mjs';
import { assembleEvidenceBundle } from '../reasoner/evidence-assembler.mjs';
import { runAskRiV2Pipeline } from '../reasoner/run-ask-ri-v2-pipeline.mjs';
import { resolveFinalRegulatoryStatus } from '../reasoner/evidence-sufficiency-policy.mjs';
import { createScenarioMockFetch } from './mock-reasoner-scenarios.mjs';
import { MOCK_ANTHROPIC_API_KEY } from '../reasoner/mock-anthropic-reasoner-fetch.mjs';

/** @typedef {'SUFFICIENT' | 'PARTIAL' | 'INSUFFICIENT'} EvidenceScenario */

const SCENARIO_EXPECTED_STATUS = {
  SUFFICIENT: 'ANSWERED',
  PARTIAL: 'PARTIAL_ANSWER',
  INSUFFICIENT: 'INSUFFICIENT_EVIDENCE',
};

/**
 * @param {object} index
 * @param {object} caseRow
 * @param {EvidenceScenario} scenario
 */
export async function runEvidenceGroundedScenario(index, caseRow, scenario) {
  const bm25Index = attachBm25ToIndex(index);
  const retrieval = await scoreQuestionWithMethod(bm25Index, caseRow.question, caseRow, 0.28, 'hybrid');
  const ranked = retrieval.allRankedChunks || [];

  let bundle = null;
  if (scenario === 'INSUFFICIENT') {
    bundle = ranked.length
      ? assembleEvidenceBundle(bm25Index, ranked.slice(0, 1), { questionCoverage: 'UNKNOWN' })
      : null;
  } else {
    bundle = ranked.length
      ? assembleEvidenceBundle(bm25Index, ranked, { questionCoverage: 'KNOWN' })
      : null;
  }

  const noChunks = !bundle?.evidenceChunks?.length;
  if (noChunks && scenario !== 'INSUFFICIENT') {
    return {
      testId: caseRow.testId,
      scenario,
      blocked: true,
      blockReason: 'no_ranked_chunks',
      expectedStatus: SCENARIO_EXPECTED_STATUS[scenario],
    };
  }

  if (scenario === 'INSUFFICIENT' && noChunks) {
    const engineResult = await runAskRiV2Pipeline(bm25Index, caseRow.question, caseRow, {
      dryRun: false,
      bm25Attached: true,
    });
    return {
      testId: caseRow.testId,
      scenario,
      expectedStatus: SCENARIO_EXPECTED_STATUS.INSUFFICIENT,
      actualStatus: engineResult.status,
      policyReason: 'NO_CHUNKS',
      policyAppliedCorrectly: engineResult.status === 'INSUFFICIENT_EVIDENCE',
      evidenceChunks: 0,
      citationCount: 0,
      questionCoverage: 'UNKNOWN',
    };
  }

  const mockFetch = createScenarioMockFetch(bundle, scenario);

  const engineResult = await runAskRiV2Pipeline(bm25Index, caseRow.question, caseRow, {
    dryRun: false,
    bm25Attached: true,
    evidenceBudget: scenario === 'INSUFFICIENT' ? { questionCoverage: 'UNKNOWN' } : { questionCoverage: 'KNOWN' },
    providerDeps: {
      skipExecutionGuard: true,
      apiKeyOverride: MOCK_ANTHROPIC_API_KEY,
      fetchFn: mockFetch,
    },
  });

  if (engineResult.preReasonerBlock || engineResult.status === 'BLOCKED') {
    return {
      testId: caseRow.testId,
      scenario,
      blocked: true,
      blockReason: engineResult.preReasonerBlock || 'blocked',
      expectedStatus: SCENARIO_EXPECTED_STATUS[scenario],
      actualStatus: engineResult.status,
    };
  }

  const sufficiencyOverall = engineResult.sufficiency || engineResult.modelOutput?.sufficiencyAssessment?.overall;
  const policy = resolveFinalRegulatoryStatus({
    responseState: engineResult.modelOutput?.responseState || engineResult.status,
    sufficiencyOverall,
    verifiedClaimCount: engineResult.verification?.verifiedClaims?.length ?? engineResult.citations?.length ?? 0,
    failedClaimCount: engineResult.verification?.failedClaims?.length ?? 0,
    unresolvedAspects: engineResult.modelOutput?.unresolvedAspects || [],
    questionCoverage: scenario === 'INSUFFICIENT' ? 'UNKNOWN' : 'KNOWN',
    regulatoryIndexAbsent: false,
  });

  const actualStatus = typeof engineResult.status === 'string' ? engineResult.status : policy.status;
  const expectedStatus = SCENARIO_EXPECTED_STATUS[scenario];

  return {
    testId: caseRow.testId,
    scenario,
    expectedStatus,
    actualStatus,
    policyReason: policy.reason,
    policyAppliedCorrectly: actualStatus === expectedStatus,
    evidenceChunks: engineResult.evidenceBundle?.chunkIds?.length ?? 0,
    citationCount: engineResult.citations?.length ?? 0,
    chunkPublicationIds: bundle?.publicationsRepresented || [],
    verifiedClaims: engineResult.verification?.verifiedClaims?.length ?? 0,
    sufficiencyOverall,
    questionCoverage: scenario === 'INSUFFICIENT' ? 'UNKNOWN' : 'KNOWN',
  };
}