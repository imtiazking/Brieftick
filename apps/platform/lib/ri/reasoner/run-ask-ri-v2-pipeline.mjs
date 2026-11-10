/**
 * Ask RI V2 grounded reasoner pipeline (Phase 2C.2 prototype).
 */
import { attachBm25ToIndex, scoreQuestionWithMethod } from '../semantic/offline-retrieval-methods.mjs';
import { classifyQuestionEligibility } from './public-question-eligibility.mjs';
import { assembleEvidenceBundle } from './evidence-assembler.mjs';
import { invokeAnthropicReasoner } from './invoke-anthropic-reasoner.mjs';
import { verifyReasonerClaims } from './verify-claims.mjs';
import { renderVerifiedAskRiV2Answer } from './render-verified-answer.mjs';
import { buildEmptyReasonerOutput } from './reasoner-output-schema.mjs';
import { estimatePromptCostUsd, resolveV2EvalModel } from './anthropic-eval-budget.mjs';
import { buildReasonerUserPrompt } from './build-reasoner-prompt.mjs';

const DEFAULT_THRESHOLD = 0.28;

export async function runAskRiV2Pipeline(indexRaw, question, caseRow, options = {}) {
  const index = options.bm25Attached ? indexRaw : attachBm25ToIndex(indexRaw);
  const eligibility = classifyQuestionEligibility({ ...caseRow, question });
  const modelId = options.model || resolveV2EvalModel();
  const t0 = Date.now();

  if (!eligibility.eligible) {
    const blockedExpected =
      eligibility.classification === 'TENANT_CONTEXT_REQUIRED' ||
      caseRow?.tenantDataRequired === true ||
      caseRow?.questionCategory === 'F';
    return {
      question,
      testId: caseRow?.testId,
      v2ExecutionStatus: blockedExpected ? 'BLOCKED_EXPECTED' : 'BLOCKED_UNEXPECTED',
      eligibility,
      providerInvoked: false,
      status: 'BLOCKED',
      answer: `This question is not eligible for public-catalogue AI reasoning (${eligibility.classification}: ${eligibility.reason}).`,
      citations: [],
      execution: { engine: 'ask_ri_v2', providerUsed: false, model: modelId },
      timingMs: Date.now() - t0,
    };
  }

  const retrieval = await scoreQuestionWithMethod(index, question, caseRow, options.provisionalThreshold ?? DEFAULT_THRESHOLD, 'hybrid');

  if (retrieval.authorityGate?.blockSemanticSelection) {
    return {
      question,
      testId: caseRow?.testId,
      v2ExecutionStatus: 'PUBLIC_ELIGIBLE_EXECUTED',
      eligibility,
      retrieval,
      providerInvoked: false,
      preReasonerBlock: 'authority_gate',
      preReasonerDetail: {
        outcome: retrieval.authorityGate.outcome,
        abstainReason: retrieval.authorityGate.abstainReason,
        blocking: retrieval.authorityGate.blocking,
      },
      status: 'BLOCKED',
      answer: 'The question triggered an authority recognition gate and cannot proceed to retrieval in this mode.',
      citations: [],
      execution: { engine: 'ask_ri_v2', providerUsed: false, model: modelId },
      timingMs: Date.now() - t0,
    };
  }

  if (retrieval.referenceValidation?.blockSemanticSelection) {
    const rv = retrieval.referenceValidation;
    return {
      question,
      testId: caseRow?.testId,
      v2ExecutionStatus: 'PUBLIC_ELIGIBLE_EXECUTED',
      eligibility,
      retrieval,
      providerInvoked: false,
      preReasonerBlock: 'reference_validation',
      preReasonerDetail: {
        outcome: rv.outcome,
        abstainReason: rv.abstainReason,
        blockingCondition: rv.blockingCondition,
        parsedTokens: rv.parsedTokens,
      },
      status: 'BLOCKED',
      answer:
        rv.userMessage ||
        'The question references a publication identifier that is not valid in the authorised offline corpus.',
      citations: [],
      execution: { engine: 'ask_ri_v2', providerUsed: false, model: modelId },
      timingMs: Date.now() - t0,
    };
  }

  const ranked = retrieval.allRankedChunks || [];
  const bundle = assembleEvidenceBundle(index, ranked, options.evidenceBudget || {});

  if (!bundle.evidenceChunks.length) {
    return {
      question,
      testId: caseRow?.testId,
      v2ExecutionStatus: 'PUBLIC_ELIGIBLE_EXECUTED',
      eligibility,
      retrieval,
      providerInvoked: false,
      status: 'INSUFFICIENT_EVIDENCE',
      answer: 'No eligible evidence chunks were assembled for this question.',
      citations: [],
      sufficiency: 'NO_SUPPORT',
      execution: { engine: 'ask_ri_v2', providerUsed: false, model: modelId },
      timingMs: Date.now() - t0,
    };
  }

  const spend = options.spendTracker;
  if (spend) {
    const est = estimatePromptCostUsd(modelId, buildReasonerUserPrompt(question, bundle).length);
    if (!spend.reserveEstimate(est)) {
      return {
        question,
        testId: caseRow?.testId,
        v2ExecutionStatus: 'NOT_RUN',
        eligibility,
        retrieval,
        providerInvoked: false,
        status: 'BLOCKED',
        answer: 'Evaluation stopped: Anthropic spending ceiling would be exceeded.',
        citations: [],
        execution: { engine: 'ask_ri_v2', providerUsed: false, model: modelId, budget: spend.toJSON() },
        timingMs: Date.now() - t0,
      };
    }
  }

  if (options.dryRun) {
    return {
      question,
      testId: caseRow?.testId,
      v2ExecutionStatus: 'NOT_RUN',
      eligibility,
      retrieval,
      evidenceBundle: { chunkIds: bundle.evidenceChunks.map((c) => c.evidenceChunkId) },
      providerInvoked: false,
      status: 'NOT_RUN',
      execution: { engine: 'ask_ri_v2', providerUsed: false, model: modelId },
      timingMs: Date.now() - t0,
    };
  }

  const reasoner = await invokeAnthropicReasoner(question, bundle, { model: modelId, ...options.providerDeps });
  if (!reasoner.ok) {
    return {
      question,
      testId: caseRow?.testId,
      v2ExecutionStatus: 'PROVIDER_ERROR',
      eligibility,
      retrieval,
      evidenceBundle: { chunkIds: bundle.evidenceChunks.map((c) => c.evidenceChunkId) },
      providerInvoked: true,
      providerError: { code: reasoner.code, message: reasoner.message },
      status: 'FAILED',
      answer: 'The AI reasoner could not complete this request.',
      citations: [],
      execution: {
        engine: 'ask_ri_v2',
        providerUsed: true,
        model: reasoner.model || modelId,
        usage: reasoner.usage,
      },
      timingMs: Date.now() - t0,
    };
  }

  if (spend && reasoner.usage) {
    spend.recordUsage(reasoner.usage);
  }

  let modelOutput = reasoner.modelOutput;
  const verification = verifyReasonerClaims(modelOutput, bundle);
  if (!verification.ok && verification.mandatoryFailed) {
    modelOutput = {
      ...buildEmptyReasonerOutput(),
      responseState: 'VERIFICATION_FAILED',
      sufficiencyAssessment: modelOutput.sufficiencyAssessment,
      uncertaintyNotes: [`Verification failures: ${verification.failures.map((f) => f.check).join(', ')}`],
    };
  }

  const rendered = renderVerifiedAskRiV2Answer(verification, modelOutput, bundle);
  const v2Status = verification.ok ? 'PUBLIC_ELIGIBLE_EXECUTED' : 'VERIFICATION_FAILED';

  return {
    question,
    testId: caseRow?.testId,
    v2ExecutionStatus: v2Status,
    eligibility,
    retrieval: {
      method: retrieval.retrievalMethod,
      publicationSelected: retrieval.publicationSelected,
      rankedPublications: retrieval.rankedPublications,
      noMatchDecision: retrieval.noMatchDecision,
    },
    evidenceBundle: {
      chunkIds: bundle.evidenceChunks.map((c) => c.evidenceChunkId),
      publicationsRepresented: bundle.publicationsRepresented,
      excludedCount: bundle.excludedChunks.length,
      charsUsed: bundle.charsUsed,
    },
    providerInvoked: true,
    modelOutput: verification.ok ? modelOutput : { responseState: modelOutput.responseState, claims: [] },
    verification,
    sufficiency: modelOutput.sufficiencyAssessment?.overall,
    claimClassifications: (modelOutput.claims || []).map((c) => c.classification),
    humanReviewRequired: modelOutput.humanReviewRequired,
    status: rendered.status,
    answer: rendered.answer,
    citations: rendered.citations,
    execution: {
      engine: 'ask_ri_v2',
      providerUsed: true,
      model: reasoner.model,
      requestId: reasoner.requestId,
      usage: reasoner.usage,
      latencyMs: reasoner.latencyMs,
    },
    timingMs: Date.now() - t0,
  };
}
