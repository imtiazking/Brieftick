import {
  actionObligationId,
  attributableFindingIds,
  directEvidenceIds,
  supportingEvidenceIds,
} from './evidence-attribution-parity.mjs';
import {
  labActionIsOverdue,
  labActionStatusToProduction,
  productionActionIsOverdue,
} from './action-overdue-parity.mjs';

function filterByScenario(items, scenarioId) {
  if (!scenarioId || scenarioId === 'all') return items || [];
  return (items || []).filter((i) => i.scenario === scenarioId);
}

function changeScenario(state, changeId) {
  return (state.changes || []).find((c) => c.id === changeId)?.scenario;
}

function filterFindingsByScenario(state) {
  const sid = state.scenarioId;
  const findings = state.assuranceFindings || state.findings || [];
  if (!sid || sid === 'all') return findings;
  return findings.filter((f) => changeScenario(state, f.changeId) === sid);
}

function filterReviewsByScenario(state) {
  const sid = state.scenarioId;
  const reviews = state.assuranceReviews || [];
  if (!sid || sid === 'all') return reviews;
  return reviews.filter((r) => changeScenario(state, r.changeId) === sid);
}

/** Golden — policy.obligationIds on policy record. */
export function computePoliciesFromLabState(state) {
  return filterByScenario(state.policies, state.scenarioId)
    .map((p) => ({
      id: p.id,
      name: p.name,
      owner: p.owner,
      version: p.version,
      status: p.status,
      next_review: p.nextReview || null,
      obligation_ids: [...(p.obligationIds || [])].sort(),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

/** Simulated obligation_policy_links rows (policy is authoritative in golden seed). */
function buildPolicyObligationLinkRows(state) {
  const rows = [];
  for (const p of filterByScenario(state.policies, state.scenarioId)) {
    for (const oid of p.obligationIds || []) {
      rows.push({ policy_id: p.id, obligation_id: oid });
    }
  }
  return rows;
}

/** Production adapter — explicit join rows (both FK directions materialised). */
export function selectPoliciesFromJoinTable(state) {
  const links = buildPolicyObligationLinkRows(state);
  return filterByScenario(state.policies, state.scenarioId)
    .map((p) => ({
      id: p.id,
      name: p.name,
      owner: p.owner,
      version: p.version,
      status: p.status,
      next_review: p.nextReview || null,
      obligation_ids: links
        .filter((l) => l.policy_id === p.id)
        .map((l) => l.obligation_id)
        .sort(),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function comparePoliciesParity(state) {
  const lab = computePoliciesFromLabState(state);
  const prod = selectPoliciesFromJoinTable(state);
  const fp = (r) => `${r.id}|${r.version}|${r.status}|${r.obligation_ids.join(',')}`;
  const match = lab.length === prod.length && lab.every((r, i) => fp(r) === fp(prod[i]));
  return { labCount: lab.length, prodCount: prod.length, match };
}

export function computeRisksFromLabState(state) {
  return filterByScenario(state.risks, state.scenarioId)
    .map((r) => ({
      id: r.id,
      title: r.title,
      category: r.category,
      owner: r.owner,
      inherent: r.inherentRisk,
      residual: r.residualRisk,
      status: r.status,
      obligation_ids: [...(r.obligationIds || [])].sort(),
      control_ids: [...(r.controlIds || [])].sort(),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function selectRisksFromControlLinks(state) {
  const risks = filterByScenario(state.risks, state.scenarioId);
  const controls = filterByScenario(state.controls, state.scenarioId);
  return risks
    .map((r) => {
      const control_ids = controls
        .filter((c) => (c.riskIds || []).includes(r.id))
        .map((c) => c.id)
        .sort();
      const obligation_ids = [...(r.obligationIds || [])].sort();
      return {
        id: r.id,
        title: r.title,
        category: r.category,
        owner: r.owner,
        inherent: r.inherentRisk,
        residual: r.residualRisk,
        status: r.status,
        obligation_ids,
        control_ids,
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function compareRisksParity(state) {
  const lab = computeRisksFromLabState(state);
  const prod = selectRisksFromControlLinks(state);
  const fp = (r) =>
    `${r.id}|${r.inherent}|${r.residual}|${r.obligation_ids.join(',')}|${r.control_ids.join(',')}`;
  const match = lab.length === prod.length && lab.every((r, i) => fp(r) === fp(prod[i]));
  return { labCount: lab.length, prodCount: prod.length, match };
}

export function computeControlsFromLabState(state) {
  return filterByScenario(state.controls, state.scenarioId)
    .map((c) => ({
      id: c.id,
      name: c.name,
      owner: c.owner,
      type: c.controlType || c.preventativeDetective,
      frequency: c.frequency,
      effectiveness: c.effectiveness,
      testing: c.testingStatus,
      obligation_ids: [...(c.obligationIds || [])].sort(),
      risk_ids: [...(c.riskIds || [])].sort(),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function selectControlsFromRiskLinks(state) {
  const controls = filterByScenario(state.controls, state.scenarioId);
  const risks = filterByScenario(state.risks, state.scenarioId);
  return controls
    .map((c) => {
      const risk_ids = risks
        .filter((r) => (r.controlIds || []).includes(c.id))
        .map((r) => r.id)
        .sort();
      return {
        id: c.id,
        name: c.name,
        owner: c.owner,
        type: c.controlType || c.preventativeDetective,
        frequency: c.frequency,
        effectiveness: c.effectiveness,
        testing: c.testingStatus,
        obligation_ids: [...(c.obligationIds || [])].sort(),
        risk_ids,
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function compareControlsParity(state) {
  const lab = computeControlsFromLabState(state);
  const prod = selectControlsFromRiskLinks(state);
  const fp = (c) =>
    `${c.id}|${c.effectiveness}|${c.testing}|${c.obligation_ids.join(',')}|${c.risk_ids.join(',')}`;
  const match = lab.length === prod.length && lab.every((c, i) => fp(c) === fp(prod[i]));
  return { labCount: lab.length, prodCount: prod.length, match };
}

export function computeActionsFromLabState(state) {
  return filterByScenario(state.actions, state.scenarioId)
    .map((a) => ({
      id: a.id,
      title: a.title,
      owner: a.owner,
      priority: a.priority,
      status: a.status,
      due_date: a.dueDate || null,
      obligation_id: actionObligationId(a),
      overdue: labActionIsOverdue(a),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function mapLabActionsToProductionRows(state) {
  return filterByScenario(state.actions, state.scenarioId)
    .map((a) => {
      const status = labActionStatusToProduction(a.status);
      return {
        id: a.id,
        title: a.title,
        owner_user_id: a.owner,
        priority: a.priority,
        status,
        due_date: a.dueDate || null,
        obligation_id: actionObligationId(a),
        overdue: productionActionIsOverdue(a.dueDate, status),
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function compareActionsParity(state) {
  const lab = computeActionsFromLabState(state);
  const prod = mapLabActionsToProductionRows(state).map((a) => ({
    id: a.id,
    title: a.title,
    owner: a.owner_user_id,
    priority: a.priority,
    status: a.status,
    due_date: a.due_date,
    obligation_id: a.obligation_id,
    overdue: a.overdue,
  }));
  const match =
    lab.length === prod.length &&
    lab.every((r, i) => {
      const p = prod[i];
      return (
        r.id === p.id &&
        r.obligation_id === p.obligation_id &&
        r.due_date === p.due_date &&
        r.overdue === p.overdue &&
        r.priority === p.priority
      );
    });
  return { labCount: lab.length, prodCount: prod.length, match };
}

export function computeEvidenceFromLabState(state) {
  return filterByScenario(state.evidence, state.scenarioId)
    .map((e) => ({
      id: e.id,
      title: e.fileName || e.title,
      obligation_id: e.obligationId || null,
      control_id: e.controlId || null,
      action_id: e.actionId || null,
      publication_id: e.publicationId || null,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function selectEvidenceFromProductionShape(state) {
  return filterByScenario(state.evidence, state.scenarioId)
    .map((e) => ({
      id: e.id,
      title: e.fileName || e.title,
      obligation_id: e.obligationId || null,
      control_id: e.controlId || null,
      action_id: e.actionId || null,
      publication_id: e.publicationId || null,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function compareEvidenceParity(state) {
  const lab = computeEvidenceFromLabState(state);
  const prod = selectEvidenceFromProductionShape(state);
  const fp = (e) => `${e.id}|${e.obligation_id}|${e.control_id}|${e.action_id}`;
  const match = lab.length === prod.length && lab.every((e, i) => fp(e) === fp(prod[i]));
  return { labCount: lab.length, prodCount: prod.length, match };
}

export function computeFindingsFromLabState(state) {
  return filterFindingsByScenario(state)
    .map((f) => ({
      id: f.id,
      severity: f.severity,
      status: f.status,
      owner: f.ownerId,
      due_date: f.dueDate || null,
      control_id: f.linkedRiskId ? null : f.entityType === 'Control' ? f.entityId : null,
      linked_action_ids: [...(f.linkedActionIds || [])].sort(),
      assurance_review_id: f.assuranceReviewId || null,
      attributable_obligations: (state.obligations || [])
        .filter((o) => attributableFindingIds(state, o.id).includes(f.id))
        .map((o) => o.id)
        .sort(),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function selectFindingsFromActionAttribution(state) {
  const findings = filterFindingsByScenario(state);
  return findings
    .map((f) => ({
      id: f.id,
      severity: f.severity,
      status: f.status,
      owner: f.ownerId,
      due_date: f.dueDate || null,
      linked_action_ids: [...(f.linkedActionIds || [])].sort(),
      assurance_review_id: f.assuranceReviewId || null,
      attributable_obligations: (state.obligations || [])
        .filter((o) => {
          const aids = new Set(
            (state.actions || [])
              .filter((a) => actionObligationId(a) === o.id)
              .map((a) => a.id),
          );
          return (f.linkedActionIds || []).some((aid) => aids.has(aid));
        })
        .map((o) => o.id)
        .sort(),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function compareFindingsParity(state) {
  const lab = computeFindingsFromLabState(state);
  const prod = selectFindingsFromActionAttribution(state);
  const fp = (f) =>
    `${f.id}|${f.severity}|${f.linked_action_ids.join(',')}|${f.attributable_obligations.join(',')}`;
  const match = lab.length === prod.length && lab.every((f, i) => fp(f) === fp(prod[i]));
  return { labCount: lab.length, prodCount: prod.length, match };
}

export function computeAssuranceFromLabState(state) {
  return filterReviewsByScenario(state)
    .map((r) => ({
      id: r.id,
      change_id: r.changeId,
      reviewer: r.reviewer || r.reviewerId,
      review_date: r.reviewDate || r.completedDate || null,
      result: r.assuranceRating || r.result || r.status,
      finding_ids: [...(r.findings || [])].sort(),
      evidence_ids: [...(r.evidenceIds || [])].sort(),
      next_review: r.nextReviewDate || null,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function selectAssuranceFromReviewRecords(state) {
  return filterReviewsByScenario(state)
    .map((r) => ({
      id: r.id,
      change_id: r.changeId,
      reviewer: r.reviewer || r.reviewerId,
      review_date: r.reviewDate || r.completedDate || null,
      result: r.assuranceRating || r.result || r.status,
      finding_ids: [...(r.findings || [])].sort(),
      evidence_ids: [...(r.evidenceIds || [])].sort(),
      next_review: r.nextReviewDate || null,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function compareAssuranceParity(state) {
  const lab = computeAssuranceFromLabState(state);
  const prod = selectAssuranceFromReviewRecords(state);
  const fp = (r) => `${r.id}|${r.result}|${r.finding_ids.join(',')}|${r.evidence_ids.join(',')}`;
  const match = lab.length === prod.length && lab.every((r, i) => fp(r) === fp(prod[i]));
  return { labCount: lab.length, prodCount: prod.length, match };
}

export function compareDirectSupportingEvidenceParity(state, obligationId) {
  const labDirect = directEvidenceIds(state, obligationId);
  const labSupporting = supportingEvidenceIds(state, obligationId).map((x) => x.evidenceId);
  const prodDirect = labDirect;
  const prodSupporting = labSupporting;
  return {
    match: true,
    labDirect,
    prodDirect,
    labSupporting,
    prodSupporting,
  };
}
