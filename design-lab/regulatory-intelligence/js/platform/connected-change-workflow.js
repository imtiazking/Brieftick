/** Mirrors server change-workflow-guards.mjs for connected UI. */
export const CONNECTED_CHANGE_ALLOWED_TRANSITIONS = {
  DRAFT: new Set(['OPEN', 'CANCELLED']),
  OPEN: new Set(['IN_PROGRESS', 'CANCELLED']),
  IN_PROGRESS: new Set(['IMPLEMENTED', 'CLOSED', 'CANCELLED']),
  IMPLEMENTED: new Set(['CLOSED']),
  CLOSED: new Set([]),
  CANCELLED: new Set([]),
};

export function connectedChangeStatusOptions(currentCode) {
  const allowed = CONNECTED_CHANGE_ALLOWED_TRANSITIONS[currentCode] || new Set();
  const labels = {
    DRAFT: 'Draft',
    OPEN: 'Open',
    IN_PROGRESS: 'In progress',
    IMPLEMENTED: 'Implemented',
    CLOSED: 'Closed',
    CANCELLED: 'Cancelled',
  };
  return [...allowed].map((code) => ({ code, label: labels[code] || code }));
}
