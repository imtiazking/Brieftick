/**
 * Step 81C — load global catalogue + tenant overlay for connected mode (no mock fallback).
 */
import { isConnectedBackendActive } from './connected-mode.js';
import { notify } from '../store.js';
import { coerceInflightPromise } from './schedule-async.js';
import { savePersistedJson, STORAGE_KEY_V2 } from './platform-persistence.js';
import { persistableLabState } from './ask-ri-session.mjs';

const EMPTY = {
  status: 'idle',
  error: null,
  publications: [],
  changes: [],
  impactAssessments: [],
  obligations: [],
  risks: [],
  controls: [],
  policies: [],
  evidence: [],
  findings: [],
  assuranceReviews: [],
  actions: [],
  workflowEvents: [],
  aiAnalysisRuns: [],
  authorisedUatAiAnalysisRuns: [],
  aiAnalysisProvenance: null,
  authorisedUatChanges: [],
  authorisedUatObligations: [],
  authorisedUatImpacts: [],
  authorisedUatRisks: [],
  authorisedUatControls: [],
  authorisedUatActions: [],
  authorisedUatEvidence: [],
  authorisedUatFindings: [],
  findingDetailsById: {},
  findingProvenance: null,
  evidenceProvenance: null,
  actionProvenance: null,
  impactProvenance: null,
  riskProvenance: null,
  controlProvenance: null,
  unverifiedAuditChanges: [],
  changeProvenance: null,
  governanceMetrics: null,
  detailsById: {},
  changeDetailsById: {},
  entityWorkflowEventsByKey: {},
  assessmentDetailsById: {},
  obligationDetailsById: {},
  riskDetailsById: {},
  controlDetailsById: {},
  actionDetailsById: {},
  evidenceDetailsById: {},
  tenantWorkCounts: { changes: 0, impacts: 0, obligations: 0, risks: 0, controls: 0 },
  tenantGovernanceCounts: {
    risks: 0,
    controls: 0,
    policies: 0,
    evidence: 0,
    findings: 0,
    assuranceReviews: 0,
    actions: 0,
    aiAnalysisRuns: 0,
    workflowEvents: 0,
  },
  regulators: [],
  regulatorySources: [],
  ingestionRuns: [],
  operationalAlerts: [],
  operationsMetrics: null,
  sourceMonitoringSummary: null,
  sourceMonitoringInventoryNote: null,
  boardReport: null,
  ingestionRunDetailsById: {},
  operationsNotes: { notifications: null, snapshots: null },
  orgMembers: [],
  notifications: [],
  notificationsUnreadCount: 0,
  dashboardMetrics: null,
  loadedAt: null,
};

export function initConnectedCatalogueState(state) {
  if (!state.connectedCatalogue) {
    state.connectedCatalogue = { ...EMPTY };
  }
  return state.connectedCatalogue;
}

/** Route optimistic impact rows into operational vs authorised UAT registers (BUS-UAT-011). */
export function mergeImpactCatalogueRow(cat, assessment) {
  if (!assessment?.id) return;
  cat.assessmentDetailsById = cat.assessmentDetailsById || {};
  cat.assessmentDetailsById[assessment.id] = {
    ...cat.assessmentDetailsById[assessment.id],
    ...assessment,
    _connected: true,
  };
  const prov = assessment.dataProvenance;
  const labClass = assessment.labClassification;
  const isOperational =
    prov === 'tenant_operational' || prov === 'regulatory_catalogue' || labClass === 'operational';
  const isUat = prov === 'uat_authorised' || labClass === 'uat_authorised';
  if (isUat) {
    cat.authorisedUatImpacts = cat.authorisedUatImpacts || [];
    const uatIdx = cat.authorisedUatImpacts.findIndex((a) => a.id === assessment.id);
    if (uatIdx >= 0) {
      cat.authorisedUatImpacts[uatIdx] = {
        ...cat.authorisedUatImpacts[uatIdx],
        ...assessment,
        _connected: true,
      };
    } else {
      cat.authorisedUatImpacts.unshift({ ...assessment, _connected: true });
    }
    return;
  }
  if (!isOperational) return;
  const idx = (cat.impactAssessments || []).findIndex((a) => a.id === assessment.id);
  if (idx >= 0) {
    cat.impactAssessments[idx] = { ...cat.impactAssessments[idx], ...assessment, _connected: true };
  } else {
    cat.impactAssessments = cat.impactAssessments || [];
    cat.impactAssessments.unshift({ ...assessment, _connected: true });
  }
  cat.tenantWorkCounts = {
    ...(cat.tenantWorkCounts || {}),
    impacts: cat.impactAssessments.length,
  };
}

function isOperationalLabRow(row) {
  const p = row?.dataProvenance;
  const lab = row?.labClassification;
  return p === 'tenant_operational' || p === 'regulatory_catalogue' || lab === 'operational';
}

function isAuthorisedUatLabRow(row) {
  return row?.dataProvenance === 'uat_authorised' || row?.labClassification === 'uat_authorised';
}

/** Merge risk row into operational vs authorised UAT registers (BUS-UAT-012). */
export function mergeRiskCatalogueRow(cat, risk) {
  if (!risk?.id) return;
  cat.riskDetailsById = cat.riskDetailsById || {};
  cat.riskDetailsById[risk.id] = { ...cat.riskDetailsById[risk.id], ...risk, _connected: true };
  if (isAuthorisedUatLabRow(risk)) {
    cat.authorisedUatRisks = cat.authorisedUatRisks || [];
    const uatIdx = cat.authorisedUatRisks.findIndex((x) => x.id === risk.id);
    if (uatIdx >= 0) cat.authorisedUatRisks[uatIdx] = { ...cat.authorisedUatRisks[uatIdx], ...risk, _connected: true };
    else cat.authorisedUatRisks.unshift({ ...risk, _connected: true });
    return;
  }
  if (!isOperationalLabRow(risk)) return;
  const idx = (cat.risks || []).findIndex((r) => r.id === risk.id);
  if (idx >= 0) cat.risks[idx] = { ...cat.risks[idx], ...risk, _connected: true };
  else {
    cat.risks = cat.risks || [];
    cat.risks.unshift({ ...risk, _connected: true });
  }
  cat.tenantWorkCounts = {
    ...(cat.tenantWorkCounts || {}),
    risks: (cat.risks || []).filter(isOperationalLabRow).length,
  };
}

