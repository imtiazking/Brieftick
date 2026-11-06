import { AI_TASK_TYPE, AI_REVIEW_STATUS, AI_AUDIT_EVENT_TYPE, CONTEXT_RECORD_CATEGORY } from './enums.js';
import { AiContextBuilder } from './context-builder.js';
import { runFixtureAiAnalysis, persistAiAnalysis, updateReviewStatus } from './analysis-service.js';
import { appendAiDomainAuditEvent } from './audit.js';
import { canCreateAiWorkflowDrafts, canMutateAiReviewState, isAuditorReadOnly } from './persona-ai.js';
let changeSeq = 900;
let iaSeq = 900;
let oblSeq = 900;

function nextChangeId() {
  changeSeq += 1;
  return `CHG-AI-${changeSeq}`;
}

function nextIaId() {
  iaSeq += 1;
  return `IA-AI-${iaSeq}`;
}

function nextOblId() {
  oblSeq += 1;
  return `OBL-AI-${oblSeq}`;
}

function pushTrace(state, entry) {
  if (!state.riAiWorkflowTraces) state.riAiWorkflowTraces = [];
  state.riAiWorkflowTraces.unshift({
    traceId: `TRC-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    ...entry,
    createdAt: new Date().toISOString(),
  });
}

export function selectionForPublication(publicationId) {
  return [{ category: CONTEXT_RECORD_CATEGORY.RI_RECORD, recordType: 'Publication', recordId: publicationId }];
}

export function selectionForChange(state, changeId) {
  const ch = state.changes.find((c) => c.id === changeId);
  const items = [{ category: CONTEXT_RECORD_CATEGORY.RI_RECORD, recordType: 'Change', recordId: changeId }];
  if (ch?.publicationId) items.push({ category: CONTEXT_RECORD_CATEGORY.RI_RECORD, recordType: 'Publication', recordId: ch.publicationId });
  return items;
}

export function selectionForAssessment(state, assessmentId) {
  const ia = state.assessments.find((a) => a.id === assessmentId);
  const items = [{ category: CONTEXT_RECORD_CATEGORY.RI_RECORD, recordType: 'ImpactAssessment', recordId: assessmentId }];
  if (ia?.changeId) items.push({ category: CONTEXT_RECORD_CATEGORY.RI_RECORD, recordType: 'Change', recordId: ia.changeId });
  if (ia?.publicationId) items.push({ category: CONTEXT_RECORD_CATEGORY.RI_RECORD, recordType: 'Publication', recordId: ia.publicationId });
  return items;
}

export async function generateChangeAnalysis(state, publicationId, { fixtureScenario = 'ai-002-change-analysis' } = {}) {
  if (!canCreateAiWorkflowDrafts(state)) return { ok: false, code: 'FORBIDDEN' };
  const result = await runFixtureAiAnalysis(state, {
    taskType: AI_TASK_TYPE.AI_CHANGE_ANALYSIS,
    selection: selectionForPublication(publicationId),
    fixtureScenario,
  });
  if (!result.persistable) return result;
  const analysis = { ...result.analysis, entityType: 'Publication', entityId: publicationId, workflowPayload: result.analysis.originalAiOutput };
  persistAiAnalysis(state, analysis);
  appendAiDomainAuditEvent(state, { type: AI_AUDIT_EVENT_TYPE.AI_CHANGE_ANALYSIS_REQUESTED, analysisId: analysis.analysisId, taskType: AI_TASK_TYPE.AI_CHANGE_ANALYSIS, actor: state.currentDemoUserId, contextHash: analysis.contextHash, promptVersion: analysis.promptVersion });
  return { ok: true, analysis };
}

export async function generateImpactAssessmentAi(state, changeId, { fixtureScenario = 'ai-003-impact-assessment' } = {}) {
  if (!canCreateAiWorkflowDrafts(state)) return { ok: false, code: 'FORBIDDEN' };
  const selection = selectionForChange(state, changeId);
  const result = await runFixtureAiAnalysis(state, {
    taskType: AI_TASK_TYPE.AI_IMPACT_ASSESSMENT,
    selection,
    fixtureScenario,
  });
  if (!result.persistable) return result;
  const analysis = { ...result.analysis, entityType: 'Change', entityId: changeId, workflowPayload: result.analysis.originalAiOutput };
  persistAiAnalysis(state, analysis);
  appendAiDomainAuditEvent(state, { type: AI_AUDIT_EVENT_TYPE.AI_IA_REQUESTED, analysisId: analysis.analysisId, taskType: AI_TASK_TYPE.AI_IMPACT_ASSESSMENT, actor: state.currentDemoUserId, contextHash: analysis.contextHash, promptVersion: analysis.promptVersion });
  return { ok: true, analysis };
}

export async function generateObligationSuggestions(state, assessmentId, { fixtureScenario = 'ai-004-obligation-suggestion' } = {}) {
  if (!canCreateAiWorkflowDrafts(state)) return { ok: false, code: 'FORBIDDEN' };
  const result = await runFixtureAiAnalysis(state, {
    taskType: AI_TASK_TYPE.AI_OBLIGATION_SUGGESTION,
    selection: selectionForAssessment(state, assessmentId),
    fixtureScenario,
  });
  if (!result.persistable) return result;
  const analysis = { ...result.analysis, entityType: 'ImpactAssessment', entityId: assessmentId, workflowPayload: result.analysis.originalAiOutput };
  persistAiAnalysis(state, analysis);
  appendAiDomainAuditEvent(state, { type: AI_AUDIT_EVENT_TYPE.AI_OBLIGATION_REQUESTED, analysisId: analysis.analysisId, taskType: AI_TASK_TYPE.AI_OBLIGATION_SUGGESTION, actor: state.currentDemoUserId, contextHash: analysis.contextHash, promptVersion: analysis.promptVersion });
  return { ok: true, analysis };
}

export function createDraftChangeFromAnalysis(state, analysisId, humanEdits = {}) {
  if (!canCreateAiWorkflowDrafts(state)) return { ok: false, code: 'FORBIDDEN' };
  const analysis = state.riAiAnalysisResults?.find((a) => a.analysisId === analysisId);
  if (!analysis || analysis.taskType !== AI_TASK_TYPE.AI_CHANGE_ANALYSIS) return { ok: false, code: 'NOT_FOUND' };
  if (analysis.status !== 'COMPLETED') return { ok: false, code: 'INVALID_ANALYSIS' };
  const draft = analysis.workflowPayload?.proposedChangeDraft || {};
  const pubId = analysis.entityId || analysis.contextRecordIds?.find((id) => id.startsWith('PUB-'));
  const pub = state.publications.find((p) => p.id === pubId);
  if (!pub) return { ok: false, code: 'NO_PUBLICATION' };
  const changeId = nextChangeId();
  const title = humanEdits.title || draft.title || 'AI proposed regulatory change';
  const description = humanEdits.summary || draft.summary || analysis.summary;
  const ch = {
    id: changeId,
    publicationId: pubId,
    scenario: pub.scenario,
    title,
    description,
    summary: description,
    sourceCitation: pub.reference || 'PS26/14',
    sourceSection: '3.12',
    topic: 'AI-assisted change (fixture)',
    materiality: 'High',
    effectiveDate: humanEdits.effectiveDate || draft.effectiveDateCandidate || pub.effectiveDate,
    status: 'New',
    applicabilityRecommendation: 'Review Required',
    applicabilityConfidence: 70,
    applicabilityDecision: 'Review Required',
    applicabilityReasoning: 'Created from AI change analysis — human review required.',
    aiProvenance: {
      analysisId,
      contextHash: analysis.contextHash,
      materialitySuggestion: analysis.workflowPayload?.materialitySuggestion,
      providerMode: analysis.providerMode,
    },
  };
  state.changes.push(ch);
  pub.changeIds = [...(pub.changeIds || []), changeId];
  analysis.reviewStatus = AI_REVIEW_STATUS.ACCEPTED;
  analysis.humanEditedOutput = humanEdits;
  analysis.linkedRecordId = changeId;
  pushTrace(state, {
    analysisId,
    action: 'DRAFT_CHANGE_CREATED',
    entityType: 'Change',
    entityId: changeId,
    originalAiPayload: analysis.originalAiOutput,
    humanEditedPayload: humanEdits,
    editorId: state.currentDemoUserId,
    contextHash: analysis.contextHash,
  });
  appendAiDomainAuditEvent(state, { type: AI_AUDIT_EVENT_TYPE.AI_CHANGE_DRAFT_CREATED, analysisId, taskType: analysis.taskType, actor: state.currentDemoUserId, contextHash: analysis.contextHash, linkedRecordId: changeId });
  return { ok: true, changeId, change: ch };
}

export function createDraftIaFromAnalysis(state, analysisId, humanEdits = {}) {
  if (!canCreateAiWorkflowDrafts(state)) return { ok: false, code: 'FORBIDDEN' };
  const analysis = state.riAiAnalysisResults?.find((a) => a.analysisId === analysisId);
  if (!analysis || analysis.taskType !== AI_TASK_TYPE.AI_IMPACT_ASSESSMENT) return { ok: false, code: 'NOT_FOUND' };
  const changeId = analysis.entityId;
  const ch = state.changes.find((c) => c.id === changeId);
  const iaId = nextIaId();
  const payload = analysis.workflowPayload || {};
  const ia = {
    id: iaId,
    changeId,
    publicationId: ch?.publicationId || 'PUB-001',
    scenario: ch?.scenario || 'consumer-duty',
    title: humanEdits.title || payload.impactSummary || 'AI-assisted impact assessment',
    owner: 'James Okonkwo',
    ownerId: 'u-walsh',
    materiality: ch?.materiality || 'High',
    status: 'Draft',
    dueDate: payload.deadlines?.[0] || ch?.effectiveDate,
    reviewer: 'Sarah Jones',
    approver: 'Priya Sharma',
    aiSummary: humanEdits.impactSummary || payload.impactSummary || analysis.summary,
    entities: payload.affectedBusinessAreas || [],
    businessUnits: payload.affectedBusinessAreas || [],
    policyIds: (payload.policyImpacts || []).map((p) => p.policyId).filter(Boolean),
    riskIds: (payload.riskImpacts || []).map((r) => r.riskId).filter(Boolean),
    controlIds: (payload.controlImpacts || []).map((c) => c.controlId).filter(Boolean),
    processes: payload.affectedProcesses || [],
    aiProvenance: { analysisId, contextHash: analysis.contextHash, providerMode: analysis.providerMode },
    originalAiText: payload.obligationSuggestions?.[0]?.suggestedText || analysis.summary,
    humanEditedText: humanEdits.impactSummary || null,
  };
  state.assessments.push(ia);
  analysis.reviewStatus = AI_REVIEW_STATUS.ACCEPTED;
  analysis.linkedRecordId = iaId;
  pushTrace(state, {
    analysisId,
    action: 'DRAFT_IA_CREATED',
    entityType: 'ImpactAssessment',
    entityId: iaId,
    originalAiPayload: analysis.originalAiOutput,
    humanEditedPayload: humanEdits,
    editorId: state.currentDemoUserId,
  });
  appendAiDomainAuditEvent(state, { type: AI_AUDIT_EVENT_TYPE.AI_IA_DRAFT_CREATED, analysisId, taskType: analysis.taskType, actor: state.currentDemoUserId, linkedRecordId: iaId });
  return { ok: true, assessmentId: iaId, assessment: ia };
}

export function createDraftObligationFromAnalysis(state, analysisId, suggestionIndex = 0, humanEdits = {}) {
  if (!canCreateAiWorkflowDrafts(state)) return { ok: false, code: 'FORBIDDEN' };
  const analysis = state.riAiAnalysisResults?.find((a) => a.analysisId === analysisId);
  if (!analysis || analysis.taskType !== AI_TASK_TYPE.AI_OBLIGATION_SUGGESTION) return { ok: false, code: 'NOT_FOUND' };
  const suggestion = (analysis.workflowPayload?.obligationSuggestions || [])[suggestionIndex];
  if (!suggestion) return { ok: false, code: 'NO_SUGGESTION' };
  const ia = state.assessments.find((a) => a.id === analysis.entityId);
  const oblId = nextOblId();
  const aiText = suggestion.suggestedText;
  const humanText = humanEdits.suggestedText || aiText;
  const obl = {
    id: oblId,
    statement: humanText,
    publicationId: ia?.publicationId || 'PUB-001',
    changeId: ia?.changeId || null,
    assessmentId: ia?.id || analysis.entityId,
    entity: 'ABC Financial Ltd',
    owner: 'Priya Sharma',
    priority: 'High',
    effectiveDate: humanEdits.effectiveDate || suggestion.effectiveDateCandidate || '2027-01-01',
    coverage: 'None',
    status: 'Draft',
    scenario: ia?.scenario || 'consumer-duty',
    aiProvenance: { analysisId, originalAiText: aiText, humanEditedText: humanText, contextHash: analysis.contextHash },
  };
  state.obligations.push(obl);
  analysis.reviewStatus = AI_REVIEW_STATUS.ACCEPTED;
  analysis.linkedRecordId = oblId;
  pushTrace(state, {
    analysisId,
    action: 'DRAFT_OBLIGATION_CREATED',
    entityType: 'Obligation',
    entityId: oblId,
    originalAiPayload: suggestion,
    humanEditedPayload: humanEdits,
    editorId: state.currentDemoUserId,
  });
  appendAiDomainAuditEvent(state, { type: AI_AUDIT_EVENT_TYPE.AI_OBLIGATION_DRAFT_CREATED, analysisId, taskType: analysis.taskType, actor: state.currentDemoUserId, linkedRecordId: oblId });
  return { ok: true, obligationId: oblId, obligation: obl, originalAiText: aiText, humanText };
}

export function rejectWorkflowSuggestion(state, analysisId, notes = '') {
  if (!canMutateAiReviewState(state)) return { ok: false, code: 'FORBIDDEN' };
  const analysis = state.riAiAnalysisResults?.find((a) => a.analysisId === analysisId);
  if (!analysis) return { ok: false, code: 'NOT_FOUND' };
  const res = updateReviewStatus(state, analysisId, AI_REVIEW_STATUS.REJECTED, state.currentDemoUserId);
  if (!res.ok) return res;
  const typeMap = {
    [AI_TASK_TYPE.AI_CHANGE_ANALYSIS]: AI_AUDIT_EVENT_TYPE.AI_CHANGE_SUGGESTION_REJECTED,
    [AI_TASK_TYPE.AI_IMPACT_ASSESSMENT]: AI_AUDIT_EVENT_TYPE.AI_IA_SUGGESTION_REJECTED,
    [AI_TASK_TYPE.AI_OBLIGATION_SUGGESTION]: AI_AUDIT_EVENT_TYPE.AI_OBLIGATION_SUGGESTION_REJECTED,
  };
  appendAiDomainAuditEvent(state, { type: typeMap[analysis.taskType] || AI_AUDIT_EVENT_TYPE.AI_CHANGE_SUGGESTION_REJECTED, analysisId, taskType: analysis.taskType, actor: state.currentDemoUserId, notes });
  return res;
}

export function analysesForEntity(state, entityType, entityId) {
  return (state.riAiAnalysisResults || []).filter(
    (a) => a.entityId === entityId || (a.entityType === entityType && a.entityId === entityId)
  );
}
