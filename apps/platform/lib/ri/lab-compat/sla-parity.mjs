/**
 * SLA / due-soon semantics — ported from Design Lab workflow-helpers (golden master).
 */
import { GOLDEN_MASTER_TODAY, daysBetween, parseDateOnly } from './date-window.mjs';

export const DEMO_DUE_SOON_DAYS = 14;

/** @returns {'On Track'|'Due Soon'|'Overdue'|'Escalated'|'Complete'} */
export function slaStatus(dueDate, complete, escalated = false) {
  if (complete) return 'Complete';
  if (escalated) return 'Escalated';
  if (!dueDate) return 'On Track';
  const due = parseDateOnly(dueDate);
  if (!due) return 'On Track';
  const days = daysBetween(GOLDEN_MASTER_TODAY, due);
  if (days < 0) return 'Overdue';
  if (days <= DEMO_DUE_SOON_DAYS) return 'Due Soon';
  return 'On Track';
}

export function isCompleteStatus(entityType, status) {
  const s = String(status || '').toLowerCase();
  if (entityType === 'Action') return s === 'complete';
  if (entityType === 'Impact Assessment') {
    return ['approved', 'implementation', 'complete'].includes(s);
  }
  if (entityType === 'Publication') {
    return ['complete', 'closed', 'historic', 'in implementation'].includes(s.replace(/\s/g, ' '));
  }
  if (entityType === 'Obligation') return s === 'complete' || s === 'historic';
  return s === 'complete';
}
