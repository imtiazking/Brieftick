/**
 * Golden-master evidence / finding attribution (ported from Design Lab canonical link rules).
 * FK / explicit ID fields only — no BFS for membership.
 */

export function actionObligationId(action) {
  if (!action) return null;
  if (/obligation/i.test(action.sourceType || '') && action.sourceId) return action.sourceId;
  return action.obligationId || null;
}

export function directEvidenceIds(state, obligationId) {
  return (state.evidence || [])
    .filter((e) => e.obligationId === obligationId)
    .map((e) => e.id)
    .sort();
}

export function supportingEvidenceIds(state, obligationId) {
  const direct = new Set(directEvidenceIds(state, obligationId));
  const out = [];
  for (const e of state.evidence || []) {
    if (!e.controlId || direct.has(e.id)) continue;
    const c = (state.controls || []).find((x) => x.id === e.controlId);
    if ((c?.obligationIds || []).includes(obligationId)) {
      out.push({ evidenceId: e.id, controlId: e.controlId });
    }
  }
  return out.sort((a, b) => a.evidenceId.localeCompare(b.evidenceId));
}

/** Finding → linked Action → Action sourced from Obligation (not change-level alone). */
export function attributableFindingIds(state, obligationId) {
  const actionIds = new Set(
    (state.actions || [])
      .filter((a) => actionObligationId(a) === obligationId)
      .map((a) => a.id),
  );
  const findings = state.assuranceFindings || state.findings || [];
  return findings
    .filter((f) => (f.linkedActionIds || []).some((aid) => actionIds.has(aid)))
    .map((f) => f.id)
    .sort();
}

export function compareEvidenceAttributionForObligation(state, obligationId) {
  const labDirect = directEvidenceIds(state, obligationId);
  const prodDirect = (state.evidence || [])
    .filter((e) => e.obligationId === obligationId)
    .map((e) => e.id)
    .sort();
  const labSupporting = supportingEvidenceIds(state, obligationId).map((x) => x.evidenceId);
  const prodSupporting = supportingEvidenceIds(state, obligationId).map((x) => x.evidenceId);
  return {
    directMatch: labDirect.join(',') === prodDirect.join(','),
    supportingMatch: labSupporting.join(',') === prodSupporting.join(','),
    labDirect,
    prodDirect,
    labSupporting,
    prodSupporting,
  };
}

/** Canonical EVD-009 golden-master checks. */
export function compareEvd009GoldenMaster(state) {
  const d142 = directEvidenceIds(state, 'OBL-0142');
  const d143 = directEvidenceIds(state, 'OBL-0143');
  const s143 = supportingEvidenceIds(state, 'OBL-0143').map((x) => x.evidenceId);
  return {
    match: d142.includes('EVD-009') && !d143.includes('EVD-009') && s143.includes('EVD-009'),
    d142,
    d143,
    s143,
  };
}
