/**
 * Canonical membership helpers (FK / ID arrays only — never change.linked* or obligation.evidenceIds).
 */
import { actionIsOverdueAsOf } from './ri-graph-normalized.js';

export function actionObligationId(action) {
  if (!action) return null;
  if (/obligation/i.test(action.sourceType || '') && action.sourceId) return action.sourceId;
  return action.obligationId || null;
}

export function actionAssessmentId(action) {
  if (!action) return null;
  if (/assessment/i.test(action.sourceType || '') && action.sourceId) return action.sourceId;
  return null;
}

export function obligationsForChange(state, changeId) {
  return (state.obligations || []).filter((o) => o.changeId === changeId);
}

export function assessmentsForChange(state, changeId) {
  return (state.assessments || []).filter((a) => a.changeId === changeId);
}

export function controlsForChange(state, changeId) {
  return (state.controls || []).filter((c) => c.changeId === changeId);
}

export function policiesForChange(state, changeId) {
  return (state.policies || []).filter((p) => (p.changeIds || []).includes(changeId));
}

export function risksForChange(state, changeId) {
  return (state.risks || []).filter((r) => r.originatingChangeId === changeId);
}

/** Actions sourced from an obligation or IA on this change (canonical provenance fields). */
export function actionsForChange(state, changeId) {
  const oblIds = new Set(obligationsForChange(state, changeId).map((o) => o.id));
  const iaIds = new Set(assessmentsForChange(state, changeId).map((a) => a.id));
  return (state.actions || []).filter((a) => {
    const oid = actionObligationId(a);
    if (oid && oblIds.has(oid)) return true;
    const iaId = actionAssessmentId(a);
    return iaId && iaIds.has(iaId);
  });
}

export function evidenceAttributedToObligation(state, obligationId) {
  return (state.evidence || []).filter((e) => e.obligationId === obligationId).map((e) => e.id);
}

export function inheritedEvidenceViaControl(state, obligationId) {
  const out = [];
  for (const e of state.evidence || []) {
    if (!e.controlId || e.obligationId === obligationId) continue;
    const c = (state.controls || []).find((x) => x.id === e.controlId);
    if ((c?.obligationIds || []).includes(obligationId)) {
      out.push({ evidenceId: e.id, controlId: e.controlId, canonicalObligationId: e.obligationId });
    }
  }
  return out;
}

/**
 * Finding attributable to obligation: Finding → Action (linkedActionIds) → Action sourced from Obligation.
 * Change-level findings alone do not attribute to obligations on that change.
 */
export function assuranceFindingsForObligation(state, obligationId) {
  const actionIds = new Set(
    (state.actions || []).filter((a) => actionObligationId(a) === obligationId).map((a) => a.id)
  );
  const findings = state.assuranceFindings || state.findings || [];
  return findings
    .filter((f) => (f.linkedActionIds || []).some((aid) => actionIds.has(aid)))
    .map((f) => f.id);
}

export function controlsSupportingObligation(state, obligationId) {
  return (state.controls || []).filter((c) => (c.obligationIds || []).includes(obligationId));
}

export function actionsSourcedFromObligation(state, obligationId) {
  return (state.actions || []).filter((a) => actionObligationId(a) === obligationId);
}

export function filterActionsByStatus(state, actionIds, plan, asOfDate) {
  const filters = plan?.statusFilters || [];
  return actionIds.filter((id) => {
    const a = state.actions?.find((x) => x.id === id);
    if (!a) return false;
    for (const f of filters) {
      if (!f.appliesTo?.includes('Action')) continue;
      if (f.id === 'open' && (a.status === 'Complete' || a.status === 'Closed')) return false;
      if (f.id === 'overdue' && !actionIsOverdueAsOf(a, asOfDate)) return false;
    }
    return true;
  });
}
