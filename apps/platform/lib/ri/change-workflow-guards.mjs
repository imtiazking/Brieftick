/**
 * Regulatory change status transition guards (shared with acceptance tests).
 */
export const CHANGE_ALLOWED_TRANSITIONS = {
  DRAFT: new Set(['OPEN', 'CANCELLED']),
  OPEN: new Set(['IN_PROGRESS', 'CANCELLED']),
  IN_PROGRESS: new Set(['IMPLEMENTED', 'CLOSED', 'CANCELLED']),
  IMPLEMENTED: new Set(['CLOSED']),
  CLOSED: new Set([]),
  CANCELLED: new Set([]),
};

export function assertChangeStatusTransition(fromStatus, toStatus) {
  if (fromStatus === toStatus) {
    const err = new Error('change_invalid_transition');
    err.name = 'RiConflictError';
    throw err;
  }
  const allowed = CHANGE_ALLOWED_TRANSITIONS[fromStatus];
  if (!allowed || !allowed.has(toStatus)) {
    const err = new Error('change_invalid_transition');
    err.name = 'RiConflictError';
    throw err;
  }
}
