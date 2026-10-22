/**
 * SLA presentation for operational views (due soon / overdue).
 * Threshold matches Design Lab DEMO_DUE_SOON_DAYS.
 */
export const DUE_SOON_DAYS = 14;

export type SlaPresentation = 'On Track' | 'Due Soon' | 'Overdue' | 'Escalated' | 'Complete';

export function parseDateOnly(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return String(iso).slice(0, 10);
}

export function daysBetween(fromIso: string, toIso: string): number {
  const a = Date.parse(`${parseDateOnly(fromIso)}T12:00:00.000Z`);
  const b = Date.parse(`${parseDateOnly(toIso)}T12:00:00.000Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return NaN;
  return Math.round((b - a) / 86400000);
}

export function deriveSlaPresentation(
  dueDate: string | null | undefined,
  complete: boolean,
  escalated = false,
  referenceDate = new Date().toISOString().slice(0, 10),
): SlaPresentation {
  if (complete) return 'Complete';
  if (escalated) return 'Escalated';
  if (!dueDate) return 'On Track';
  const days = daysBetween(referenceDate, dueDate);
  if (days < 0) return 'Overdue';
  if (days <= DUE_SOON_DAYS) return 'Due Soon';
  return 'On Track';
}
