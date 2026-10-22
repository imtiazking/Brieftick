import { labImpactStatusToProduction } from './lifecycle-status.mjs';

function filterByScenario(items, scenarioId) {
  if (!scenarioId || scenarioId === 'all') return items || [];
  return (items || []).filter((i) => i.scenario === scenarioId);
}

export function mapLabAssessmentToProductionRow(a) {
  return {
    id: a.id,
    regulatory_change_id: a.changeId || null,
    publication_id: a.publicationId || null,
    status: labImpactStatusToProduction(a.status),
    materiality: a.materiality || null,
    due_date: a.dueDate || null,
    owner_user_id: a.ownerId || null,
    reviewer_user_id: null,
    approver_user_id: null,
    business_impact: a.businessImpact || null,
    operational_impact: a.operationalImpact || null,
    technology_impact: a.technologyImpact || null,
    compliance_impact: a.complianceImpact || null,
    financial_impact: a.financialImpact || null,
    implementation_complexity: a.implementationComplexity || null,
  };
}

/** Golden reference — reads Design Lab assessment fields directly. */
export function computeImpactsFromLabState(state) {
  return filterByScenario(state.assessments, state.scenarioId)
    .map((a) => ({
      id: a.id,
      regulatory_change_id: a.changeId || null,
      publication_id: a.publicationId || null,
      status: labImpactStatusToProduction(a.status),
      materiality: a.materiality || null,
      due_date: a.dueDate || null,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

/** Production adapter path (lab records → production table shape). */
export function mapLabStateToImpactProductionRows(state) {
  return filterByScenario(state.assessments, state.scenarioId)
    .map(mapLabAssessmentToProductionRow)
    .sort((a, b) => a.id.localeCompare(b.id));
}

function impactFingerprint(r) {
  return [
    r.id,
    r.regulatory_change_id,
    r.publication_id,
    r.status,
    r.materiality,
    r.due_date,
  ].join('|');
}

export function compareImpactParity(state) {
  const lab = computeImpactsFromLabState(state);
  const prod = mapLabStateToImpactProductionRows(state).map((r) => ({
    id: r.id,
    regulatory_change_id: r.regulatory_change_id,
    publication_id: r.publication_id,
    status: r.status,
    materiality: r.materiality,
    due_date: r.due_date,
  }));
  const labKeys = new Set(lab.map(impactFingerprint));
  const prodKeys = new Set(prod.map(impactFingerprint));
  const match =
    lab.length === prod.length && [...labKeys].every((k) => prodKeys.has(k));
  return { labCount: lab.length, prodCount: prod.length, match };
}

export function impactsForChangeFromLabState(state, changeId) {
  return computeImpactsFromLabState(state)
    .filter((i) => i.regulatory_change_id === changeId)
    .map((i) => i.id)
    .sort();
}
