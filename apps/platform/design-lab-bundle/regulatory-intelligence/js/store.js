import { SCENARIOS } from './seed-data.js';
import { migratePersistedState, createFreshState, clearAllLabStorage } from './migrate.js';
import { STORAGE_KEY_V2, savePersistedJson } from './platform/platform-persistence.js';
import { getTenantContext } from './platform/platform-tenant.js';
import { getCorrelationId, beginCorrelation } from './platform/platform-correlation.js';
import { assertPermission } from './platform/platform-permissions.js';
import { filterByScenario } from './relationships.js';
import { isConnectedBackendActive, blockConnectedModeMutation, isConnectedModeIntent, isConnectedModeRequested, shouldHideDemoRegulatoryData } from './platform/connected-mode.js';
import { submitConnectedAskRi } from './platform/connected-ask-ri.js';
import { getConnectedCatalogue, isConnectedCatalogueReady } from './platform/connected-catalogue.js';
import { filterOpenWorkObligations, summarizeObligationPortfolio } from './ai/obligation-portfolio.js';
import { syncGraphLinks } from './graph-sync.js';
import {
  runMockIngestion,
  retryRawItemProcessing,
  acceptChangeCandidate,
  rejectChangeCandidate,
  toggleConnectorEnabled,
} from './ingestion-pipeline.js';
import {
  runConnectorIngestion,
  clearLiveVerificationData,
  importStagedLiveItem,
} from './connectors/regulatory-ingestion-service.js';
import { CONNECTOR_MODES } from './connectors/connector-base.js';
import {
  approveGovernanceStep,
  returnGovernanceStep,
  recordCommitteeDecision,
  reviewEvidence,
  completeAttestation,
  closeRegulatoryChange,
  reopenRegulatoryChange,
  recordVersionImpactReview,
  tryApproveAssessment,
} from './governance-actions.js';
import { checkEvidenceReviewerSoD } from './governance-helpers.js';
import { recordAiHumanReview, runMockReanalysis, recordSourceConflictResolution } from './ai-governance-actions.js';
import { executeAiRequest, getAiExecution } from './ai-runtime/ai-orchestrator.js';
import {
  completeFindingRemediation as _completeFindingRemediation,
  validateFinding as _validateFinding,
  completeManagementAttestationMock,
  finalizeBoardPackReview as _finalizeBoardPackReview,
  markAssuranceReviewStale,
} from './assurance-actions.js';
import { getCurrentAnalysis } from './ai-governance-helpers.js';
import {
  generateAiSummary as _generateAiSummary,
  acceptAiSummary as _acceptAiSummary,
  rejectAiSummary as _rejectAiSummary,
} from './ai/ai-summary-service.js';
import {
  generateChangeAnalysis,
  generateImpactAssessmentAi,
  generateObligationSuggestions,
  createDraftChangeFromAnalysis,
  createDraftIaFromAnalysis,
  createDraftObligationFromAnalysis,
  rejectWorkflowSuggestion,
} from './ai/workflow-ai-service.js';
import {
  askRi,
  compareRegulatoryText,
  generateExecutiveSummary,
  acceptExecutiveSummaryReview,
} from './ai/intelligence-ai-service.js';
import { AI_TASK_TYPE } from './ai/enums.js';
import {
  buildWorkQueue,
  buildNotifications,
  pipelineCounts,
  currentDemoUser,
  personName,
  DEMO_TODAY,
  isIntakeCandidate,
} from './workflow-helpers.js';
import { assertImpactAssessmentTransition } from './platform/state-transitions.js';
import { withMutationGuard } from './platform/mutation-guard.js';
import { validateMinimalState } from './platform/startup-validation.js';
import {
  clearAskRiTransientState,
  persistableLabState,
  restoreAskRiSession,
  saveAskRiSession,
  clearAskRiSession,
} from './platform/ask-ri-session.mjs';

let state = null;
const listeners = new Set();

export function initStore() {
  state = migratePersistedState();
  clearAskRiTransientState(state);
  const check = validateMinimalState(state);
  if (!check.ok && !state.persistenceRecovery) {
    state.persistenceRecovery = {
      usedBaseline: true,
      message: check.issues.join('; '),
      at: new Date().toISOString(),
    };
  }
  return state;
}

/** In-memory store for Node tests / service acceptance without browser localStorage. */
export function hydrateStore(nextState) {
  state = nextState;
  return state;
}