/** Merge finding row into operational vs authorised UAT registers (BUS-UAT-015). */
export function mergeFindingCatalogueRow(cat, finding) {
  if (!finding?.id) return;
  if (isAuthorisedUatLabRow(finding)) {
    cat.authorisedUatFindings = cat.authorisedUatFindings || [];
    const uatIdx = cat.authorisedUatFindings.findIndex((x) => x.id === finding.id);
    if (uatIdx >= 0)
      cat.authorisedUatFindings[uatIdx] = { ...cat.authorisedUatFindings[uatIdx], ...finding, _connected: true };
    else cat.authorisedUatFindings.unshift({ ...finding, _connected: true });
    return;
  }
  if (!isOperationalLabRow(finding)) return;
  const idx = (cat.findings || []).findIndex((f) => f.id === finding.id);
  if (idx >= 0) cat.findings[idx] = { ...cat.findings[idx], ...finding, _connected: true };
  else {
    cat.findings = cat.findings || [];
    cat.findings.unshift({ ...finding, _connected: true });
  }
}

/** Merge evidence row into operational vs authorised UAT registers (BUS-UAT-014). */
export function mergeEvidenceCatalogueRow(cat, evidence) {
  if (!evidence?.id) return;
  if (isAuthorisedUatLabRow(evidence)) {
    cat.authorisedUatEvidence = cat.authorisedUatEvidence || [];
    const uatIdx = cat.authorisedUatEvidence.findIndex((x) => x.id === evidence.id);
    if (uatIdx >= 0)
      cat.authorisedUatEvidence[uatIdx] = { ...cat.authorisedUatEvidence[uatIdx], ...evidence, _connected: true };
    else cat.authorisedUatEvidence.unshift({ ...evidence, _connected: true });
    return;
  }
  if (!isOperationalLabRow(evidence)) return;
  const idx = (cat.evidence || []).findIndex((e) => e.id === evidence.id);
  if (idx >= 0) cat.evidence[idx] = { ...cat.evidence[idx], ...evidence, _connected: true };
  else {
    cat.evidence = cat.evidence || [];
    cat.evidence.unshift({ ...evidence, _connected: true });
  }
  cat.tenantGovernanceCounts = {
    ...(cat.tenantGovernanceCounts || {}),
    evidence: (cat.evidence || []).filter(isOperationalLabRow).length,
  };
}

/** Merge action row into operational vs authorised UAT registers (BUS-UAT-013). */
export function mergeActionCatalogueRow(cat, action) {
  if (!action?.id) return;
  cat.actionDetailsById = cat.actionDetailsById || {};
  cat.actionDetailsById[action.id] = { ...cat.actionDetailsById[action.id], ...action, _connected: true };
  if (isAuthorisedUatLabRow(action)) {
    cat.authorisedUatActions = cat.authorisedUatActions || [];
    const uatIdx = cat.authorisedUatActions.findIndex((x) => x.id === action.id);
    if (uatIdx >= 0)
      cat.authorisedUatActions[uatIdx] = { ...cat.authorisedUatActions[uatIdx], ...action, _connected: true };
    else cat.authorisedUatActions.unshift({ ...action, _connected: true });
    return;
  }
  if (!isOperationalLabRow(action)) return;
  const idx = (cat.actions || []).findIndex((a) => a.id === action.id);
  if (idx >= 0) cat.actions[idx] = { ...cat.actions[idx], ...action, _connected: true };
  else {
    cat.actions = cat.actions || [];
    cat.actions.unshift({ ...action, _connected: true });
  }
  cat.tenantGovernanceCounts = {
    ...(cat.tenantGovernanceCounts || {}),
    actions: (cat.actions || []).filter(isOperationalLabRow).length,
  };
}

/** Merge control row into operational vs authorised UAT registers (BUS-UAT-012). */
export function mergeControlCatalogueRow(cat, control) {
  if (!control?.id) return;
  cat.controlDetailsById = cat.controlDetailsById || {};
  cat.controlDetailsById[control.id] = {
    ...cat.controlDetailsById[control.id],
    ...control,
    _connected: true,
  };
  if (isAuthorisedUatLabRow(control)) {
    cat.authorisedUatControls = cat.authorisedUatControls || [];
    const uatIdx = cat.authorisedUatControls.findIndex((x) => x.id === control.id);
    if (uatIdx >= 0)
      cat.authorisedUatControls[uatIdx] = { ...cat.authorisedUatControls[uatIdx], ...control, _connected: true };
    else cat.authorisedUatControls.unshift({ ...control, _connected: true });
    return;
  }
  if (!isOperationalLabRow(control)) return;
  const idx = (cat.controls || []).findIndex((c) => c.id === control.id);
  if (idx >= 0) cat.controls[idx] = { ...cat.controls[idx], ...control, _connected: true };
  else {
    cat.controls = cat.controls || [];
    cat.controls.unshift({ ...control, _connected: true });
  }
  cat.tenantWorkCounts = {
    ...(cat.tenantWorkCounts || {}),
    controls: (cat.controls || []).filter(isOperationalLabRow).length,
  };
}

