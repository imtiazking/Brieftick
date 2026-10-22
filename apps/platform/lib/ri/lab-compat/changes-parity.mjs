function filterByScenario(items, scenarioId) {
  if (!scenarioId || scenarioId === 'all') return items || [];
  return (items || []).filter((i) => i.scenario === scenarioId);
}

function impactsForChange(state, changeId, ch) {
  return (state.assessments || [])
    .filter((a) => a.changeId === changeId || (ch.linkedAssessmentIds || []).includes(a.id))
    .map((a) => a.id)
    .sort();
}

function obligationsForChange(state, changeId, ch) {
  return (state.obligations || [])
    .filter((o) => o.changeId === changeId || (ch.linkedObligationIds || []).includes(o.id))
    .map((o) => o.id)
    .sort();
}

/** Design Lab changes register (golden reference). */
export function computeChangesFromLabState(state) {
  return filterByScenario(state.changes, state.scenarioId)
    .map((c) => ({
      id: c.id,
      publication_id: c.publicationId,
      title: c.title,
      materiality: c.materiality || null,
      effective_date: c.effectiveDate || null,
      implementation_deadline: c.dueDate || null,
      status: c.status,
      owner_id: c.ownerId || null,
      source_citation: c.sourceCitation || null,
      source_section: c.sourceSection || null,
      impact_ids: impactsForChange(state, c.id, c),
      obligation_ids: obligationsForChange(state, c.id, c),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

/** Map lab changes to production row shape (external_key retains lab id). */
export function mapLabChangesToProductionRows(state) {
  return computeChangesFromLabState(state).map((c) => ({
    external_key: c.id,
    id: c.id,
    publication_id: c.publication_id,
    title: c.title,
    materiality: c.materiality,
    effective_date: c.effective_date,
    implementation_deadline: c.implementation_deadline,
    status: c.status,
    owner_user_id: c.owner_id,
  }));
}

export function projectChangeRelationshipsFromProductionRows(state, rows) {
  const byKey = new Map((state.changes || []).map((c) => [c.id, c]));
  return (rows || [])
    .map((r) => {
      const labId = r.external_key || r.id;
      const ch = byKey.get(labId);
      if (!ch) return null;
      return {
        id: labId,
        publication_id: r.publication_id,
        materiality: r.materiality,
        effective_date: r.effective_date,
        implementation_deadline: r.implementation_deadline,
        status: ch.status,
        owner_id: r.owner_user_id,
        source_citation: ch.sourceCitation || null,
        source_section: ch.sourceSection || null,
        impact_ids: impactsForChange(state, labId, ch),
        obligation_ids: obligationsForChange(state, labId, ch),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.id.localeCompare(b.id));
}

function recordsEqual(a, b) {
  return (
    a.id === b.id &&
    a.publication_id === b.publication_id &&
    a.materiality === b.materiality &&
    a.effective_date === b.effective_date &&
    a.implementation_deadline === b.implementation_deadline &&
    a.status === b.status &&
    a.impact_ids.join(',') === b.impact_ids.join(',') &&
    a.obligation_ids.join(',') === b.obligation_ids.join(',')
  );
}

export function compareChangesParity(state) {
  const lab = computeChangesFromLabState(state);
  const mapped = mapLabChangesToProductionRows(state);
  const prod = projectChangeRelationshipsFromProductionRows(state, mapped);
  let match = lab.length === prod.length;
  if (match) {
    for (let i = 0; i < lab.length; i++) {
      if (!recordsEqual(lab[i], prod[i])) match = false;
    }
  }
  return { labCount: lab.length, prodCount: prod.length, match };
}

export const FLAGSHIP_CHANGE_CHAINS = {
  'CHG-001': {
    publicationId: 'PUB-001',
    impactIds: ['IA-0042'],
    obligationIds: ['OBL-0142', 'OBL-0143'],
  },
  'CHG-010': {
    publicationId: 'PUB-003',
    impactIds: ['IA-0038'],
    obligationIds: ['OBL-0088'],
  },
  'CHG-011': {
    publicationId: 'PUB-002',
    impactIds: ['IA-0035'],
    obligationIds: ['OBL-0075'],
  },
  'CHG-012': {
    publicationId: 'PUB-004',
    impactIds: ['IA-0031'],
    obligationIds: ['OBL-0062'],
  },
};

export function compareFlagshipChangeChains(state) {
  const lab = computeChangesFromLabState({ ...state, scenarioId: 'all' });
  const mismatches = [];
  for (const [changeId, expected] of Object.entries(FLAGSHIP_CHANGE_CHAINS)) {
    const row = lab.find((c) => c.id === changeId);
    if (!row) {
      mismatches.push(`${changeId}:missing`);
      continue;
    }
    if (row.publication_id !== expected.publicationId) mismatches.push(`${changeId}:publication`);
    if (row.impact_ids.join(',') !== [...expected.impactIds].sort().join(',')) {
      mismatches.push(`${changeId}:impacts`);
    }
    if (row.obligation_ids.join(',') !== [...expected.obligationIds].sort().join(',')) {
      mismatches.push(`${changeId}:obligations`);
    }
  }
  return { match: mismatches.length === 0, mismatches };
}