export function getState() {
  if (!state) initStore();
  return state;
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function notify() {
  syncGraphLinks(state);
  savePersistedJson(STORAGE_KEY_V2, persistableLabState(state));
  listeners.forEach((fn) => fn(state));
}

/** After connected bootstrap — restore tab-scoped Ask RI if org matches. */
export function applyAskRiSessionRestore() {
  if (!state) return { restored: false };
  const restored = restoreAskRiSession(state);
  if (restored.restored && restored.lastAsk) {
    state._lastAskRi = restored.lastAsk;
    state._lastAskRiProviderCalls = restored.providerCallCount ?? 0;
    state._askRiLastQuestion = restored.question;
    state._askRiDraft = '';
    return restored;
  }
  clearAskRiTransientState(state);
  return { restored: false };
}

export function resetStore() {
  clearAllLabStorage();
  clearAskRiSession();
  state = createFreshState();
  clearLiveVerificationData(state);
  notify();
}

export function setScenario(scenarioId) {
  state.scenarioId = scenarioId;
  notify();
}

export function getScenario() {
  const sid = state?.scenarioId || 'consumer-duty';
  return SCENARIOS.find((s) => s.id === sid) || SCENARIOS.find((s) => s.id === 'consumer-duty');
}

export function scenarioFilter(items) {
  if (!Array.isArray(items)) return [];
  if (isConnectedBackendActive(state)) {
    return items.filter((item) => item && item._connected === true);
  }
  if (items.length && items[0]?._connected) {
    return items;
  }
  return filterByScenario(items, state.scenarioId);
}

/** Connected operational views — only verified tenant/regulatory catalogue rows. */
function isOperationalConnectedRow(row) {
  const p = row?.dataProvenance;
  const lab = row?.labClassification;
  return p === 'tenant_operational' || p === 'regulatory_catalogue' || lab === 'operational';
}

/** Publications for Dashboard / Library / Intake — connected catalogue or demo seed. */
export function getViewPublications() {
  if (isConnectedBackendActive(state) && isConnectedCatalogueReady(state)) {
    return getConnectedCatalogue(state).publications;
  }
  if (shouldHideDemoRegulatoryData(state)) {
    return [];
  }
  return scenarioFilter(state.publications);
}

/** Regulatory changes for dashboard metrics when connected (operational register only). */
export function getViewChanges() {
  if (isConnectedBackendActive(state) && isConnectedCatalogueReady(state)) {
    return getConnectedCatalogue(state).changes || [];
  }
  if (shouldHideDemoRegulatoryData(state)) {
    return [];
  }
  return scenarioFilter(state.changes);
}

export function getViewAuthorisedUatChanges() {
  if (isConnectedBackendActive(state) && isConnectedCatalogueReady(state)) {
    return getConnectedCatalogue(state).authorisedUatChanges || [];
  }
  return [];
}

export function getViewAuthorisedUatObligations() {
  if (isConnectedBackendActive(state) && isConnectedCatalogueReady(state)) {
    return getConnectedCatalogue(state).authorisedUatObligations || [];
  }
  return [];
}

export function getViewAuthorisedUatImpacts() {
  if (isConnectedBackendActive(state) && isConnectedCatalogueReady(state)) {
    return getConnectedCatalogue(state).authorisedUatImpacts || [];
  }
  return [];
}

export function getViewAuthorisedUatRisks() {
  if (isConnectedBackendActive(state) && isConnectedCatalogueReady(state)) {
    return getConnectedCatalogue(state).authorisedUatRisks || [];
  }
  return [];
}

export function getViewAuthorisedUatControls() {
  if (isConnectedBackendActive(state) && isConnectedCatalogueReady(state)) {
    return getConnectedCatalogue(state).authorisedUatControls || [];
  }
  return [];
}

export function getViewAuthorisedUatActions() {
  if (isConnectedBackendActive(state) && isConnectedCatalogueReady(state)) {
    return getConnectedCatalogue(state).authorisedUatActions || [];
  }
  return [];
}

export function getViewUnverifiedAuditChanges() {
  if (isConnectedBackendActive(state) && isConnectedCatalogueReady(state)) {
    return getConnectedCatalogue(state).unverifiedAuditChanges || [];
  }
  return [];
}

export function getConnectedChangeProvenance() {
  if (isConnectedBackendActive(state) && isConnectedCatalogueReady(state)) {
    return getConnectedCatalogue(state).changeProvenance;
  }
  return null;
}

export function getViewChangesForPublication(publicationId) {
  const seen = new Set();
  return [...getViewChanges(), ...getViewAuthorisedUatChanges()].filter((c) => {
    if (c.publicationId !== publicationId) return false;
    if (seen.has(c.id)) return false;
    seen.add(c.id);
    return true;
  });
}

export function getViewImpactAssessments() {
  if (isConnectedBackendActive(state) && isConnectedCatalogueReady(state)) {
    return (getConnectedCatalogue(state).impactAssessments || []).filter(isOperationalConnectedRow);
  }
  if (shouldHideDemoRegulatoryData(state)) {
    return [];
  }
  return scenarioFilter(state.assessments);
}

export function getViewObligations() {
  if (isConnectedBackendActive(state) && isConnectedCatalogueReady(state)) {
    return (getConnectedCatalogue(state).obligations || []).filter(isOperationalConnectedRow);
  }
  if (shouldHideDemoRegulatoryData(state)) {
    return [];
  }
  return scenarioFilter(state.obligations);
}

export function getViewRisks() {
  if (isConnectedBackendActive(state) && isConnectedCatalogueReady(state)) {
    return (getConnectedCatalogue(state).risks || []).filter(isOperationalConnectedRow);
  }
  if (shouldHideDemoRegulatoryData(state)) {
    return [];
  }
  return scenarioFilter(state.risks);
}

export function getViewControls() {
  if (isConnectedBackendActive(state) && isConnectedCatalogueReady(state)) {
    return (getConnectedCatalogue(state).controls || []).filter(isOperationalConnectedRow);
  }
  if (shouldHideDemoRegulatoryData(state)) {
    return [];
  }
  return scenarioFilter(state.controls);
}

export function getViewPolicies() {
  if (isConnectedBackendActive(state) && isConnectedCatalogueReady(state)) {
    return getConnectedCatalogue(state).policies || [];
  }
  if (shouldHideDemoRegulatoryData(state)) {
    return [];
  }
  return scenarioFilter(state.policies);
}

export function getViewAuthorisedUatEvidence() {
  if (isConnectedBackendActive(state) && isConnectedCatalogueReady(state)) {
    return getConnectedCatalogue(state).authorisedUatEvidence || [];
  }
  return [];
}

export function getViewEvidence() {
  if (isConnectedBackendActive(state) && isConnectedCatalogueReady(state)) {
    return getConnectedCatalogue(state).evidence || [];
  }
  if (shouldHideDemoRegulatoryData(state)) {
    return [];
  }
  return scenarioFilter(state.evidence);
}

export function getViewFindings() {
  if (isConnectedBackendActive(state) && isConnectedCatalogueReady(state)) {
    return getConnectedCatalogue(state).findings || [];
  }
  if (shouldHideDemoRegulatoryData(state)) {
    return [];
  }
  return scenarioFilter(state.findings || []);
}

export function getViewAuthorisedUatFindings() {
  if (isConnectedBackendActive(state) && isConnectedCatalogueReady(state)) {
    return getConnectedCatalogue(state).authorisedUatFindings || [];
  }
  return [];
}

export function getFinding(id) {
  if (isConnectedBackendActive(state)) {
    const cat = getConnectedCatalogue(state);
    const fromList =
      cat.findings?.find((f) => f.id === id) || cat.authorisedUatFindings?.find((f) => f.id === id);
    const detail = cat.findingDetailsById?.[id];
    if (detail || fromList) {
      const row = { ...(fromList || {}), ...(detail || {}), _connected: true };
      return {
        ...row,
        id: row.id,
        title: row.title,
        severity: row.severity,
        status: row.status,
        owner: row.owner,
        ownerId: row.ownerId,
        dueDate: row.dueDate,
        description: row.description,
        updatedAt: row.updatedAt,
        controlIds: row.controlIds,
        linkedControls: row.linkedControls,
        actionIds: row.actionIds,
        linkedActions: row.linkedActions,
        parentRiskId: row.parentRiskId,
        parentControlId: row.parentControlId,
        dataProvenance: row.dataProvenance,
        labClassification: row.labClassification,
        labClassificationLabel: row.labClassificationLabel,
        _connected: true,
      };
    }
  }
  return (state.assuranceFindings || []).find((f) => f.id === id);
}

export function getViewAssuranceReviews() {
  if (isConnectedBackendActive(state) && isConnectedCatalogueReady(state)) {
    return getConnectedCatalogue(state).assuranceReviews || [];
  }
  if (shouldHideDemoRegulatoryData(state)) {
    return [];
  }
  return scenarioFilter(state.assuranceReviews || []);
}

export function getViewActions() {
  if (isConnectedBackendActive(state) && isConnectedCatalogueReady(state)) {
    return getConnectedCatalogue(state).actions || [];
  }
  if (shouldHideDemoRegulatoryData(state)) {
    return [];
  }
  return scenarioFilter(state.actions);
}

export function getViewWorkflowEvents() {
  if (isConnectedBackendActive(state) && isConnectedCatalogueReady(state)) {
    return getConnectedCatalogue(state).workflowEvents || [];
  }
  if (shouldHideDemoRegulatoryData(state)) {
    return [];
  }
  return state.auditEvents || [];
}

export function getConnectedGovernanceMetrics() {
  if (isConnectedBackendActive(state) && isConnectedCatalogueReady(state)) {
    return getConnectedCatalogue(state).governanceMetrics;
  }
  return null;
}

export function getViewAiAnalysisRuns() {
  if (isConnectedBackendActive(state) && isConnectedCatalogueReady(state)) {
    return getConnectedCatalogue(state).aiAnalysisRuns || [];
  }
  if (shouldHideDemoRegulatoryData(state)) {
    return [];
  }
  return scenarioFilter(state.aiAnalyses || []);
}

export function getViewAuthorisedUatAiAnalysisRuns() {
  if (isConnectedBackendActive(state) && isConnectedCatalogueReady(state)) {
    return getConnectedCatalogue(state).authorisedUatAiAnalysisRuns || [];
  }
  return [];
}

export function getConnectedAiAnalysisProvenance() {
  if (isConnectedBackendActive(state) && isConnectedCatalogueReady(state)) {
    return getConnectedCatalogue(state).aiAnalysisProvenance;
  }
  return null;
}

export function getViewAiAnalysisRunsForPublication(publicationId) {
  const operational = getViewAiAnalysisRuns().filter((r) => r.publicationId === publicationId);
  const uat = getViewAuthorisedUatAiAnalysisRuns().filter((r) => r.publicationId === publicationId);
  const seen = new Set();
  return [...operational, ...uat].filter((r) => {
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });
}

export function findViewAiAnalysisRun(runId) {
  return (
    getViewAiAnalysisRuns().find((x) => x.id === runId) ||
    getViewAuthorisedUatAiAnalysisRuns().find((x) => x.id === runId) ||
    null
  );
}

export function getViewRegulatorySources() {
  if (isConnectedBackendActive(state) && isConnectedCatalogueReady(state)) {
    return getConnectedCatalogue(state).regulatorySources || [];
  }
  if (shouldHideDemoRegulatoryData(state)) {
    return [];
  }
  return state.regulatorySources || [];
}

export function getViewIngestionRuns() {
  if (isConnectedBackendActive(state) && isConnectedCatalogueReady(state)) {
    return getConnectedCatalogue(state).ingestionRuns || [];
  }
  if (shouldHideDemoRegulatoryData(state)) {
    return [];
  }
  return state.ingestionRuns || [];
}

export function getViewOperationalAlerts() {
  if (isConnectedBackendActive(state) && isConnectedCatalogueReady(state)) {
    return getConnectedCatalogue(state).operationalAlerts || [];
  }
  if (shouldHideDemoRegulatoryData(state)) {
    return [];
  }
  return [];
}

export function getConnectedSourceMonitoringSummary() {
  if (isConnectedBackendActive(state) && isConnectedCatalogueReady(state)) {
    return getConnectedCatalogue(state).sourceMonitoringSummary;
  }
  return null;
}

export function getConnectedSourceMonitoringNote() {
  if (isConnectedBackendActive(state) && isConnectedCatalogueReady(state)) {
    return getConnectedCatalogue(state).sourceMonitoringInventoryNote;
  }
  return null;
}

export function getConnectedOperationsMetrics() {
  if (isConnectedBackendActive(state) && isConnectedCatalogueReady(state)) {
    return getConnectedCatalogue(state).operationsMetrics;
  }
  return null;
}

export function getConnectedRegulators() {
  if (isConnectedBackendActive(state) && isConnectedCatalogueReady(state)) {
    return getConnectedCatalogue(state).regulators || [];
  }
  return [];
}

export function getConnectedOperationsNotes() {
  if (isConnectedBackendActive(state) && isConnectedCatalogueReady(state)) {
    return getConnectedCatalogue(state).operationsNotes || { notifications: null, snapshots: null };
  }
  return { notifications: null, snapshots: null };
}

export function getConnectedIngestionRunDetail(runId) {
  if (isConnectedBackendActive(state) && isConnectedCatalogueReady(state)) {
    return getConnectedCatalogue(state).ingestionRunDetailsById?.[runId] || null;
  }
  return null;
}

export function addAudit(entry) {
  const e = {
    id: `AUD-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
    tenantId: entry.tenantId || getTenantContext(state).tenantId,
    correlationId: entry.correlationId || getCorrelationId(),
    actorType: entry.actorType || 'user',
    source: entry.source || 'design-lab',
    systemVersion: state.platformConfig?.schemaVersion || state.schemaVersion,
    relatedIds: entry.relatedIds || [],
    immutable: true,
    ...entry,
  };
  if (!state.auditEvents) state.auditEvents = [];
  state.auditEvents.unshift(e);
  notify();
}

/** MOCK optimistic concurrency check for assessments. */
export function checkAssessmentVersion(assessmentId, expectedVersion) {
  const s = getState();
  const a = s.assessments?.find((x) => x.id === assessmentId);
  if (!a) return { ok: false, code: 'NOT_FOUND', message: 'Assessment not found' };
  const current = a.rowVersion ?? 0;
  if (expectedVersion != null && current !== expectedVersion) {
    return { ok: false, code: 'STALE_VERSION', status: 409, message: 'STALE_VERSION — record was updated elsewhere.' };
  }
  return { ok: true, assessment: a };
}

export function setPublicationApplicability(pubId, decision, justification, userName) {
  const p = state.publications.find((x) => x.id === pubId);
  if (!p) return;
  const prev = p.applicabilityDecision;
  p.applicabilityDecision = decision;
  p.workflowStatus = decision === 'Not Applicable' ? 'Closed' : 'Impact Review';
  p.unreviewed = false;
  const at = new Date().toISOString();
  state.applicabilityOverrides[pubId] = { decision, justification, user: userName, at };
  p.decisionMeta = { user: userName, at, justification };
  addAudit({
    user: userName,
    action: 'Publication applicability decision',
    recordType: 'Publication',
    recordId: pubId,
    previousValue: prev,
    newValue: decision,
    humanDecision: justification,
    comments: justification,
    relatedIds: [pubId],
  });
}

export function setChangeApplicability(changeId, decision, justification, userName) {
  const ch = state.changes.find((x) => x.id === changeId);
  if (!ch) return;
  const prev = ch.applicabilityDecision;
  ch.applicabilityDecision = decision;
  const at = new Date().toISOString();
  state.changeApplicabilityOverrides[changeId] = { decision, justification, user: userName, at };
  ch.decisionMeta = { user: userName, at, justification };
  addAudit({
    user: userName,
    action: 'Regulatory change applicability decision',
    recordType: 'Regulatory Change',
    recordId: changeId,
    previousValue: prev,
    newValue: decision,
    humanDecision: justification,
    comments: justification,
    relatedIds: [changeId, ch.publicationId],
  });
}

/** @deprecated use setPublicationApplicability */
export function setApplicability(pubId, decision, justification, userName) {
  setPublicationApplicability(pubId, decision, justification, userName);
}

export function updateAssessment(id, patch, userName, auditAction) {
  const a = state.assessments.find((x) => x.id === id);
  if (!a) return;
  const prev = a.status;
  Object.assign(a, patch);
  if (auditAction) {
    addAudit({
      user: userName,
      action: auditAction,
      recordType: 'Impact Assessment',
      recordId: id,
      previousValue: prev,
      newValue: a.status,
      comments: patch.comments || '',
      relatedIds: [id, a.changeId, a.publicationId],
    });
  } else {
    notify();
  }
}

export function getDemoUser() {
  return currentDemoUser(getState());
}

export function setDemoUser(personId) {
  if (!getState().people?.some((p) => p.id === personId)) return;
  state.currentDemoUserId = personId;
  notify();
}

export function markNotificationRead(noteId) {
  if (!state.notificationReadIds.includes(noteId)) state.notificationReadIds.push(noteId);
  notify();
}

export function assignEntity(entityType, entityId, { assigneeId, teamId, dueDate, comments }, byUser) {
  const user = byUser || personName(state, state.currentDemoUserId);
  const patch = { assignedAt: new Date().toISOString(), assignedBy: user };
  if (assigneeId) patch.assignedReviewerId = patch.ownerId = assigneeId;
  if (teamId) patch.assignedTeamId = teamId;
  if (dueDate) patch.dueDate = patch.triageSlaDue = dueDate;

  let record;
  if (entityType === 'Publication') {
    record = getPublication(entityId);
    if (record) {
      Object.assign(record, patch);
      if (assigneeId) record.triageStatus = 'Assigned';
    }
  } else if (entityType === 'Regulatory Change') {
    record = getChange(entityId);
    if (record) {
      if (assigneeId) record.reviewerId = assigneeId;
      if (dueDate) record.dueDate = dueDate;
      if (teamId) record.assignedTeamId = teamId;
    }
  } else if (entityType === 'Impact Assessment') {
    record = getAssessment(entityId);
    if (record) {
      if (assigneeId) record.ownerId = assigneeId;
      if (dueDate) record.dueDate = dueDate;
    }
  } else if (entityType === 'Action') {
    record = getAction(entityId);
    if (record) {
      if (assigneeId) record.ownerId = assigneeId;
      if (dueDate) record.dueDate = dueDate;
    }
  }
  if (!record) return;
  addAudit({
    user,
    action: `${entityType} assigned`,
    recordType: entityType,
    recordId: entityId,
    newValue: assigneeId ? personName(state, assigneeId) : dueDate,
    comments: comments || '',
    relatedIds: [entityId],
  });
}

export function triagePublication(pubId, action, payload = {}) {
  const p = getPublication(pubId);
  if (!p) return;
  const user = payload.user || personName(state, state.currentDemoUserId);
  const prev = p.triageStatus;
  const map = {
    accept: () => {
      p.triageStatus = 'Accepted';
      p.intakeAccepted = true;
      p.workflowStatus = p.workflowStatus === 'New' ? 'Assessment Required' : p.workflowStatus;
      p.aiHumanReviewStatus = 'Human accepted';
    },
    'not-relevant': () => {
      p.triageStatus = 'Not Relevant';
      p.intakeAccepted = false;
      p.workflowStatus = 'Closed';
      p.aiHumanReviewStatus = 'Human rejected';
    },
    escalate: () => {
      p.triageStatus = 'Escalated';
      p.escalated = true;
    },
    'request-review': () => {
      p.triageStatus = 'Review Required';
    },
    'start-review': () => {
      p.triageStatus = 'In Review';
    },
  };
  map[action]?.();
  if (payload.assigneeId) {
    p.assignedReviewerId = payload.assigneeId;
    p.triageStatus = 'Assigned';
  }
  const actionLabel = {
    accept: 'Triage accepted',
    'not-relevant': 'Triage marked not relevant',
    escalate: 'Item escalated',
    'request-review': 'Additional review requested',
    'start-review': 'Triage in review',
  }[action] || 'Triage updated';
  addAudit({
    user,
    action: actionLabel,
    recordType: 'Publication',
    recordId: pubId,
    previousValue: prev,
    newValue: p.triageStatus,
    comments: payload.justification || '',
    relatedIds: [pubId],
  });
}

export function recordAiOverride(entityType, entityId, { aiRecommendation, humanDecision, justification }) {
  const user = personName(state, state.currentDemoUserId);
  const at = new Date().toISOString();
  const meta = { aiRecommendation, humanDecision, justification, user, at };
  if (entityType === 'Regulatory Change') {
    const ch = getChange(entityId);
    if (!ch) return;
    const prev = ch.applicabilityDecision;
    ch.applicabilityDecision = humanDecision;
    ch.decisionMeta = meta;
    ch.aiGovernance = { ...(ch.aiGovernance || {}), humanReviewStatus: 'Human modified', humanDecision, justification };
    const analysis = getCurrentAnalysis(state, 'Regulatory Change', entityId);
    addAudit({
      user,
      action: 'Recommendation overridden',
      recordType: 'Regulatory Change',
      recordId: entityId,
      previousValue: prev,
      newValue: humanDecision,
      comments: justification,
      relatedIds: [entityId, ch.publicationId, analysis?.id].filter(Boolean),
    });
    if (analysis) {
      recordAiHumanReview(
        state,
        analysis.id,
        {
          decision: 'Modified',
          justification,
          modifiedRecommendation: humanDecision,
          reasonCategory: 'Legal interpretation',
        },
        state.currentDemoUserId,
        addAudit
      );
    }
  }
}

export function aiResolveConflict(analysisId, resolution) {
  const r = recordSourceConflictResolution(state, analysisId, resolution, state.currentDemoUserId, addAudit);
  if (r.ok) notify();
  return r;
}

export function aiRunReanalysis(analysisId) {
  const r = runMockReanalysis(state, analysisId, state.currentDemoUserId, addAudit);
  if (r.ok) notify();
  return r;
}

export function approveAssessment(id, decision, comments) {
  const a = getAssessment(id);
  if (!a) return;
  const userId = state.currentDemoUserId;
  const user = personName(state, userId);
  const prev = a.status;
  const pre = tryApproveAssessment(state, id, decision, comments, userId, addAudit);
  if (decision === 'approve' && !pre.ok) return pre;
  const map = {
    approve: { status: 'Implementation', approvalStatus: 'Approved' },
    reject: { status: 'Draft', approvalStatus: 'Rejected' },
    return: { status: 'Draft', approvalStatus: 'Returned for Changes' },
  };
  const patch = map[decision];
  if (!patch) return;
  Object.assign(a, patch);
  a.reviewedBy = user;
  a.reviewedDate = DEMO_TODAY;
  a.reviewComments = comments || '';
  addAudit({
    user,
    action: decision === 'approve' ? 'Assessment approved' : decision === 'reject' ? 'Assessment rejected' : 'Assessment returned',
    recordType: 'Impact Assessment',
    recordId: id,
    previousValue: prev,
    newValue: a.status,
    comments,
    relatedIds: [id, a.changeId, a.publicationId],
  });
}

export function submitAssessmentForReview(id) {
  return withMutationGuard(`ia-submit:${id}`, () => {
  const a = getAssessment(id);
  if (!a) return { ok: false, code: 'NOT_FOUND' };
  const tr = assertImpactAssessmentTransition(a, 'Submitted for Review');
  if (!tr.ok) return tr;
  const userId = state.currentDemoUserId;
  const user = personName(state, userId);
  const prev = a.status;
  a.status = 'Submitted for Review';
  a.approvalStatus = 'Submitted for Review';
  a.submittedById = a.businessSubmitterId || userId;
  a.submittedBy = personName(state, a.submittedById);
  a.submittedDate = DEMO_TODAY;
  addAudit({
    user,
    action: 'Assessment submitted',
    recordType: 'Impact Assessment',
    recordId: id,
    previousValue: prev,
    newValue: a.status,
    relatedIds: [id],
  });
  notify();
  return { ok: true };
  });
}

export function assignChangeReviewer(changeId, reviewerId, byUser) {
  assignEntity('Regulatory Change', changeId, { assigneeId: reviewerId }, byUser);
}

export function updateAction(id, patch, userName) {
  const a = state.actions.find((x) => x.id === id);
  if (!a) return;
  const prev = a.status;
  if (patch.ownerId) {
    a.owner = personName(state, patch.ownerId);
    addAudit({
      user: userName,
      action: 'Action reassigned',
      recordType: 'Action',
      recordId: id,
      newValue: a.owner,
      relatedIds: [id],
    });
  }
  Object.assign(a, patch);
  if (patch.status && patch.status !== prev) {
    addAudit({
      user: userName,
      action: 'Changed action status',
      recordType: 'Action',
      recordId: id,
      previousValue: prev,
      newValue: a.status,
      comments: '',
      relatedIds: [id, a.sourceId].filter(Boolean),
    });
    if (a.status === 'Complete' && a.sourceId?.startsWith('OBL')) {
      const obl = state.obligations.find((o) => o.id === a.sourceId);
      if (obl && obl.coverage === 'Partial') {
        const sibs = state.actions.filter((x) => x.sourceId === obl.id);
        const allDone = sibs.every((x) => x.status === 'Complete' || x.id === id);
        if (allDone) obl.coverage = 'Full';
      }
    }
  } else if (patch.ownerId || patch.dueDate) {
    notify();
  }
}

export function getPublication(id) {
  if (isConnectedBackendActive(state)) {
    const cat = getConnectedCatalogue(state);
    const fromCat = cat.publications.find((p) => p.id === id);
    const detail = cat.detailsById?.[id];
    if (fromCat) {
      return detail ? { ...fromCat, _detail: detail } : fromCat;
    }
    return undefined;
  }
  return state.publications.find((p) => p.id === id);
}

export function getChange(id) {
  if (isConnectedBackendActive(state)) {
    const cat = getConnectedCatalogue(state);
    const fromList =
      cat.changes?.find((c) => c.id === id) ||
      cat.authorisedUatChanges?.find((c) => c.id === id) ||
      cat.unverifiedAuditChanges?.find((c) => c.id === id);
    const detail = cat.changeDetailsById?.[id];
    if (detail || fromList) {
      return { ...fromList, ...detail, _connected: true };
    }
  }
  return state.changes.find((c) => c.id === id);
}

export function getAssessment(id) {
  if (isConnectedBackendActive(state)) {
    const cat = getConnectedCatalogue(state);
    const fromList =
      cat.impactAssessments?.find((a) => a.id === id) ||
      cat.authorisedUatImpacts?.find((a) => a.id === id);
    const detail = cat.assessmentDetailsById?.[id];
    if (detail || fromList) {
      return { ...fromList, ...detail, _connected: true };
    }
  }
  return state.assessments.find((a) => a.id === id);
}

export function getObligation(id) {
  if (isConnectedBackendActive(state) && isConnectedCatalogueReady(state)) {
    const cat = getConnectedCatalogue(state);
    const fromList =
      cat.obligations?.find((o) => o.id === id) ||
      cat.authorisedUatObligations?.find((o) => o.id === id);
    const detail = cat.obligationDetailsById?.[id];
    if (detail) return { ...fromList, ...detail };
    return fromList;
  }
  return state.obligations.find((o) => o.id === id);
}

export function getRisk(id) {
  if (isConnectedBackendActive(state) && isConnectedCatalogueReady(state)) {
    const cat = getConnectedCatalogue(state);
    const fromList =
      cat.risks?.find((r) => r.id === id) || cat.authorisedUatRisks?.find((r) => r.id === id);
    const detail = cat.riskDetailsById?.[id];
    if (detail) return { ...fromList, ...detail };
    return fromList;
  }
  return state.risks.find((r) => r.id === id);
}

export function getControl(id) {
  if (isConnectedBackendActive(state) && isConnectedCatalogueReady(state)) {
    const cat = getConnectedCatalogue(state);
    const fromList =
      cat.controls?.find((c) => c.id === id) || cat.authorisedUatControls?.find((c) => c.id === id);
    const detail = cat.controlDetailsById?.[id];
    if (detail) return { ...fromList, ...detail };
    return fromList;
  }
  return state.controls.find((c) => c.id === id);
}

export function getPolicy(id) {
  if (isConnectedBackendActive(state) && isConnectedCatalogueReady(state)) {
    const cat = getConnectedCatalogue(state);
    return cat.policies?.find((p) => p.id === id);
  }
  return state.policies.find((p) => p.id === id);
}

export function getEvidence(id) {
  if (isConnectedBackendActive(state)) {
    const cat = getConnectedCatalogue(state);
    const fromList =
      cat.evidence?.find((e) => e.id === id) || cat.authorisedUatEvidence?.find((e) => e.id === id);
    const detail = cat.evidenceDetailsById?.[id];
    if (detail || fromList) {
      const row = { ...(fromList || {}), ...(detail || {}), _connected: true };
      if (detail?._detailHydrated !== true && fromList?.sourceHash && !detail?.sourceHash) {
        row.sourceHash = fromList.sourceHash;
      }
      return {
        ...row,
        id: row.id,
        title: row.title,
        evidenceType: row.evidenceType,
        sourceHash: row.sourceHash ?? null,
        createdAt: row.createdAt,
        controlIds: row.controlIds,
        linkedControls: row.linkedControls,
        versions: row.versions,
        dataProvenance: row.dataProvenance,
        labClassification: row.labClassification,
        labClassificationLabel: row.labClassificationLabel,
        _connected: true,
      };
    }
  }
  return state.evidence.find((e) => e.id === id);
}

export function getAction(id) {
  if (isConnectedBackendActive(state) && isConnectedCatalogueReady(state)) {
    const cat = getConnectedCatalogue(state);
    const fromList =
      cat.actions?.find((a) => a.id === id) || cat.authorisedUatActions?.find((a) => a.id === id);
    const detail = cat.actionDetailsById?.[id];
    if (fromList || detail) {
      const row = { ...fromList, ...detail, _connected: true };
      return {
        ...row,
        id: row.id,
        title: row.title,
        description: row.description ?? row.title,
        status: row.status,
        statusCode: row.statusCode,
        priority: row.priority,
        dueDate: row.dueDate,
        owner: row.owner,
        ownerId: row.ownerId,
        updatedAt: row.updatedAt,
        obligationIds: row.obligationIds,
        controlIds: row.controlIds,
        dataProvenance: row.dataProvenance,
        labClassification: row.labClassification,
        labClassificationLabel: row.labClassificationLabel,
        _connected: true,
      };
    }
    return undefined;
  }
  return state.actions.find((a) => a.id === id);
}

export function computeDashboardStats() {
  const pubs = getViewPublications();
  if (isConnectedBackendActive(state) && isConnectedCatalogueReady(state)) {
    const changes = getViewChanges();
    const today = new Date().toISOString().slice(0, 10);
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - 7);
    const weekStartIso = weekStart.toISOString().slice(0, 10);
    const in30 = new Date();
    in30.setDate(in30.getDate() + 30);
    const in30Iso = in30.toISOString().slice(0, 10);

    const notTriaged = pubs.filter((p) => p.display?.triage === 'Not triaged').length;
    const triagePersisted = pubs.filter((p) => p.display?.triagePersisted).length;
    const materialOpen = changes.filter(
      (c) => c.materiality === 'High' && !['Implemented', 'Closed', 'Complete'].includes(c.status),
    ).length;
    const publishedThisWeek = pubs.filter((p) => p.publishedDate && p.publishedDate >= weekStartIso).length;
    const detectedThisWeek = pubs.filter((p) => {
      const raw = p.display?.detectedAt;
      return raw && raw.slice(0, 10) >= weekStartIso;
    }).length;
    const consultationStructured = pubs.filter((p) => {
      const d = p.consultationDeadline || p.display?.consultationDeadlineStructured;
      return d && d >= today && d <= in30Iso;
    }).length;
    const consultationCandidates = pubs.filter(
      (p) => !p.consultationDeadline && !p.display?.consultationDeadlineStructured && p.display?.consultationDeadlineCandidate,
    ).length;
    const retrievedTimestamps = pubs
      .map((p) => p.display?.detectedAt)
      .filter(Boolean)
      .sort();
    const latestRetrievedAt = retrievedTimestamps.length ? retrievedTimestamps[retrievedTimestamps.length - 1] : null;
    const cat = getConnectedCatalogue(state);
    const impactCount =
      cat.tenantWorkCounts?.impacts ??
      (cat.impactAssessments || []).filter(isOperationalConnectedRow).length ??
      0;
    const obligationCount = cat.tenantWorkCounts?.obligations ?? cat.obligations?.length ?? 0;

    return {
      connected: true,
      catalogueCount: pubs.length,
      regulatoryChangesCount: changes.length,
      impactAssessmentCount: impactCount,
      obligationCount,
      materialChanges: materialOpen,
      notTriaged,
      triagePersisted,
      intakeCount: pubs.filter(isIntakeCandidate).length,
      publishedToday: pubs.filter((p) => p.publishedDate === today).length,
      publishedThisWeek,
      detectedThisWeek,
      upcomingDeadlines: consultationStructured,
      consultationDeadlineCandidates: consultationCandidates,
      latestRetrievedAt,
      openObligations: null,
      oblOverdue: null,
      impactAssessments: null,
      iaDraft: null,
      iaReview: null,
      iaApproval: null,
      newChanges: changes.length,
      risksLinked: null,
      controlsMapped: null,
      policiesImpacted: null,
      evidenceItems: null,
    };
  }
  const today = '2026-10-07';
  const weekStart = '2026-10-01';
  const newToday = pubs.filter((p) => p.publishedDate === today).length;
  const newWeek = pubs.filter((p) => p.publishedDate >= weekStart).length;
  const awaitingReview = pubs.filter((p) => p.unreviewed || p.workflowStatus === 'Awaiting Review' || p.workflowStatus === 'New').length;

  const ias = scenarioFilter(state.assessments);
  const iaDraft = ias.filter((a) => a.status === 'Draft').length;
  const iaReview = ias.filter((a) => a.status === 'Review' || a.status === 'Under Review').length;
  const iaApproval = ias.filter((a) => a.status === 'Awaiting Approval').length;

  const oblAll = scenarioFilter(state.obligations);
  const oblPortfolio = summarizeObligationPortfolio(oblAll);
  const obls = filterOpenWorkObligations(oblAll);
  const oblHigh = obls.filter((o) => o.priority === 'High').length;
  const oblOverdue = oblPortfolio.flags.overdueActive;
  const oblUnmapped = obls.filter((o) => o.coverage === 'None').length;

  const calEvents = scenarioFilter(state.calendarEvents);
  const in30 = calEvents.filter((e) => e.date >= today && e.date <= '2026-11-06').length;

  const actions = scenarioFilter(state.actions);
  const actionsOpen = actions.filter((a) => a.status !== 'Complete').length;
  const actionsOverdue = actions.filter((a) => a.status === 'Overdue').length;

  const risks = scenarioFilter(state.risks);
  const controls = scenarioFilter(state.controls);
  const policies = scenarioFilter(state.policies);
  const evidence = scenarioFilter(state.evidence);

  const intakePubs = pubs.filter(isIntakeCandidate);
  const demoUser = state.currentDemoUserId;
  const myWork = buildWorkQueue(state, state.scenarioId).filter((w) => w.ownerId === demoUser);

  return {
    intakeNew: intakePubs.filter((p) => p.triageStatus === 'New').length,
    intakeHighRelevance: intakePubs.filter((p) => (p.aiRelevanceScore || 0) >= 80).length,
    intakeAwaitingTriage: intakePubs.filter((p) => ['New', 'AI Analysed', 'Review Required', 'Assigned', 'In Review'].includes(p.triageStatus)).length,
    escalations: intakePubs.filter((p) => p.triageStatus === 'Escalated' || p.escalated).length + actions.filter((a) => a.status === 'Overdue').length,
    myWorkCount: myWork.length,
    pipeline: pipelineCounts(state, state.scenarioId),
    newChanges: pubs.filter((p) => p.workflowStatus !== 'Closed' && p.workflowStatus !== 'Historic' && p.workflowStatus !== 'Complete').length,
    newToday,
    newWeek,
    awaitingReview,
    impactAssessments: ias.filter((a) => !['Complete', 'Approved'].includes(a.status) || a.status === 'Implementation').length,
    iaDraft,
    iaReview,
    iaApproval,
    openObligations: oblPortfolio.counts.ACTIVE,
    oblDraft: oblPortfolio.counts.DRAFT,
    oblInReview: oblPortfolio.counts.REVIEW,
    oblHigh,
    oblOverdue,
    oblUnmapped,
    upcomingDeadlines: in30,
    risksLinked: risks.filter((r) => r.obligationIds?.length).length,
    controlsMapped: controls.filter((c) => c.obligationIds?.length).length,
    policiesImpacted: policies.filter((p) => p.obligationIds?.length || p.reviewRecommended).length,
    evidenceItems: evidence.length,
    actionsOpen,
    actionsOverdue,
  };
}

export function executeMockIngestion() {
  const user = personName(state, state.currentDemoUserId);
  const result = runMockIngestion(state, `Manual mock run (${user})`);
  if (result.ok) notify();
  return result;
}

export async function executeFixtureConnectorRun(connectorId, scenario = null) {
  const user = personName(state, state.currentDemoUserId);
  const result = await runConnectorIngestion(state, {
    connectorId,
    scenario,
    triggeredBy: `Fixture connector run (${user})`,
    modeOverride: CONNECTOR_MODES.FIXTURE,
    limit: 5,
  });
  if (result.ok) notify();
  return result;
}

export async function executeLiveVerification(connectorId) {
  if (!state.platformConfig?.allowLiveRegulatoryVerification) {
    return { ok: false, code: 'LIVE_NOT_ENABLED', error: 'Live regulatory verification is disabled' };
  }
  const user = personName(state, state.currentDemoUserId);
  const result = await runConnectorIngestion(state, {
    connectorId,
    triggeredBy: `Live verification (${user})`,
    modeOverride: CONNECTOR_MODES.LIVE_VERIFICATION,
    limit: 3,
    liveImport: false,
  });
  if (result.ok) notify();
  return result;
}

export function setLiveVerificationEnabled(enabled) {
  if (!state.platformConfig) state.platformConfig = {};
  state.platformConfig.allowLiveRegulatoryVerification = Boolean(enabled);
  notify();
}

export async function importLiveVerificationItem(rawId) {
  const result = await importStagedLiveItem(state, rawId);
  if (result?.status) notify();
  return result;
}

export async function requestAiExecution(payload) {
  const result = await executeAiRequest(state, payload, addAudit);
  if (result.ok || result.executionId) notify();
  return result;
}

export function getAiExecutionById(id) {
  const ex = getAiExecution(state, id);
  if (!ex) return null;
  const tid = state.tenantContext?.tenantId || 'TEN-DEMO-001';
  if (ex.tenantId && ex.tenantId !== tid) return null;
  return ex;
}

export function retryIngestionItem(rawId) {
  const user = personName(state, state.currentDemoUserId);
  const result = retryRawItemProcessing(state, rawId, user);
  if (result.ok) notify();
  return result;
}

export function reviewChangeCandidate(candidateId, action, payload = {}) {
  const user = personName(state, state.currentDemoUserId);
  let result;
  if (action === 'accept') result = acceptChangeCandidate(state, candidateId, user);
  else if (action === 'modify') result = acceptChangeCandidate(state, candidateId, user, payload);
  else if (action === 'reject') result = rejectChangeCandidate(state, candidateId, user, payload.justification);
  if (result?.ok) notify();
  return result;
}

export function setConnectorEnabled(connectorId, enabled) {
  toggleConnectorEnabled(state, connectorId, enabled);
  notify();
}

export function governanceApproveStep(chainId, stepId, comments) {
  const r = approveGovernanceStep(state, chainId, stepId, state.currentDemoUserId, comments, addAudit);
  if (r.ok) notify();
  return r;
}

export function governanceReturnStep(chainId, stepId, comments) {
  const r = returnGovernanceStep(state, chainId, stepId, state.currentDemoUserId, comments, addAudit);
  if (r.ok) notify();
  return r;
}

export function governanceCommitteeApprove(chainId, notes) {
  const r = recordCommitteeDecision(state, chainId, 'Approved with actions', 'RCC-2026-10', notes, state.currentDemoUserId, addAudit);
  if (r.ok) notify();
  return r;
}

export function governanceReviewEvidence(evidenceId, outcome, comments) {
  const r = reviewEvidence(state, evidenceId, outcome, state.currentDemoUserId, comments, addAudit, checkEvidenceReviewerSoD);
  if (r.ok) notify();
  return r;
}

export function governanceCompleteAttestation(attestationId, comments) {
  const r = completeAttestation(state, attestationId, state.currentDemoUserId, comments, addAudit);
  if (r.ok) notify();
  return r;
}

export function governanceCloseChange(changeId, comments) {
  const r = closeRegulatoryChange(state, changeId, state.currentDemoUserId, comments, addAudit);
  if (r.ok) notify();
  return r;
}

export function governanceReopenChange(changeId, reason) {
  const r = reopenRegulatoryChange(state, changeId, reason, state.currentDemoUserId, addAudit);
  if (r.ok) notify();
  return r;
}

export function governanceVersionImpact(publicationId, decision, justification) {
  const r = recordVersionImpactReview(state, publicationId, decision, justification, state.currentDemoUserId, addAudit);
  if (r.ok) notify();
  return r;
}

export function completeFindingRemediation(findingId, comment) {
  const r = _completeFindingRemediation(findingId, comment);
  if (r.ok) notify();
  return r;
}

export function validateAssuranceFinding(findingId, comments) {
  beginCorrelation('CMD-FINDING');
  const perm = assertPermission(state, 'finding.validate', { type: 'Assurance Finding', id: findingId });
  if (!perm.ok) return { ok: false, error: perm.message, code: perm.code };
  const r = _validateFinding(findingId, comments);
  if (r.ok) notify();
  return r;
}

export function completeManagementAttestation(attestationId) {
  const r = completeManagementAttestationMock(attestationId);
  if (r.ok) notify();
  return r;
}

export function finalizeBoardPackReview(packId, comments) {
  const r = _finalizeBoardPackReview(packId, comments);
  if (r.ok) notify();
  return r;
}

export function markAssuranceStaleForChange(changeId, reason) {
  const r = markAssuranceReviewStale(changeId, reason);
  if (r.ok) notify();
  return r;
}

export function setCustomerSectorPreferences(sectorIds) {
  if (!state.customerSectorPreferences) state.customerSectorPreferences = { sectorIds: [], label: 'MY SECTORS' };
  state.customerSectorPreferences.sectorIds = [...new Set(sectorIds)];
  addAudit({
    actor: getDemoUser()?.name || 'Demo user',
    action: 'Updated My Sectors preference',
    entityType: 'Landscape',
    entityId: 'MY-SECTORS',
    details: state.customerSectorPreferences.sectorIds.join(', '),
  });
  notify();
}

export async function generatePublicationAiSummary(publicationId, { live = false } = {}) {
  const res = await _generateAiSummary(state, publicationId, { mode: live ? 'live' : 'fixture' });
  if (res.ok) notify();
  return res;
}

export function acceptPublicationAiSummary(analysisId, notes = '') {
  const res = _acceptAiSummary(state, analysisId, notes);
  if (res.ok) notify();
  return res;
}

export function rejectPublicationAiSummary(analysisId, notes = '') {
  const res = _rejectAiSummary(state, analysisId, notes);
  if (res.ok) notify();
  return res;
}

export async function runChangeAnalysis(publicationId) {
  const res = await generateChangeAnalysis(state, publicationId);
  if (res.ok) notify();
  return res;
}

export async function runIaAi(changeId) {
  const res = await generateImpactAssessmentAi(state, changeId);
  if (res.ok) notify();
  return res;
}

export async function runObligationAi(assessmentId) {
  const res = await generateObligationSuggestions(state, assessmentId);
  if (res.ok) notify();
  return res;
}

export function acceptWorkflowDraft(analysisId, taskType) {
  let res;
  if (taskType === AI_TASK_TYPE.AI_CHANGE_ANALYSIS) res = createDraftChangeFromAnalysis(state, analysisId);
  else if (taskType === AI_TASK_TYPE.AI_IMPACT_ASSESSMENT) res = createDraftIaFromAnalysis(state, analysisId);
  else if (taskType === AI_TASK_TYPE.AI_OBLIGATION_SUGGESTION) res = createDraftObligationFromAnalysis(state, analysisId, 0, {});
  else res = { ok: false, code: 'UNKNOWN_TASK' };
  if (res.ok) notify();
  return res;
}

export function rejectWorkflowDraft(analysisId, notes = '') {
  const res = rejectWorkflowSuggestion(state, analysisId, notes);
  if (res.ok) notify();
  return res;
}

export function setAskRiDraft(value) {
  state._askRiDraft = String(value ?? '');
}

export async function runAskRiQuestion(question) {
  const q = String(question || '').trim();
  if (!q) return { ok: false, code: 'empty_question' };
  if (state._askRiPending) return { ok: false, code: 'ask_ri_in_flight' };

  state._askRiDraft = q;
  state._askRiLastQuestion = q;
  state._askRiPending = true;
  notify();

  try {
    if (isConnectedBackendActive(state)) {
      const res = await submitConnectedAskRi(state, q);
      if (res.ok && res.lastAsk) {
        state._lastAskRi = { ...res.lastAsk, question: q, restoredFromSession: false };
        state._lastAskRiProviderCalls = res.lastAsk.providerCallCount ?? 0;
        saveAskRiSession(state, { question: q, lastAsk: state._lastAskRi });
        if (!res.lastAsk.insufficient && !res.lastAsk.unresolved && !res.lastAsk.zeroQualifiers && !res.lastAsk.technicalError) {
          state._askRiDraft = '';
        }
        return { ok: true, ...state._lastAskRi };
      }
      const authError = res.authError === true;
      const backendError = res.backendError === true || (!authError && !res.ok);
      state._lastAskRi = {
        ok: false,
        connected: true,
        insufficient: false,
        authError,
        backendError,
        errorCode: res.code || 'ask_ri_failed',
        message:
          res.message ||
          (authError
            ? 'Sign in with an organisation role that includes Ask RI read access.'
            : 'Ask RI could not complete on the server. Your question was not answered.'),
        question: q,
        retrieval: { totalMatchingRecords: 0, matchedRecordIds: [], interpretedAs: null },
        providerCallCount: 0,
      };
      return {
        ok: false,
        code: res.code,
        authError,
        backendError,
        insufficient: false,
        message: state._lastAskRi.message,
      };
    }
    if (isConnectedModeIntent(state)) {
      const reconnecting = state.connectivity?.mode === 'connecting';
      const message = reconnecting
        ? 'Connected mode is restoring the FORGENIQ backend session. Retry in a moment.'
        : state.connectivity?.error ||
          'Connected mode is active but the backend is unavailable. Reconnect from Platform architecture or sign in again.';
      state._lastAskRi = {
        ok: false,
        connected: true,
        technicalError: true,
        insufficient: false,
        message,
        question: q,
        providerCallCount: 0,
      };
      return { ok: false, technicalError: true, connected: true, message };
    }
    const res = await askRi(state, q);
    state._lastAskRi = res;
    state._lastAskRiProviderCalls =
      res.providerCallCount ?? (res.insufficient || res.zeroQualifiers || res.unresolved ? 0 : 1);
    if (res.ok !== false && !res.insufficient && !res.unresolved && !res.zeroQualifiers) {
      state._askRiDraft = '';
    }
    return res;
  } finally {
    state._askRiPending = false;
    notify();
  }
}

export async function runAskRiComparison() {
  const blocked = blockConnectedModeMutation();
  if (blocked) return blocked;
  const res = await compareRegulatoryText(state);
  if (res.ok) notify();
  return res;
}

export async function runAskRiBoardSummary() {
  const blocked = blockConnectedModeMutation();
  if (blocked) return blocked;
  const res = await generateExecutiveSummary(state, { period: '2026-Q3', board: true });
  if (res.ok) notify();
  return res;
}

export function acceptAskRiBoardSummary(analysisId) {
  const res = acceptExecutiveSummaryReview(state, analysisId);
  if (res.ok) notify();
  return res;
}

export { buildWorkQueue, buildNotifications, pipelineCounts, personName, DEMO_TODAY };

export {
  routeForRecord,
  getCanonicalForwardChain,
  buildTraceFrom,
  getDashboardTraceBlocks,
  buildCanonicalChainForChange,
  SCENARIO_ANCHOR_CHANGES,
} from './relationships.js';