/** Merge obligation row into operational vs authorised UAT tenant-work registers. */
export function mergeObligationCatalogueRow(cat, obligation) {
  if (!obligation?.id) return;
  cat.obligationDetailsById = cat.obligationDetailsById || {};
  cat.obligationDetailsById[obligation.id] = {
    ...cat.obligationDetailsById[obligation.id],
    ...obligation,
    _connected: true,
  };
  if (isAuthorisedUatLabRow(obligation)) {
    cat.authorisedUatObligations = cat.authorisedUatObligations || [];
    const uatIdx = cat.authorisedUatObligations.findIndex((o) => o.id === obligation.id);
    if (uatIdx >= 0) {
      cat.authorisedUatObligations[uatIdx] = {
        ...cat.authorisedUatObligations[uatIdx],
        ...obligation,
        _connected: true,
      };
    } else {
      cat.authorisedUatObligations.unshift({ ...obligation, _connected: true });
    }
    return;
  }
  if (!isOperationalLabRow(obligation)) return;
  const idx = (cat.obligations || []).findIndex((o) => o.id === obligation.id);
  if (idx >= 0) cat.obligations[idx] = { ...cat.obligations[idx], ...obligation, _connected: true };
  else {
    cat.obligations = cat.obligations || [];
    cat.obligations.unshift({ ...obligation, _connected: true });
  }
  cat.tenantWorkCounts = {
    ...(cat.tenantWorkCounts || {}),
    obligations: (cat.obligations || []).filter(isOperationalLabRow).length,
  };
}

export function getConnectedCatalogue(state) {
  return state.connectedCatalogue || EMPTY;
}

export function isConnectedCatalogueReady(state) {
  return isConnectedBackendActive(state) && state.connectedCatalogue?.status === 'ready';
}

export function isConnectedCatalogueLoading(state) {
  return isConnectedBackendActive(state) && state.connectedCatalogue?.status === 'loading';
}

export function clearConnectedCatalogue(state) {
  state.connectedCatalogue = { ...EMPTY };
}

function apiBase(state) {
  return state.platformConfig?.apiBaseUrl || '/api/ri-lab';
}

const LAB_DATA_SCOPE_QUERY = 'dataScope=operational';

function scopedApiUrl(base, path) {
  const sep = path.includes('?') ? '&' : '?';
  return `${base}${path}${sep}${LAB_DATA_SCOPE_QUERY}`;
}

export async function loadConnectedCatalogue(state) {
  if (!isConnectedBackendActive(state)) {
    return { ok: false, reason: 'not_connected' };
  }
  const cat = initConnectedCatalogueState(state);
  if (cat._loadInflight) {
    return cat._loadInflight;
  }
  if (cat.status === 'loading') {
    cat.status = 'idle';
  }

  cat._loadInflight = loadConnectedCatalogueInner(state, cat).finally(() => {
    delete cat._loadInflight;
  });
  return cat._loadInflight;
}

