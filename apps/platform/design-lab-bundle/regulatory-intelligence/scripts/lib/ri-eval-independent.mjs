/**
 * Independent expectations for honest Ask RI evaluation (raw FK / arrays only).
 */

const OPEN_ACTION = new Set(['Open', 'In Progress', 'In progress', 'Not Started', 'Pending']);

function norm(s) {
  return String(s || '').trim().toLowerCase();
}

function sectorChangeIds(state, slug) {
  const sector = (state.sectors || []).find((s) => s.slug === slug || s.id === slug);
  const ids = new Set();
  (state.changes || []).forEach((ch) => {
    if (ch.scenario === slug) ids.add(ch.id);
    if (sector && (ch.sectorIds || []).includes(sector.id)) ids.add(ch.id);
    if (sector && (ch.affectedSectorIds || []).includes(sector.id)) ids.add(ch.id);
  });
  (state.publications || []).forEach((p) => {
    if (p.scenario !== slug && (!sector || !(p.sectorIds || []).includes(sector.id))) return;
    (state.changes || []).forEach((ch) => {
      if (ch.publicationId === p.id) ids.add(ch.id);
    });
  });
  return [...ids].sort();
}

function obligationsForChangeRaw(state, changeId) {
  return (state.obligations || []).filter((o) => o.changeId === changeId);
}

function actionsForObligationRaw(state, obligationId) {
  return (state.actions || []).filter(
    (a) => a.sourceType === 'Obligation' && a.sourceId === obligationId
  );
}

function controlsForObligationRaw(state, obligationId) {
  const ctrlIds = new Set();
  (state.controls || []).forEach((c) => {
    if ((c.obligationIds || []).includes(obligationId)) ctrlIds.add(c.id);
    if (c.obligationId === obligationId) ctrlIds.add(c.id);
  });
  return [...ctrlIds].map((id) => state.controls.find((c) => c.id === id)).filter(Boolean);
}

function policiesForChangeRaw(state, changeId) {
  const polIds = new Set();
  (state.policies || []).forEach((p) => {
    if ((p.changeIds || []).includes(changeId)) polIds.add(p.id);
    if (p.changeId === changeId) polIds.add(p.id);
  });
  return [...polIds].map((id) => state.policies.find((p) => p.id === id)).filter(Boolean);
}

function risksForChangeRaw(state, changeId) {
  return (state.risks || []).filter(
    (r) =>
      r.originatingChangeId === changeId ||
      r.originChangeId === changeId ||
      r.changeId === changeId
  );
}

function evidenceForObligationRaw(state, obligationId) {
  return (state.evidence || []).filter((e) => e.obligationId === obligationId);
}

export function expectedInterpretability(q) {
  const text = q.question || '';
  if (/\b(due soon|due within)\b/i.test(text)) return 'UNRESOLVED';
  if (/policies are linked to operational resilience risks/i.test(text)) return 'UNRESOLVED';
  if (/policies support more than one regulatory obligation/i.test(text)) return 'UNRESOLVED';
  if (/have policies but no linked controls/i.test(text)) return 'UNRESOLVED';
  if (/connected to more than one control/i.test(text)) return 'UNRESOLVED';
  if (/have evidence but no linked policy/i.test(text)) return 'UNRESOLVED';
  return 'INTERPRETABLE';
}

/**
 * TPR-linked Regulatory Change IDs from raw hydrated records only (no planner/executor).
 * Matches: Change.regulatorIds, Change.regulator text, Publication.regulator on Change.publicationId.
 */
export function expectedTprLinkedChangeIds(state) {
  const tpr = (state.landscapeRegulators || []).find((r) => norm(r.shortName) === 'tpr');
  if (!tpr) return [];
  const label = norm(tpr.shortName || tpr.name);
  const ids = new Set();
  (state.changes || []).forEach((ch) => {
    if ((ch.regulatorIds || []).includes(tpr.id)) ids.add(ch.id);
    if (norm(ch.regulator || '').includes('tpr') || norm(ch.regulator || '').includes('pension')) ids.add(ch.id);
    const pub = (state.publications || []).find((p) => p.id === ch.publicationId);
    if (pub && norm(pub.regulator || '').includes(label)) ids.add(ch.id);
    if (pub && norm(pub.regulator || '').includes('tpr')) ids.add(ch.id);
  });
  return [...ids].sort();
}

export function expectedPrimaryIds(state, q) {
  const id = q.id;
  if (expectedInterpretability(q) === 'UNRESOLVED') return null;
  if (id === 'Q02') {
    return sectorChangeIds(state, 'financial-crime');
  }
  if (id === 'Q03') {
    return expectedTprLinkedChangeIds(state);
  }
  if (id === 'Q05') {
    return (state.obligations || [])
      .filter((o) =>
        actionsForObligationRaw(state, o.id).some((a) => a.status !== 'Complete' && a.status !== 'Closed')
      )
      .map((o) => o.id)
      .sort();
  }
  if (id === 'Q12') {
    return sectorChangeIds(state, 'banking')
      .filter((cid) => risksForChangeRaw(state, cid).length > 0)
      .filter((cid) => (state.controls || []).some((c) => c.changeId === cid))
      .sort();
  }
  return null;
}

export function expectedSecondaryIds(state, q) {
  const id = q.id;
  if (expectedInterpretability(q) === 'UNRESOLVED') return null;
  if (id === 'Q02') {
    const fc = sectorChangeIds(state, 'financial-crime');
    const riskIds = new Set();
    fc.forEach((cid) => risksForChangeRaw(state, cid).forEach((r) => riskIds.add(r.id)));
    return [...riskIds].sort();
  }
  if (id === 'Q03') {
    const primary = expectedPrimaryIds(state, q) || [];
    const obl = new Set();
    primary.forEach((cid) => obligationsForChangeRaw(state, cid).forEach((o) => obl.add(o.id)));
    return [...obl].sort();
  }
  return null;
}
