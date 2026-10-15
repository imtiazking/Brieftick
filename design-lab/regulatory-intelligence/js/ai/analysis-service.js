import {
  AI_ANALYSIS_STATUS,
  AI_REVIEW_STATUS,
  AI_FRESHNESS,
  AI_TASK_TYPE,
  CONTEXT_RECORD_CATEGORY,
} from './enums.js';
import { AiContextBuilder } from './context-builder.js';
import { getPromptMetadataForTask } from './prompt-metadata.js';
import { FixtureAiProvider } from './fixture-ai-provider.js';
import { AiOutputValidator } from './output-validator.js';
import { scoreEvidenceConfidence } from './evidence-confidence.js';
import { auditAnalysisRequested, auditAnalysisCompleted, auditValidationFailed } from './audit.js';
import { assertAnalysisSizeAllowed, pruneAiAnalyses } from './retention.js';
import { canMutateAiReviewState } from './persona-ai.js';

let analysisCounter = 1;

export function nextAnalysisId() {
  const id = `AIA-5A-${String(analysisCounter).padStart(4, '0')}`;
  analysisCounter += 1;
  return id;
}

export async function runFixtureAiAnalysis(state, options) {
  const {
    taskType = AI_TASK_TYPE.AI_SUMMARY,
    selection,
    fixtureScenario = 'ai-001-summary',
    actor = state.currentDemoUserId,
    provider = new FixtureAiProvider(),
    contextExtras = {},
  } = options;

  const builder = new AiContextBuilder(state);
  let contextBundle = await builder.build({ taskType, selection });
  if (!contextBundle.ok && contextExtras?.deterministicFacts?.predicateResult) {
    const promptMeta = getPromptMetadataForTask(taskType);
    if (promptMeta) {
      contextBundle = {
        ok: true,
        taskType,
        records: [],
        contextRecordIds: [],
        contextHash: 'predicate-deterministic-empty-selection',
        promptMetadata: promptMeta,
        truncated: false,
        totalChars: 0,
        canonicalPayload: { taskType, records: [] },
      };
    }
  }
  if (!contextBundle.ok) {
    return { ok: false, message: contextBundle.message };
  }
  Object.assign(contextBundle, contextExtras);

  const analysisId = nextAnalysisId();
  auditAnalysisRequested(state, {
    analysisId,
    taskType,
    providerMode: provider.mode,
    provider: provider.id,
    model: 'fixture-5a',
    promptVersion: contextBundle.promptMetadata.version,
    contextHash: contextBundle.contextHash,
    actor,
  });

  const providerResult = await provider.analyze({
    taskType,
    contextBundle,
    contextHash: contextBundle.contextHash,
    promptMetadata: contextBundle.promptMetadata,
    fixtureScenario,
  });

  if (!providerResult.ok) {
    const analysis = {
      analysisId,
      taskType,
      provider: providerResult.provider || provider.id,
      model: providerResult.model || null,
      createdAt: new Date().toISOString(),
      status: AI_ANALYSIS_STATUS.FAILED,
      reviewStatus: AI_REVIEW_STATUS.AI_DRAFT,
      freshness: AI_FRESHNESS.CURRENT,
      errorCode: providerResult.errorCode,
      errorMessage: providerResult.errorMessage,
      providerMode: providerResult.providerMode,
      contextHash: contextBundle.contextHash,
      contextRecordIds: contextBundle.contextRecordIds,
      promptId: contextBundle.promptMetadata.promptId,
      promptVersion: contextBundle.promptMetadata.version,
      promptHash: contextBundle.promptMetadata.contentHash,
      outputSchemaVersion: contextBundle.promptMetadata.outputSchemaVersion,
    };
    return { ok: false, analysis, persistable: false };
  }

  const validator = new AiOutputValidator({ state, contextBundle });
  const validated = validator.validateProviderOutput(taskType, providerResult.structured);
  if (!validated.ok) {
    auditValidationFailed(state, {
      analysisId,
      taskType,
      providerMode: providerResult.providerMode,
      provider: providerResult.provider,
      model: providerResult.model,
      promptVersion: contextBundle.promptMetadata.version,
      contextHash: contextBundle.contextHash,
      actor,
    });
    const analysis = {
      analysisId,
      taskType,
      provider: providerResult.provider,
      model: providerResult.model,
      createdAt: new Date().toISOString(),
      status: validated.status,
      reviewStatus: AI_REVIEW_STATUS.AI_DRAFT,
      freshness: AI_FRESHNESS.CURRENT,
      errorCode: validated.errorCode,
      errorMessage: validated.errorMessage,
      providerMode: providerResult.providerMode,
      contextHash: contextBundle.contextHash,
      contextRecordIds: contextBundle.contextRecordIds,
      promptId: contextBundle.promptMetadata.promptId,
      promptVersion: contextBundle.promptMetadata.version,
      promptHash: contextBundle.promptMetadata.contentHash,
      outputSchemaVersion: contextBundle.promptMetadata.outputSchemaVersion,
      originalAiOutput: providerResult.structured,
    };
    return { ok: false, analysis, persistable: false };
  }

  const structured = validated.output;
  const evidenceConfidence = scoreEvidenceConfidence({
    findings: structured.findings || structured.keyFindings || [],
    citations: structured.citations || [],
    contextRecordIds: contextBundle.contextRecordIds,
  });

  const analysis = {
    analysisId,
    taskType,
    provider: providerResult.provider,
    model: providerResult.model,
    createdAt: new Date().toISOString(),
    status: AI_ANALYSIS_STATUS.COMPLETED,
    reviewStatus: AI_REVIEW_STATUS.HUMAN_REVIEW_REQUIRED,
    freshness: AI_FRESHNESS.CURRENT,
    promptId: contextBundle.promptMetadata.promptId,
    promptVersion: contextBundle.promptMetadata.version,
    promptHash: contextBundle.promptMetadata.contentHash,
    outputSchemaVersion: contextBundle.promptMetadata.outputSchemaVersion,
    contextHash: contextBundle.contextHash,
    contextRecordIds: contextBundle.contextRecordIds,
    summary: structured.summary || structured.answer || structured.interpretationSummary,
    findings: structured.findings || [],
    uncertainties: structured.uncertainties || [],
    suggestions: structured.areasRequiringReview || structured.suggestions || [],
    citations: structured.citations || [],
    evidenceConfidence,
    modelReportedConfidence: structured.modelReportedConfidence ?? null,
    providerMode: providerResult.providerMode,
    originalAiOutput: structured,
    workflowPayload: structured,
    sections: {
      whatIsThis: structured.whatIsThis,
      whatChanged: structured.whatChanged,
      whoMayBeAffected: structured.whoMayBeAffected,
      keyDates: structured.keyDates,
      keyPoints: structured.keyPoints,
      areasRequiringReview: structured.areasRequiringReview,
      uncertainties: structured.uncertainties,
      sources: structured.sources,
    },
  };

  const sizeCheck = assertAnalysisSizeAllowed(analysis);
  if (!sizeCheck.ok) {
    return { ok: false, analysis, persistable: false, errorCode: sizeCheck.code };
  }

  auditAnalysisCompleted(state, {
    analysisId,
    taskType,
    providerMode: providerResult.providerMode,
    provider: providerResult.provider,
    model: providerResult.model,
    promptVersion: contextBundle.promptMetadata.version,
    contextHash: contextBundle.contextHash,
    actor,
  });

  return { ok: true, analysis, persistable: true };
}

export function persistAiAnalysis(state, analysis) {
  if (!state.riAiAnalysisResults) state.riAiAnalysisResults = [];
  state.riAiAnalysisResults.unshift(analysis);
  pruneAiAnalyses(state);
  return analysis;
}

export function updateReviewStatus(state, analysisId, reviewStatus, userId) {
  if (!canMutateAiReviewState(state, userId)) {
    return { ok: false, code: 'FORBIDDEN' };
  }
  const row = state.riAiAnalysisResults?.find((a) => a.analysisId === analysisId);
  if (!row) return { ok: false, code: 'NOT_FOUND' };
  row.reviewStatus = reviewStatus;
  row.reviewedBy = userId;
  row.reviewedAt = new Date().toISOString();
  return { ok: true, analysis: row };
}

export function defaultPub001Selection() {
  return [{ category: CONTEXT_RECORD_CATEGORY.RI_RECORD, recordType: 'Publication', recordId: 'PUB-001' }];
}