async function loadConnectedCatalogueInner(state, cat) {
  cat.status = 'loading';
  cat.error = null;
  notify();

  const base = apiBase(state).replace(/\/$/, '');
  try {
    const [pubRes, workRes, govRes, opsRes, membersRes] = await Promise.all([
      fetch(scopedApiUrl(base, '/publications'), { credentials: 'same-origin', headers: { Accept: 'application/json' } }),
      fetch(scopedApiUrl(base, '/tenant-work'), { credentials: 'same-origin', headers: { Accept: 'application/json' } }),
      fetch(scopedApiUrl(base, '/tenant-governance'), { credentials: 'same-origin', headers: { Accept: 'application/json' } }),
      fetch(`${base}/tenant-operations`, { credentials: 'same-origin', headers: { Accept: 'application/json' } }),
      fetch(`${base}/tenant-members`, { credentials: 'same-origin', headers: { Accept: 'application/json' } }),
    ]);
    const pubBody = await pubRes.json().catch(() => ({}));
    const workBody = await workRes.json().catch(() => ({}));
    const govBody = await govRes.json().catch(() => ({}));
    const opsBody = await opsRes.json().catch(() => ({}));
    const membersBody = await membersRes.json().catch(() => ({}));

    if (!pubRes.ok || !pubBody.ok) {
      const err = new Error(pubBody.error || pubBody.message || `publications_http_${pubRes.status}`);
      err.status = pubRes.status;
      throw err;
    }
    if (!workRes.ok || !workBody.ok) {
      const err = new Error(workBody.error || workBody.message || `tenant_work_http_${workRes.status}`);
      err.status = workRes.status;
      throw err;
    }
    if (!govRes.ok || !govBody.ok) {
      const err = new Error(govBody.error || govBody.message || `tenant_governance_http_${govRes.status}`);
      err.status = govRes.status;
      throw err;
    }
    if (!opsRes.ok || !opsBody.ok) {
      const err = new Error(opsBody.error || opsBody.message || `tenant_operations_http_${opsRes.status}`);
      err.status = opsRes.status;
      throw err;
    }

    cat.publications = Array.isArray(pubBody.publications) ? pubBody.publications : [];
    cat.changes = Array.isArray(workBody.changes) ? workBody.changes : [];
    cat.authorisedUatChanges = Array.isArray(workBody.authorisedUatChanges)
      ? workBody.authorisedUatChanges
      : [];
    cat.authorisedUatObligations = Array.isArray(workBody.authorisedUatObligations)
      ? workBody.authorisedUatObligations
      : [];
    cat.authorisedUatImpacts = Array.isArray(workBody.authorisedUatImpacts)
      ? workBody.authorisedUatImpacts
      : [];
    cat.authorisedUatRisks = Array.isArray(workBody.authorisedUatRisks) ? workBody.authorisedUatRisks : [];
    cat.authorisedUatControls = Array.isArray(workBody.authorisedUatControls) ? workBody.authorisedUatControls : [];
    cat.impactProvenance = workBody.impactProvenance ?? null;
    cat.riskProvenance = workBody.riskProvenance ?? null;
    cat.controlProvenance = workBody.controlProvenance ?? null;
    cat.unverifiedAuditChanges = Array.isArray(workBody.unverifiedAuditChanges)
      ? workBody.unverifiedAuditChanges
      : [];
    cat.changeProvenance = workBody.changeProvenance ?? null;
    cat.impactAssessments = Array.isArray(workBody.impactAssessments) ? workBody.impactAssessments : [];
    cat.obligations = Array.isArray(workBody.obligations) ? workBody.obligations : [];
    cat.tenantWorkCounts = {
      changes: workBody.changeCount ?? cat.changes.length,
      impacts: workBody.impactAssessmentCount ?? cat.impactAssessments.length,
      obligations: workBody.obligationCount ?? cat.obligations.length,
      risks: workBody.riskCount ?? cat.risks?.length ?? 0,
      controls: workBody.controlCount ?? cat.controls?.length ?? 0,
    };
    cat.risks = Array.isArray(workBody.risks)
      ? workBody.risks
      : Array.isArray(govBody.risks)
        ? govBody.risks
        : [];
    cat.controls = Array.isArray(workBody.controls)
      ? workBody.controls
      : Array.isArray(govBody.controls)
        ? govBody.controls
        : [];
    cat.policies = Array.isArray(govBody.policies) ? govBody.policies : [];
    cat.evidence = Array.isArray(govBody.evidence) ? govBody.evidence : [];
    cat.findings = Array.isArray(govBody.findings) ? govBody.findings : [];
    cat.assuranceReviews = Array.isArray(govBody.assuranceReviews) ? govBody.assuranceReviews : [];
    cat.actions = Array.isArray(govBody.actions) ? govBody.actions : [];
    cat.authorisedUatActions = Array.isArray(govBody.authorisedUatActions) ? govBody.authorisedUatActions : [];
    cat.authorisedUatEvidence = Array.isArray(govBody.authorisedUatEvidence) ? govBody.authorisedUatEvidence : [];
    cat.authorisedUatFindings = Array.isArray(govBody.authorisedUatFindings) ? govBody.authorisedUatFindings : [];
    cat.findingProvenance = govBody.findingProvenance ?? null;
    cat.evidenceProvenance = govBody.evidenceProvenance ?? null;
    cat.actionProvenance = govBody.actionProvenance ?? null;
    cat.workflowEvents = Array.isArray(govBody.workflowEvents) ? govBody.workflowEvents : [];
    cat.aiAnalysisRuns = Array.isArray(govBody.aiAnalysisRuns) ? govBody.aiAnalysisRuns : [];
    cat.authorisedUatAiAnalysisRuns = Array.isArray(govBody.authorisedUatAiAnalysisRuns)
      ? govBody.authorisedUatAiAnalysisRuns
      : [];
    cat.aiAnalysisProvenance = govBody.aiAnalysisProvenance ?? null;
    cat.governanceMetrics = govBody.governanceMetrics ?? null;
    cat.operationsMetrics = opsBody.operationsMetrics ?? null;
    cat.sourceMonitoringSummary = opsBody.sourceMonitoringSummary ?? null;
    cat.sourceMonitoringInventoryNote = opsBody.sourceMonitoringInventoryNote ?? null;
    cat.regulators = Array.isArray(opsBody.regulators) ? opsBody.regulators : [];
    cat.regulatorySources = Array.isArray(opsBody.regulatorySources) ? opsBody.regulatorySources : [];
    cat.ingestionRuns = Array.isArray(opsBody.ingestionRuns) ? opsBody.ingestionRuns : [];
    cat.operationalAlerts = Array.isArray(opsBody.operationalAlerts) ? opsBody.operationalAlerts : [];
    cat.operationsNotes = {
      notifications: opsBody.notificationsNote ?? null,
      snapshots: opsBody.snapshotsNote ?? null,
    };
    cat.orgMembers =
      membersRes.ok && membersBody.ok && Array.isArray(membersBody.members) ? membersBody.members : [];
    try {
      const [notifRes, dashRes] = await Promise.all([
        fetch(`${base}/notifications`, { credentials: 'same-origin', headers: { Accept: 'application/json' } }),
        fetch(scopedApiUrl(base, '/dashboard'), { credentials: 'same-origin', headers: { Accept: 'application/json' } }),
      ]);
      const notifBody = await notifRes.json().catch(() => ({}));
      const dashBody = await dashRes.json().catch(() => ({}));
      if (notifRes.ok && notifBody.ok) {
        cat.notifications = notifBody.notifications || [];
        cat.notificationsUnreadCount = notifBody.unreadCount ?? 0;
        cat.operationsNotes = {
          ...(cat.operationsNotes || {}),
          notifications: notifBody.externalDeliveryDisabled
            ? 'In-app tenant notifications via /api/ri-lab/notifications (external delivery disabled).'
            : null,
        };
      }
      if (dashRes.ok && dashBody.ok) {
        cat.dashboardMetrics = dashBody;
        cat.excludedSyntheticUat = {
          ...(cat.excludedSyntheticUat || {}),
          ...(dashBody.excludedSyntheticUat || {}),
        };
      }
    } catch {
      /* dashboard/notifications optional until staging migration applied */
    }
    cat.tenantGovernanceCounts = {
      risks: govBody.riskCount ?? cat.risks.length,
      controls: govBody.controlCount ?? cat.controls.length,
      policies: govBody.policyCount ?? cat.policies.length,
      evidence: govBody.evidenceCount ?? cat.evidence.length,
      findings: govBody.findingCount ?? cat.findings.length,
      assuranceReviews: govBody.assuranceReviewCount ?? cat.assuranceReviews.length,
      actions: govBody.actionCount ?? cat.actions.length,
      aiAnalysisRuns: govBody.aiAnalysisRunCount ?? cat.aiAnalysisRuns.length,
      workflowEvents: govBody.workflowEventCount ?? cat.workflowEvents.length,
    };
    cat.status = 'ready';
    cat.loadedAt = new Date().toISOString();
    cat.dataScope = workBody.dataScope || pubBody.dataScope || 'operational';
    cat.excludedSyntheticUat = {
      ...(pubBody.excludedSyntheticUat || {}),
      ...(workBody.excludedSyntheticUat || {}),
      ...(govBody.excludedSyntheticUat || {}),
    };
    cat.error = null;
    savePersistedJson(STORAGE_KEY_V2, persistableLabState(state));
    notify();
    return { ok: true, total: cat.publications.length };
  } catch (e) {
    cat.status = 'error';
    cat.publications = [];
    cat.changes = [];
    cat.authorisedUatChanges = [];
    cat.authorisedUatObligations = [];
    cat.authorisedUatImpacts = [];
    cat.authorisedUatRisks = [];
    cat.authorisedUatControls = [];
    cat.authorisedUatActions = [];
    cat.authorisedUatEvidence = [];
    cat.actionProvenance = null;
    cat.impactProvenance = null;
    cat.riskProvenance = null;
    cat.controlProvenance = null;
    cat.unverifiedAuditChanges = [];
    cat.changeProvenance = null;
    cat.impactAssessments = [];
    cat.obligations = [];
    cat.risks = [];
    cat.controls = [];
    cat.policies = [];
    cat.evidence = [];
    cat.findings = [];
    cat.assuranceReviews = [];
    cat.actions = [];
    cat.workflowEvents = [];
    cat.aiAnalysisRuns = [];
    cat.authorisedUatAiAnalysisRuns = [];
    cat.aiAnalysisProvenance = null;
    cat.governanceMetrics = null;
    cat.regulators = [];
    cat.regulatorySources = [];
    cat.ingestionRuns = [];
    cat.operationalAlerts = [];
    cat.operationsMetrics = null;
    cat.sourceMonitoringSummary = null;
    cat.sourceMonitoringInventoryNote = null;
    cat.operationsNotes = { notifications: null, snapshots: null };
    cat.ingestionRunDetailsById = {};
    cat.error = e instanceof Error ? e.message : String(e);
    savePersistedJson(STORAGE_KEY_V2, persistableLabState(state));
    notify();
    return { ok: false, error: cat.error };
  }
}

