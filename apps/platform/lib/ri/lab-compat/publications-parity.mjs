import { regulatorExternalKeyFromLabLabel } from './regulator-keys.mjs';

function filterByScenario(items, scenarioId) {
  if (!scenarioId || scenarioId === 'all') return items || [];
  return (items || []).filter((i) => i.scenario === scenarioId);
}

/** Design Lab library rows (golden). */
export function computePublicationsListFromLabState(state) {
  return filterByScenario(state.publications, state.scenarioId)
    .map((p) => ({
      id: p.id,
      regulator: p.regulator,
      regulatorKey: regulatorExternalKeyFromLabLabel(p.regulator),
      title: p.title,
      reference: p.reference,
      publication_type: p.publicationType,
      topic: p.topic,
      publication_date: p.publishedDate,
      effective_date: p.effectiveDate,
      workflow_status: p.workflowStatus,
      change_ids: (state.changes || []).filter((c) => c.publicationId === p.id).map((c) => c.id).sort(),
      assessment_ids: (state.assessments || [])
        .filter((a) => a.publicationId === p.id)
        .map((a) => a.id)
        .sort(),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function publicationRelationshipsFromLabState(state, publicationId) {
  const changes = (state.changes || []).filter((c) => c.publicationId === publicationId).map((c) => c.id).sort();
  const impacts = (state.assessments || [])
    .filter((a) => a.publicationId === publicationId)
    .map((a) => a.id)
    .sort();
  return { changes, impacts };
}

export function comparePublicationsListParity(state) {
  const lab = computePublicationsListFromLabState(state);
  const labIds = lab.map((p) => p.id);
  const rows = filterByScenario(state.publications, state.scenarioId)
    .map((p) => ({
      id: p.id,
      regulatorKey: regulatorExternalKeyFromLabLabel(p.regulator),
      title: p.title,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  const prodIds = rows.map((p) => p.id);
  return {
    labCount: labIds.length,
    prodCount: prodIds.length,
    match: labIds.length === prodIds.length && [...labIds].sort().every((id, i) => id === [...prodIds].sort()[i]),
  };
}

export function comparePublicationRelationshipsParity(state) {
  const pubs = filterByScenario(state.publications, state.scenarioId);
  let match = true;
  const mismatches = [];
  for (const p of pubs) {
    const lab = publicationRelationshipsFromLabState(state, p.id);
    const prodChanges = (state.changes || [])
      .filter((c) => c.publicationId === p.id)
      .map((c) => c.id)
      .sort();
    const prodImpacts = (state.assessments || [])
      .filter((a) => a.publicationId === p.id)
      .map((a) => a.id)
      .sort();
    if (lab.changes.join(',') !== prodChanges.join(',') || lab.impacts.join(',') !== prodImpacts.join(',')) {
      match = false;
      mismatches.push(p.id);
    }
  }
  return { match, mismatches };
}
