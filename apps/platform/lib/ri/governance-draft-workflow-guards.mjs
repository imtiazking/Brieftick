/**
 * Shared DRAFT → IN_REVIEW → APPROVED governance transitions (impact, risk, control mapping).
 */
export const GOVERNANCE_SUBMIT_FROM = new Set(['DRAFT', 'IN_PROGRESS']);
export const GOVERNANCE_DECISION_FROM = new Set(['IN_REVIEW']);

export function requiredStatusForGovernanceAction(action, currentStatus) {
  if (action === 'submit') {
    if (!GOVERNANCE_SUBMIT_FROM.has(currentStatus)) return null;
    return currentStatus;
  }
  if (action === 'approve' || action === 'reject') {
    if (!GOVERNANCE_DECISION_FROM.has(currentStatus)) return null;
    return 'IN_REVIEW';
  }
  return null;
}

export function assertGovernanceActionAllowed(action, currentStatus) {
  if (!requiredStatusForGovernanceAction(action, currentStatus)) {
    const err = new Error('governance_invalid_transition');
    err.name = 'RiConflictError';
    throw err;
  }
}