import { AI_TASK_TYPE, AI_REVIEW_STATUS, AI_AUDIT_EVENT_TYPE } from './enums.js';
import { retrieveRiRecords, selectionFromRetrieval, parseAskQuery, computeDeterministicFacts } from './ri-retrieval.js';
import { ASK_RI_RESULT_STATES } from './ri-query-executor.js';
import { SUPPORTED_QUESTION_EXAMPLES } from './ri-interpreted-as.js';
import { deterministicTextDiff, FIXTURE_PS24_OLD, FIXTURE_PS24_NEW } from './text-diff.js';
import { runFixtureAiAnalysis, persistAiAnalysis, updateReviewStatus } from './analysis-service.js';
import { appendAiDomainAuditEvent } from './audit.js';
import { canAskRi, canApproveExecutiveSummary, isAuditorReadOnly } from './persona-ai.js';
import { markAnalysesOutdatedForRecord } from './freshness.js';

let providerCallCount = 0;

export function getLastProviderCallCount() {
  return providerCallCount;
}

export function resetProviderCallCount() {
  providerCallCount = 0;
}

function pushAskHistory(state, entry) {
  if (!state.riAskHistory) state.riAskHistory = [];
  state.riAskHistory.unshift(entry);
  if (state.riAskHistory.length > 30) state.riAskHistory.length = 30;
}

export async function askRi(state, question, options = {}) {
  resetProviderCallCount();
  if (!canAskRi(state)) return { ok: false, code: 'FORBIDDEN' };
  const parsed = parseAskQuery(question, state);
  const retrieval = retrieveRiRecords(state, question, { ...options, parsed });
  appendAiDomainAuditEvent(state, {
    type: AI_AUDIT_EVENT_TYPE.AI_RI_QUERY_REQUESTED,
    query: question,
    retrievalIds: retrieval.matchedRecordIds,
    actor: state.currentDemoUserId,
  });

  if (retrieval.resultState === ASK_RI_RESULT_STATES.UNRESOLVED_QUERY_SEMANTICS) {
    const unresolved = {
      analysisId: null,
      status: 'UNRESOLVED_QUERY_SEMANTICS',
      message: "I couldn't safely interpret this question.",
      examples: SUPPORTED_QUESTION_EXAMPLES,
      retrieval,
      providerCallCount: 0,
    };
    pushAskHistory(state, { question, retrieval, unresolved: true, at: new Date().toISOString() });
    return { ok: true, unresolved: true, ...unresolved };
  }

  if (retrieval.resultState === ASK_RI_RESULT_STATES.INSUFFICIENT_EVIDENCE || (!retrieval.primaryAdequate && retrieval.insufficientReason)) {
    appendAiDomainAuditEvent(state, {
      type: AI_AUDIT_EVENT_TYPE.AI_RI_QUERY_INSUFFICIENT_EVIDENCE,
      query: question,
      actor: state.currentDemoUserId,
    });
    const insufficient = {
      analysisId: null,
      status: 'INSUFFICIENT_RI_EVIDENCE',
      message: retrieval.insufficientReason || 'No suitable verified RI records were found for this question.',
      retrieval,
      providerCallCount: 0,
    };
    pushAskHistory(state, { question, retrieval, insufficient: true, at: new Date().toISOString() });
    return { ok: true, insufficient: true, ...insufficient };
  }

  if (retrieval.resultState === ASK_RI_RESULT_STATES.ZERO_QUALIFIERS) {
    const zero = {
      analysisId: null,
      status: 'ZERO_QUALIFIERS',
      message: 'Zero qualifying records in the current RI dataset for this interpreted query.',
      retrieval,
      providerCallCount: 0,
    };
    pushAskHistory(state, { question, retrieval, zeroQualifiers: true, at: new Date().toISOString() });
    return { ok: true, zeroQualifiers: true, ...zero };
  }

  const selection = selectionFromRetrieval(retrieval);
  let scenario = options.fixtureScenario;
  if (!scenario) {
    if (parsed.filters.intent === 'count-open-obligations') scenario = 'ai-019-count-obligations';
    else if (retrieval.deterministicFacts?.predicateResult) scenario = 'ai-obligation-predicate';
    else if (parsed.filters.intent === 'reviewed-cross-source') scenario = 'ai-021-basel-ask';
    else if (parsed.filters?.compound) scenario = 'ai-006-compound-ask';
    else scenario = 'ai-006-deterministic-ask';
  }

  const reviewed = (state.internationalImplementationMappings || []).find((m) => m.reviewStatus === 'REVIEWED');
  providerCallCount += 1;
  const result = await runFixtureAiAnalysis(state, {
    taskType: AI_TASK_TYPE.AI_RI_QA,
    selection,
    fixtureScenario: scenario,
    contextExtras: { deterministicFacts: retrieval.deterministicFacts, retrieval, reviewedMapping: reviewed, state },
  });

  if (result.analysis) {
    result.analysis.retrieval = retrieval;
    result.analysis.workflowPayload = result.analysis.originalAiOutput;
    result.analysis.entityType = 'AskRi';
    result.analysis.entityId = question.slice(0, 80);
    if (result.persistable) persistAiAnalysis(state, result.analysis);
    appendAiDomainAuditEvent(state, {
      type: AI_AUDIT_EVENT_TYPE.AI_RI_QUERY_COMPLETED,
      analysisId: result.analysis.analysisId,
      query: question,
      contextHash: result.analysis.contextHash,
      promptVersion: result.analysis.promptVersion,
      actor: state.currentDemoUserId,
    });
    pushAskHistory(state, {
      question,
      retrieval,
      analysisId: result.analysis.analysisId,
      contextHash: result.analysis.contextHash,
      at: new Date().toISOString(),
    });
  }
  return { ...result, retrieval, providerCallCount };
}

