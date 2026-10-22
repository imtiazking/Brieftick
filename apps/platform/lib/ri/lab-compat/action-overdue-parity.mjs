import { GOLDEN_MASTER_TODAY } from './date-window.mjs';

/** Design Lab `actionIsOverdueAsOf` semantics. */
export function labActionIsOverdue(action, asOf = GOLDEN_MASTER_TODAY) {
  if (!action) return false;
  if (action.status === 'Overdue') return true;
  if (action.status === 'Complete' || action.status === 'Closed') return false;
  if (!action.dueDate) return false;
  return action.dueDate < asOf;
}

/** Production `isActionOverdue` semantics on mapped status/due date. */
export function productionActionIsOverdue(dueDate, status, asOf = GOLDEN_MASTER_TODAY) {
  if (!dueDate) return false;
  const terminal = new Set(['COMPLETE', 'CLOSED', 'CANCELLED']);
  if (terminal.has(status)) return false;
  if (status === 'OVERDUE' || status === 'Overdue') return true;
  return dueDate < asOf;
}

export function labActionStatusToProduction(status) {
  const map = {
    'Not Started': 'OPEN',
    'In Progress': 'IN_PROGRESS',
    Overdue: 'OVERDUE',
    'Due Soon': 'OPEN',
    Blocked: 'OPEN',
    Complete: 'COMPLETE',
    Closed: 'CLOSED',
  };
  return map[status] || status;
}
