/** Sync denormalized linked* arrays on changes/publications from canonical relations. */
export function syncGraphLinks(state) {
  state.publications.forEach((p) => {
    p.changeIds = state.changes.filter((c) => c.publicationId === p.id).map((c) => c.id);
  });
  state.changes.forEach((ch) => {
    ch.linkedAssessmentIds = state.assessments.filter((a) => a.changeId === ch.id).map((a) => a.id);
    ch.linkedObligationIds = state.obligations.filter((o) => o.changeId === ch.id).map((o) => o.id);
    ch.linkedPolicyIds = state.policies.filter((p) => (p.changeIds || []).includes(ch.id)).map((p) => p.id);
    ch.linkedRiskIds = state.risks.filter((r) => r.originatingChangeId === ch.id).map((r) => r.id);
    ch.linkedControlIds = state.controls.filter((c) => c.changeId === ch.id).map((c) => c.id);
    const oblSet = new Set(ch.linkedObligationIds);
    ch.linkedActionIds = state.actions
      .filter((a) => oblSet.has(a.sourceId) || ch.linkedAssessmentIds.includes(a.sourceId))
      .map((a) => a.id);
    ch.linkedEvidenceIds = state.evidence
      .filter((e) => e.publicationId === ch.publicationId && oblSet.has(e.obligationId))
      .map((e) => e.id);
  });
  return state;
}
