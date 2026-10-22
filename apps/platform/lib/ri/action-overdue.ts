/** Derived overdue — stored status is not silently rewritten to OVERDUE for actions. */
const ACTION_TERMINAL = new Set(['COMPLETE', 'CLOSED', 'CANCELLED']);

export function isActionOverdue(dueDate: string | null | undefined, status: string): boolean {
  if (!dueDate) return false;
  if (ACTION_TERMINAL.has(status)) return false;
  const today = new Date().toISOString().slice(0, 10);
  return dueDate < today;
}