export async function ensureConnectedCatalogueLoaded(state) {
  if (!isConnectedBackendActive(state)) return { ok: true, skipped: true };
  const cat = getConnectedCatalogue(state);
  if (cat.status === 'ready' && connectedCatalogueHasStaleFindingLineage(cat)) {
    cat.status = 'idle';
    cat._staleFindingLineageRefresh = true;
  }
  if (cat.status === 'ready') return { ok: true, cached: true };
  if (cat.status === 'error') return { ok: false, error: cat.error };
  return loadConnectedCatalogue(state);
}

function upsertConnectedLabPublication(cat, labPublication) {
  if (!labPublication?.id) return;
  const idx = cat.publications.findIndex((p) => p.id === labPublication.id);
  if (idx >= 0) cat.publications[idx] = labPublication;
  else cat.publications.push(labPublication);
}

/** Whether a finding row exposes risk/control relationship fields for the detail page. */
export function findingHasRelationshipHints(f) {
  if (!f) return false;
  return Boolean(
    f.parentRiskId ||
      f.parentControlId ||
      (f.controlIds && f.controlIds.length) ||
      (f.linkedControls && f.linkedControls.length),
  );
}

/** Authorised UAT finding in catalogue missing lineage that detail API should hydrate. */
export function findingCatalogueRowNeedsDetailLineage(f) {
  if (!f?.id) return false;
  const uat =
    f.dataProvenance === 'uat_authorised' ||
    f.labClassification === 'uat_authorised' ||
    f.recordProvenance === 'uat_authorised';
  if (!uat) return false;
  return !findingHasRelationshipHints(f);
}

function connectedCatalogueHasStaleFindingLineage(cat) {
  if (!cat) return false;
  const lists = [...(cat.authorisedUatFindings || []), ...(cat.findings || [])];
  return lists.some((f) => findingCatalogueRowNeedsDetailLineage(f));
}

/**
 * Fetch entity detail once per id (avoids renderShell ↔ notify ↔ refetch loops).
 * @returns {Promise<unknown>} resolves with cached or freshly loaded detail
 */
function findingDetailHasLineage(cached) {
  if (!cached) return false;
  return Boolean(
    cached.parentRiskId ||
      cached.parentControlId ||
      (cached.controlIds && cached.controlIds.length) ||
      (cached.linkedControls && cached.linkedControls.length) ||
      cached._detailLoadError,
  );
}

function scheduleConnectedDetailFetch(state, detailsKey, id, fetcher) {
  const cat = initConnectedCatalogueState(state);
  const cached = cat[detailsKey]?.[id];
  if (cached) {
    const needsHydration = detailsKey === 'evidenceDetailsById' || detailsKey === 'findingDetailsById';
    let hydrated = !needsHydration || cached._detailHydrated === true;
    if (needsHydration && detailsKey === 'findingDetailsById' && cached._detailHydrated === true) {
      if (!findingDetailHasLineage(cached)) hydrated = false;
    }
    if (hydrated) return Promise.resolve(cached);
  }
  cat._detailInflight = cat._detailInflight || {};
  const token = `${detailsKey}:${id}`;
  const inflight = coerceInflightPromise(cat._detailInflight[token]);
  if (inflight) return inflight;
  if (cat._detailInflight[token]) delete cat._detailInflight[token];
  cat._detailInflight[token] = fetcher(state, id).finally(() => {
    delete cat._detailInflight[token];
  });
  return cat._detailInflight[token];
}

