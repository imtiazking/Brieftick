import { SCENARIOS } from './seed-data.js';
import { migratePersistedState, createFreshState, clearAllLabStorage } from './migrate.js';
import { STORAGE_KEY_V2, savePersistedJson } from './platform/platform-persistence.js';
import { getTenantContext } from './platform/platform-tenant.js';
import { getCorrelationId, beginCorrelation } from './platform/platform-correlation.js';
import { assertPermission } from './platform/platform-permissions.js';
import { filterByScenario } from './relationships.js';
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

let state = null;
const listeners = new Set();

export function initStore() {
  state = migratePersistedState();
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

function notify() {
  syncGraphLinks(state);
  savePersistedJson(STORAGE_KEY_V2, state);
  listeners.forEach((fn) => fn(state));
}

export function resetStore() {
  clearAllLabStorage();
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
  return filterByScenario(items, state.scenarioId);
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
  return state.publications.find((p) => p.id === id);
}

export function getChange(id) {
  return state.changes.find((c) => c.id === id);
}

export function getAssessment(id) {
  return state.assessments.find((a) => a.id === id);
}

export function getObligation(id) {
  return state.obligations.find((o) => o.id === id);
}

export function getRisk(id) {
  return state.risks.find((r) => r.id === id);
}

export function getControl(id) {
  return state.controls.find((c) => c.id === id);
}

export function getPolicy(id) {
  return state.policies.find((p) => p.id === id);
}

export function getAction(id) {
  return state.actions.find((a) => a.id === id);
}

export function getEvidence(id) {
  return state.evidence.find((e) => e.id === id);
}

export function computeDashboardStats() {
  const pubs = scenarioFilter(state.publications);
  const today = '2026-10-07';
  const weekStart = '2026-10-01';
  const newToday = pubs.filter((p) => p.publishedDate === today).length;
  const newWeek = pubs.filter((p) => p.publishedDate >= weekStart).length;
  const awaitingReview = pubs.filter((p) => p.unreviewed || p.workflowStatus === 'Awaiting Review' || p.workflowStatus === 'New').length;

  const ias = scenarioFilter(state.assessments);
  const iaDraft = ias.filter((a) => a.status === 'Draft').length;
  const iaReview = ias.filter((a) => a.status === 'Review' || a.status === 'Under Review').length;
  const iaApproval = ias.filter((a) => a.status === 'Awaiting Approval').length;

  const obls = scenarioFilter(state.obligations).filter((o) => o.status !== 'Complete' && o.status !== 'Historic');
  const oblHigh = obls.filter((o) => o.priority === 'High').length;
  const oblOverdue = obls.filter((o) => o.status === 'Overdue').length;
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
    openObligations: obls.length,
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

export { buildWorkQueue, buildNotifications, pipelineCounts, personName, DEMO_TODAY };

export {
  routeForRecord,
  getCanonicalForwardChain,
  buildTraceFrom,
  getDashboardTraceBlocks,
  buildCanonicalChainForChange,
  SCENARIO_ANCHOR_CHANGES,
} from './relationships.js';
