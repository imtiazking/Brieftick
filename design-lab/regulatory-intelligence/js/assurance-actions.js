/**
 * Assurance actions — finding remediation validation, pack refresh flags (mock).
 */
import { getState, addAudit } from './store.js';
import { personName, currentDemoUser } from './workflow-helpers.js';

export function completeFindingRemediation(findingId, comment) {
  const state = getState();
  const f = (state.assuranceFindings || []).find((x) => x.id === findingId);
  if (!f) return { ok: false, error: 'Finding not found' };
  if (f.status === 'Closed') return { ok: false, error: 'Finding already closed' };
  f.status = 'Awaiting Validation';
  f.remediationCompletedAt = new Date().toISOString();
  f.remediationComment = comment || 'Remediation completed (DEMO)';
  const user = currentDemoUser(state);
  addAudit({
    user: user?.name || 'Demo User',
    action: 'Finding remediation started',
    recordType: 'Assurance Finding',
    recordId: findingId,
    comments: comment,
    relatedIds: [findingId, ...(f.linkedActionIds || [])],
  });
  return { ok: true };
}

export function validateFinding(findingId, comments) {
  const state = getState();
  const f = (state.assuranceFindings || []).find((x) => x.id === findingId);
  if (!f) return { ok: false, error: 'Finding not found' };
  if (f.status !== 'Awaiting Validation') return { ok: false, error: 'Finding is not awaiting validation' };
  const user = currentDemoUser(state);
  if (f.ownerId === user?.id) {
    return { ok: false, error: 'Independent validator required — finding owner cannot validate closure.', code: 'FORBIDDEN' };
  }
  f.status = 'Closed';
  f.closedAt = new Date().toISOString();
  f.closureReason = 'Validated';
  f.validatedBy = user?.id;
  f.validationDate = new Date().toISOString().slice(0, 10);
  f.validationComments = comments || 'Independent validation complete (DEMO)';
  addAudit({
    user: user?.name || 'Demo User',
    action: 'Finding validated',
    recordType: 'Assurance Finding',
    recordId: findingId,
    comments,
    relatedIds: [findingId, f.assuranceReviewId],
  });
  addAudit({
    user: user?.name || 'Demo User',
    action: 'Finding closed',
    recordType: 'Assurance Finding',
    recordId: findingId,
    relatedIds: [findingId],
  });
  return { ok: true };
}

export function markAssuranceReviewStale(changeId, reason) {
  const state = getState();
  (state.assuranceReviews || [])
    .filter((r) => r.changeId === changeId && r.reviewStatus === 'Complete')
    .forEach((r) => {
      r.stalenessStatus = 'Stale';
      r.stalenessReason = reason || 'Source update — review required';
      r.packReviewRequired = true;
    });
  const pack = (state.assurancePacks || []).find((p) => p.changeId === changeId);
  if (pack) pack.packStatus = 'Incomplete';
  addAudit({
    user: 'System',
    action: 'Assurance status stale',
    recordType: 'Regulatory Change',
    recordId: changeId,
    comments: reason,
    relatedIds: [changeId],
  });
  return { ok: true };
}

export function completeManagementAttestationMock(attestationId) {
  const state = getState();
  const a = (state.managementAttestations || []).find((x) => x.id === attestationId);
  if (!a) return { ok: false, error: 'Attestation not found' };
  const user = currentDemoUser(state);
  a.status = 'Completed';
  a.signedAtMock = new Date().toISOString();
  a.attestorId = user?.id || a.attestorId;
  addAudit({
    user: user?.name || personName(state, a.attestorId),
    action: 'Management attestation completed',
    recordType: 'Management Attestation',
    recordId: attestationId,
    relatedIds: [attestationId, ...(a.supportingReviewIds || [])],
  });
  return { ok: true };
}

export function finalizeBoardPackReview(packId, comments) {
  const state = getState();
  const p = (state.boardPacks || []).find((x) => x.id === packId);
  if (!p) return { ok: false, error: 'Board pack not found' };
  const user = currentDemoUser(state);
  p.status = 'Final';
  p.reviewerId = user?.id;
  p.reviewedAt = new Date().toISOString();
  p.reviewComments = comments || 'Reviewed (DEMO)';
  p.version = (p.version || 1) + 0;
  addAudit({
    user: user?.name || 'Demo User',
    action: 'Board Pack finalised',
    recordType: 'Board Pack',
    recordId: packId,
    comments,
    relatedIds: [packId, p.reportingPeriodId],
  });
  return { ok: true };
}