export function scheduleConnectedChangeDetailFetch(state, changeId) {
  return scheduleConnectedDetailFetch(state, 'changeDetailsById', changeId, fetchConnectedChangeDetail);
}

export function scheduleConnectedAssessmentDetailFetch(state, assessmentId) {
  return scheduleConnectedDetailFetch(state, 'assessmentDetailsById', assessmentId, fetchConnectedAssessmentDetail);
}

export function scheduleConnectedObligationDetailFetch(state, obligationId) {
  return scheduleConnectedDetailFetch(state, 'obligationDetailsById', obligationId, fetchConnectedObligationDetail);
}

export function scheduleConnectedRiskDetailFetch(state, riskId) {
  return scheduleConnectedDetailFetch(state, 'riskDetailsById', riskId, fetchConnectedRiskDetail);
}

export function scheduleConnectedControlDetailFetch(state, controlId) {
  return scheduleConnectedDetailFetch(state, 'controlDetailsById', controlId, fetchConnectedControlDetail);
}

export function scheduleConnectedIngestionRunDetailFetch(state, runId) {
  return scheduleConnectedDetailFetch(state, 'ingestionRunDetailsById', runId, fetchConnectedIngestionRunDetail);
}

export function scheduleConnectedPublicationDetailFetch(state, publicationId) {
  const cat = initConnectedCatalogueState(state);
  if (cat.detailsById?.[publicationId]) {
    return Promise.resolve(cat.detailsById[publicationId]);
  }
  cat._detailInflight = cat._detailInflight || {};
  const token = `detailsById:${publicationId}`;
  const inflight = coerceInflightPromise(cat._detailInflight[token]);
  if (inflight) return inflight;
  if (cat._detailInflight[token]) delete cat._detailInflight[token];
  cat._detailInflight[token] = fetchConnectedPublicationDetail(state, publicationId).finally(() => {
    delete cat._detailInflight[token];
  });
  return cat._detailInflight[token];
}

