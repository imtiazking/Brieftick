/**
 * Impact assessment workflow transition guards (shared with acceptance tests).
 */
export const IMPACT_SUBMIT_FROM = new Set(['DRAFT', 'IN_PROGRESS']);
export const IMPACT_DECISION_FROM = new Set(['IN_REVIEW']);

export function requiredStatusForImpactAction(action, currentStatus) {
  if (action === 'submit') {
    if (!IMPACT_SUBMIT_FROM.has(currentStatus)) return null;
    return currentStatus;
  }
  if (action === 'approve' || action === 'reject') {
    if (!IMPACT_DECISION_FROM.has(currentStatus)) return null;
    return 'IN_REVIEW';
  }
  return null;
}

export function assertImpactActionAllowed(action, currentStatus) {
  if (!requiredStatusForImpactAction(action, currentStatus)) {
    const err = new Error('impact_invalid_transition');
    err.name = 'RiConflictError';
    throw err;
  }
}