export async function compareRegulatoryText(state, compareKey = 'FIXTURE-PS24', options = {}) {
  if (!canAskRi(state)) return { ok: false, code: 'FORBIDDEN' };
  const deterministicDiff = deterministicTextDiff(FIXTURE_PS24_OLD, FIXTURE_PS24_NEW);
  const selection = [
    { category: 'OFFICIAL_SOURCE', recordId: 'FIXTURE-PS24' },
    { category: 'RI_RECORD', recordType: 'Publication', recordId: 'PUB-002' },
  ];
  providerCallCount += 1;
  const result = await runFixtureAiAnalysis(state, {
    taskType: AI_TASK_TYPE.AI_TEXT_COMPARISON,
    selection,
    fixtureScenario: options.fixtureScenario || 'ai-007-text-comparison',
    contextExtras: { deterministicDiff },
  });
  if (result.analysis) {
    result.analysis.deterministicDiff = deterministicDiff;
    result.analysis.workflowPayload = { ...result.analysis.originalAiOutput, deterministicDiff };
    result.analysis.compareKey = compareKey;
    if (result.persistable) persistAiAnalysis(state, result.analysis);
    appendAiDomainAuditEvent(state, {
      type: AI_AUDIT_EVENT_TYPE.AI_TEXT_COMPARISON_REQUESTED,
      analysisId: result.analysis.analysisId,
      contextHash: result.analysis.contextHash,
      actor: state.currentDemoUserId,
    });
  }
  return { ...result, deterministicDiff };
}

export async function analyzeImplementationMapping(state, options = {}) {
  if (!canAskRi(state)) return { ok: false, code: 'FORBIDDEN' };
  const retrieval = retrieveRiRecords(state, 'Basel PRA implementation', {
    fixtureScenario: 'ai-005-implementation-mapping',
  });
  const reviewed = (state.internationalImplementationMappings || []).find((m) => m.reviewStatus === 'REVIEWED');
  providerCallCount += 1;
  const result = await runFixtureAiAnalysis(state, {
    taskType: AI_TASK_TYPE.AI_IMPLEMENTATION_MAPPING,
    selection: selectionFromRetrieval(retrieval),
    fixtureScenario: 'ai-005-implementation-mapping',
    contextExtras: { reviewedMapping: reviewed, retrieval },
  });
  if (result.analysis) {
    result.analysis.reviewedMappingId = reviewed?.mappingId;
    result.analysis.workflowPayload = result.analysis.originalAiOutput;
    if (result.persistable) persistAiAnalysis(state, result.analysis);
    appendAiDomainAuditEvent(state, {
      type: AI_AUDIT_EVENT_TYPE.AI_IMPLEMENTATION_MAPPING_REQUESTED,
      analysisId: result.analysis.analysisId,
      actor: state.currentDemoUserId,
    });
  }
  return { ...result, reviewedMapping: reviewed, retrieval };
}

export async function generateExecutiveSummary(state, { period = '2026-Q3', board = false } = {}, options = {}) {
  if (!canAskRi(state)) return { ok: false, code: 'FORBIDDEN' };
  const deterministicFacts = computeDeterministicFacts(state, parseAskQuery('portfolio summary'));
  deterministicFacts.reportingPeriod = period;
  const selection = [
    { category: 'RI_RECORD', recordType: 'Change', recordId: 'CHG-001' },
    { category: 'RI_RECORD', recordType: 'Change', recordId: 'CHG-003' },
    { category: 'RI_RECORD', recordType: 'ImpactAssessment', recordId: 'IA-0031' },
  ];
  providerCallCount += 1;
  const result = await runFixtureAiAnalysis(state, {
    taskType: AI_TASK_TYPE.AI_EXECUTIVE_SUMMARY,
    selection,
    fixtureScenario: options.fixtureScenario || 'ai-022-board-summary',
    contextExtras: { deterministicFacts, reportingPeriod: period, board },
  });
  if (result.analysis) {
    result.analysis.reportingPeriod = period;
    result.analysis.summaryKind = board ? 'BOARD' : 'MANAGEMENT';
    result.analysis.reviewStatus = AI_REVIEW_STATUS.HUMAN_REVIEW_REQUIRED;
    result.analysis.workflowPayload = result.analysis.originalAiOutput;
    if (result.persistable) persistAiAnalysis(state, result.analysis);
    appendAiDomainAuditEvent(state, {
      type: AI_AUDIT_EVENT_TYPE.AI_EXECUTIVE_SUMMARY_REQUESTED,
      analysisId: result.analysis.analysisId,
      reportingPeriod: period,
      actor: state.currentDemoUserId,
    });
  }
  return { ...result, deterministicFacts };
}

export function acceptExecutiveSummaryReview(state, analysisId) {
  if (!canApproveExecutiveSummary(state)) return { ok: false, code: 'FORBIDDEN' };
  return updateReviewStatus(state, analysisId, AI_REVIEW_STATUS.ACCEPTED);
}

export function markAskRiOutdatedForChange(state, changeId) {
  markAnalysesOutdatedForRecord(state, 'Change', changeId);
  appendAiDomainAuditEvent(state, {
    type: AI_AUDIT_EVENT_TYPE.AI_RESULT_MARKED_OUTDATED,
    entityType: 'Change',
    entityId: changeId,
    actor: state.currentDemoUserId,
  });
}
