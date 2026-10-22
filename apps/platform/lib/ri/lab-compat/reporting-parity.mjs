/**
 * Management / board reporting metrics — golden master from lab-shaped state.
 */
import { classifyObligationPrimaryStatus } from './obligation-portfolio.mjs';
import { labActionIsOverdue } from './action-overdue-parity.mjs';
import { governanceMetricsFromLabState } from './governance-parity.mjs';

function filterByScenario(items, scenarioId) {
  if (!scenarioId || scenarioId === 'all') return items || [];
  return (items || []).filter((i) => i.scenario === scenarioId);
}

function pipelineCounts(state, scenarioId) {
  const pubs = filterByScenario(state.publications, scenarioId || state.scenarioId);
  return {
    new: pubs.filter((p) => p.triageStatus === 'New' || p.workflowStatus === 'New').length,
    inTriage: pubs.filter((p) =>
      ['AI Analysed', 'Review Required', 'Assigned', 'In Review'].includes(p.triageStatus),
    ).length,
    applicability: pubs.filter(
      (p) => p.workflowStatus === 'Awaiting Review' || p.workflowStatus === 'Assessment Required',
    ).length,
    impact: filterByScenario(state.assessments, scenarioId).filter(
      (a) => !['Approved', 'Implementation', 'Complete'].includes(a.status),
    ).length,
    implementation: filterByScenario(state.actions, scenarioId).filter((a) => a.status !== 'Complete').length,
    complete: pubs.filter((p) => ['Complete', 'Historic', 'Closed'].includes(p.workflowStatus)).length,
  };
}

export function computeReportingMetricsFromLabState(state) {
  const sid = state.scenarioId || 'all';
  const pipe = pipelineCounts(state, sid);
  const changes = filterByScenario(state.changes, sid);
  const activeChanges = changes.filter((c) => !['Complete', 'Closed'].includes(c.status)).length;
  const highMat = changes.filter((c) => c.materiality === 'High' && c.status !== 'Complete').length;
  const obligations = filterByScenario(state.obligations, sid);
  const activeObl = obligations.filter((o) => classifyObligationPrimaryStatus(o.status) === 'ACTIVE').length;
  const inReviewObl = obligations.filter((o) => classifyObligationPrimaryStatus(o.status) === 'REVIEW').length;
  const overdueObl = obligations.filter(
    (o) => classifyObligationPrimaryStatus(o.status) === 'ACTIVE' && String(o.status).toLowerCase() === 'overdue',
  ).length;
  const actions = filterByScenario(state.actions, sid);
  const actionsOverdue = actions.filter((a) => labActionIsOverdue(a)).length;
  const actionsOpen = actions.filter((a) => a.status !== 'Complete').length;
  const findings = (state.assuranceFindings || state.findings || []).filter((f) =>
    ['Open', 'Remediation In Progress', 'IN_PROGRESS', 'OPEN'].includes(f.status),
  );
  const assuranceReviews = (state.assuranceReviews || []).filter((r) => r.result !== 'Pass' && r.result !== 'PASS');
  const gov = governanceMetricsFromLabState(state);

  const controls = filterByScenario(state.controls, sid);
  const controlEffectiveness = {
    effective: controls.filter((c) => (c.effectivenessStatus || 'Not Tested') === 'Effective').length,
    partial: controls.filter((c) => c.effectivenessStatus === 'Partially Effective').length,
    ineffective: controls.filter((c) => c.effectivenessStatus === 'Ineffective').length,
    notTested: controls.filter((c) => (c.effectivenessStatus || 'Not Tested') === 'Not Tested').length,
  };

  const evidence = filterByScenario(state.evidence, sid);
  const evidenceLinked = evidence.length;

  return {
    activeChanges,
    impactReviewsInFlight: pipe.impact,
    activeObligations: activeObl,
    obligationsInReview: inReviewObl,
    overdueObligations: overdueObl,
    actionsOpen,
    actionsOverdue,
    openFindings: findings.length,
    assuranceOutcomesOpen: assuranceReviews.length,
    pipelineInTriage: pipe.inTriage,
    highMaterialityChanges: highMat,
    governancePending: gov.pending,
    governanceOverdue: gov.overdue,
    controlEffectiveness,
    evidenceCoverageCount: evidenceLinked,
  };
}

/** Production reporting adapter — same formulas on canonical lab state (no fixture counts). */
export function computeReportingMetricsProductionAdapter(state) {
  return computeReportingMetricsFromLabState(state);
}

export function compareReportingParity(state) {
  const lab = computeReportingMetricsFromLabState(state);
  const prod = computeReportingMetricsProductionAdapter(state);
  const keys = Object.keys(lab);
  const mismatches = keys.filter((k) => {
    const a = lab[k];
    const b = prod[k];
    if (typeof a === 'object') return JSON.stringify(a) !== JSON.stringify(b);
    return a !== b;
  });
  return { match: mismatches.length === 0, mismatches, lab, prod };
}