export async function fetchConnectedChangeDetail(state, changeId) {
  const cat = initConnectedCatalogueState(state);
  const base = apiBase(state).replace(/\/$/, '');
  const res = await fetch(`${base}/changes/${encodeURIComponent(changeId)}`, {
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) {
    const err = new Error(body.error || 'change_detail_failed');
    err.status = res.status;
    throw err;
  }
  if (body.change) {
    const merged = { ...body.change, _connected: true };
    cat.changeDetailsById[changeId] = merged;
    const idx = cat.changes.findIndex((c) => c.id === changeId);
    if (idx >= 0) cat.changes[idx] = { ...cat.changes[idx], ...merged };
    else {
      const uatIdx = cat.authorisedUatChanges?.findIndex((c) => c.id === changeId) ?? -1;
      if (uatIdx >= 0) {
        cat.authorisedUatChanges[uatIdx] = { ...cat.authorisedUatChanges[uatIdx], ...merged };
      } else {
        const unvIdx = cat.unverifiedAuditChanges?.findIndex((c) => c.id === changeId) ?? -1;
        if (unvIdx >= 0) {
          cat.unverifiedAuditChanges[unvIdx] = { ...cat.unverifiedAuditChanges[unvIdx], ...merged };
        }
      }
    }
  }
  savePersistedJson(STORAGE_KEY_V2, persistableLabState(state));
  notify();
  return body.change;
}

export async function fetchConnectedAssessmentDetail(state, assessmentId) {
  const cat = initConnectedCatalogueState(state);
  const base = apiBase(state).replace(/\/$/, '');
  const res = await fetch(`${base}/impact-assessments/${encodeURIComponent(assessmentId)}`, {
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) {
    const err = new Error(body.error || 'assessment_detail_failed');
    err.status = res.status;
    throw err;
  }
  if (body.assessment) {
    const merged = { ...body.assessment, _connected: true };
    cat.assessmentDetailsById[assessmentId] = merged;
    mergeImpactCatalogueRow(cat, merged);
  }
  savePersistedJson(STORAGE_KEY_V2, persistableLabState(state));
  notify();
  return body.assessment;
}

export async function fetchConnectedObligationDetail(state, obligationId) {
  const cat = initConnectedCatalogueState(state);
  const base = apiBase(state).replace(/\/$/, '');
  const res = await fetch(`${base}/obligations/${encodeURIComponent(obligationId)}`, {
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) {
    const err = new Error(body.error || 'obligation_detail_failed');
    err.status = res.status;
    throw err;
  }
  if (body.obligation) {
    const merged = { ...body.obligation, _connected: true };
    mergeObligationCatalogueRow(cat, merged);
  }
  savePersistedJson(STORAGE_KEY_V2, persistableLabState(state));
  notify();
  return body.obligation;
}

async function fetchConnectedEntityDetail(state, pathSegment, id, listKey, detailsKey, bodyKey) {
  const cat = initConnectedCatalogueState(state);
  const base = apiBase(state).replace(/\/$/, '');
  const res = await fetch(`${base}/${pathSegment}/${encodeURIComponent(id)}`, {
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) {
    const err = new Error(body.error || `${bodyKey}_detail_failed`);
    err.status = res.status;
    throw err;
  }
  const entity = body[bodyKey];
  if (entity) {
    const merged = { ...entity, _connected: true };
    cat[detailsKey][id] = merged;
    if (listKey === 'risks') mergeRiskCatalogueRow(cat, merged);
    else if (listKey === 'controls') mergeControlCatalogueRow(cat, merged);
    else {
      const list = cat[listKey] || [];
      const idx = list.findIndex((r) => r.id === id);
      if (idx >= 0) list[idx] = { ...list[idx], ...merged };
      else list.push(merged);
      cat[listKey] = list;
    }
  }
  savePersistedJson(STORAGE_KEY_V2, persistableLabState(state));
  notify();
  return entity;
}

export function fetchConnectedRiskDetail(state, riskId) {
  return fetchConnectedEntityDetail(state, 'risks', riskId, 'risks', 'riskDetailsById', 'risk');
}

export function fetchConnectedControlDetail(state, controlId) {
  return fetchConnectedEntityDetail(state, 'controls', controlId, 'controls', 'controlDetailsById', 'control');
}

export async function fetchConnectedActionDetail(state, actionId) {
  const cat = initConnectedCatalogueState(state);
  const base = apiBase(state).replace(/\/$/, '');
  const res = await fetch(`${base}/actions/${encodeURIComponent(actionId)}`, {
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) {
    const err = new Error(body.error || 'action_detail_failed');
    err.status = res.status;
    throw err;
  }
  if (body.action) {
    const merged = { ...body.action, _connected: true };
    mergeActionCatalogueRow(cat, merged);
    cat.actionDetailsById[actionId] = { ...cat.actionDetailsById[actionId], ...merged };
  }
  savePersistedJson(STORAGE_KEY_V2, persistableLabState(state));
  notify();
  return body.action;
}

export function scheduleConnectedActionDetailFetch(state, actionId) {
  return scheduleConnectedDetailFetch(state, 'actionDetailsById', actionId, fetchConnectedActionDetail);
}

export async function fetchConnectedEvidenceDetail(state, evidenceId) {
  const cat = initConnectedCatalogueState(state);
  const base = apiBase(state).replace(/\/$/, '');
  const res = await fetch(`${base}/evidence/${encodeURIComponent(evidenceId)}`, {
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) {
    const err = new Error(body.error || 'evidence_detail_failed');
    err.status = res.status;
    throw err;
  }
  const auditKey = `evidence_item:${evidenceId}`;
  if (cat.entityWorkflowEventsByKey) delete cat.entityWorkflowEventsByKey[auditKey];

  if (body.evidence) {
    const linkedControls = (body.linkedControls ?? body.evidence.linkedControls ?? []).filter((c) => c?.id);
    const merged = {
      ...body.evidence,
      versions: body.versions ?? body.evidence.versions ?? [],
      linkedControls,
      controlIds: body.evidence.controlIds ?? linkedControls.map((c) => c.id),
      _detailHydrated: true,
      _connected: true,
    };
    mergeEvidenceCatalogueRow(cat, merged);
    cat.evidenceDetailsById[evidenceId] = { ...cat.evidenceDetailsById[evidenceId], ...merged };
  }
  savePersistedJson(STORAGE_KEY_V2, persistableLabState(state));
  notify();
  return body.evidence;
}

export function scheduleConnectedEvidenceDetailFetch(state, evidenceId) {
  return scheduleConnectedDetailFetch(state, 'evidenceDetailsById', evidenceId, fetchConnectedEvidenceDetail);
}

export function recordFindingDetailLoadFailure(state, findingId, message) {
  const cat = initConnectedCatalogueState(state);
  cat.findingDetailsById = cat.findingDetailsById || {};
  const fromList =
    cat.findings?.find((f) => f.id === findingId) ||
    cat.authorisedUatFindings?.find((f) => f.id === findingId);
  cat.findingDetailsById[findingId] = {
    ...(fromList || {}),
    ...(cat.findingDetailsById[findingId] || {}),
    id: findingId,
    _detailHydrated: true,
    _detailLoadError: message || 'finding_detail_failed',
    _connected: true,
  };
  savePersistedJson(STORAGE_KEY_V2, persistableLabState(state));
  notify();
}

export async function fetchConnectedFindingDetail(state, findingId) {
  const cat = initConnectedCatalogueState(state);
  const base = apiBase(state).replace(/\/$/, '');
  const res = await fetch(`${base}/findings/${encodeURIComponent(findingId)}`, {
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) {
    const err = new Error(body.error || body.detail || 'finding_detail_failed');
    err.status = res.status;
    throw err;
  }
  const auditKey = `finding:${findingId}`;
  if (cat.entityWorkflowEventsByKey) delete cat.entityWorkflowEventsByKey[auditKey];
  if (cat.entityWorkflowEventsLoadStateByKey) delete cat.entityWorkflowEventsLoadStateByKey[auditKey];
  if (cat.entityWorkflowEventsLoadErrorByKey) delete cat.entityWorkflowEventsLoadErrorByKey[auditKey];

  if (body.finding) {
    const rawMeta = body.detail?.metadata ?? body.finding.metadata ?? null;
    let meta = rawMeta;
    if (typeof rawMeta === 'string') {
      try {
        meta = JSON.parse(rawMeta);
      } catch {
        meta = null;
      }
    }
    const metaRisk =
      typeof meta?.parentRiskId === 'string' ? meta.parentRiskId : body.finding.parentRiskId ?? null;
    const metaControl =
      typeof meta?.parentControlId === 'string' ? meta.parentControlId : body.finding.parentControlId ?? null;
    let linkedControls = (body.linkedControls ?? body.finding.linkedControls ?? []).filter((c) => c?.id);
    if (!linkedControls.length && metaControl) {
      const controls = [...(cat.controls || []), ...(cat.authorisedUatControls || [])];
      const ctrl = controls.find((c) => c.id === metaControl);
      linkedControls = [{ id: metaControl, name: ctrl?.name || ctrl?.title || '' }];
    }
    const linkedActions = (body.linkedActions ?? body.finding.linkedActions ?? []).filter((a) => a?.id);
    const merged = {
      ...body.finding,
      linkedControls,
      linkedActions,
      controlIds: body.finding.controlIds?.length
        ? body.finding.controlIds
        : linkedControls.map((c) => c.id),
      parentControlId: metaControl ?? body.finding.parentControlId ?? null,
      actionIds: body.finding.actionIds ?? linkedActions.map((a) => a.id),
      parentRiskId: body.parentRiskId ?? metaRisk ?? body.finding.parentRiskId ?? null,
      _detailHydrated: true,
      _detailLoadError: null,
      _connected: true,
    };
    mergeFindingCatalogueRow(cat, merged);
    cat.findingDetailsById[findingId] = { ...cat.findingDetailsById[findingId], ...merged };
    savePersistedJson(STORAGE_KEY_V2, persistableLabState(state));
    notify();
    return body.finding;
  }
  const err = new Error('finding_detail_missing_body');
  err.status = res.status;
  throw err;
}

export function scheduleConnectedFindingDetailFetch(state, findingId) {
  const cat = initConnectedCatalogueState(state);
  const fromList =
    cat.findings?.find((f) => f.id === findingId) ||
    cat.authorisedUatFindings?.find((f) => f.id === findingId);
  const cached = cat.findingDetailsById?.[findingId];
  if (fromList && findingCatalogueRowNeedsDetailLineage(fromList)) {
    if (cached?._detailHydrated === true && !findingDetailHasLineage(cached)) {
      delete cat.findingDetailsById[findingId];
    }
  }
  return scheduleConnectedDetailFetch(state, 'findingDetailsById', findingId, fetchConnectedFindingDetail);
}

/** Clear cached detail and refetch (retry after load error). */
export function forceRefetchConnectedFindingDetail(state, findingId) {
  const cat = initConnectedCatalogueState(state);
  if (cat.findingDetailsById) delete cat.findingDetailsById[findingId];
  if (cat._detailInflight) delete cat._detailInflight[`findingDetailsById:${findingId}`];
  const auditKey = `finding:${findingId}`;
  if (cat.entityWorkflowEventsByKey) delete cat.entityWorkflowEventsByKey[auditKey];
  if (cat.entityWorkflowEventsLoadStateByKey) delete cat.entityWorkflowEventsLoadStateByKey[auditKey];
  if (cat.entityWorkflowEventsLoadErrorByKey) delete cat.entityWorkflowEventsLoadErrorByKey[auditKey];
  return scheduleConnectedFindingDetailFetch(state, findingId);
}

export async function fetchConnectedIngestionRunDetail(state, runId) {
  const cat = initConnectedCatalogueState(state);
  const base = apiBase(state).replace(/\/$/, '');
  const res = await fetch(`${base}/ingestion-runs/${encodeURIComponent(runId)}`, {
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) {
    const err = new Error(body.error || 'ingestion_run_detail_failed');
    err.status = res.status;
    throw err;
  }
  if (body.run) {
    cat.ingestionRunDetailsById[runId] = { ...body.run, items: body.items ?? [] };
  }
  savePersistedJson(STORAGE_KEY_V2, persistableLabState(state));
  notify();
  return body.run;
}

export async function fetchConnectedPublicationDetail(state, publicationId) {
  const cat = initConnectedCatalogueState(state);
  const base = apiBase(state).replace(/\/$/, '');
  const res = await fetch(`${base}/publications/${encodeURIComponent(publicationId)}`, {
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) {
    const err = new Error(body.error || 'publication_detail_failed');
    err.status = res.status;
    throw err;
  }
  const rawDetail = body.detail ?? body.publication;
  cat.detailsById[publicationId] = rawDetail;
  if (body.labPublication) {
    upsertConnectedLabPublication(cat, body.labPublication);
  }
  savePersistedJson(STORAGE_KEY_V2, persistableLabState(state));
  notify();
  return rawDetail;
}

export function getConnectedAssigneeLabel(state, clerkUserId) {
  if (!clerkUserId) return '—';
  const cat = getConnectedCatalogue(state);
  const hit = cat.orgMembers?.find((m) => m.clerkUserId === clerkUserId);
  return hit?.label || `User ${String(clerkUserId).slice(0, 8)}…`;
}

export function connectedCatalogueBanner(state) {
  const cat = getConnectedCatalogue(state);
  if (!isConnectedBackendActive(state)) return '';
  if (cat.status === 'loading') {
    return '<p class="ri-connected-banner ri-connected-banner--loading">Loading staging catalogue…</p>';
  }
  if (cat.status === 'error') {
    return `<p class="ri-connected-banner ri-connected-banner--error">Connected catalogue unavailable: ${cat.error}. Demo mock data is not shown in connected mode.</p>`;
  }
  if (cat.status === 'ready') {
    const tw = cat.tenantWorkCounts || {};
    const tg = cat.tenantGovernanceCounts || {};
    const writes = state.platformConfig?.writesEnabled ? ' · change writes ON' : ' · read-only';
    const scope = cat.dataScope === 'operational' ? 'operational tenant metrics' : 'all tenant rows';
    const excluded = cat.excludedSyntheticUat || {};
    const excludedTotal = Object.values(excluded).reduce((a, b) => a + (Number(b) || 0), 0);
    const uatNote =
      excludedTotal > 0
        ? ` · ${excludedTotal} labelled UAT row(s) excluded from dashboard (<code>dataScope=operational</code>)`
        : ' · UAT-labelled rows excluded by server filter';
    return `<p class="ri-connected-banner">Connected staging${writes} · ${scope}${uatNote} · Global catalogue (${cat.publications.length} publication${cat.publications.length === 1 ? '' : 's'}) · Operational changes: ${tw.changes ?? 0}${cat.changeProvenance?.uatAuthorised ? ` · ${cat.changeProvenance.uatAuthorised} UAT audit change(s)` : ''} · ${tw.impacts ?? cat.impactAssessments?.length ?? 0} assessment(s) · ${tw.obligations ?? cat.obligations?.length ?? 0} obligation(s) · GRC: ${tg.risks ?? 0} risk(s) · ${tg.controls ?? 0} control(s) · ${tg.assuranceReviews ?? 0} assurance · ${tg.workflowEvents ?? 0} workflow event(s)</p>`;
  }
  return '';
}
