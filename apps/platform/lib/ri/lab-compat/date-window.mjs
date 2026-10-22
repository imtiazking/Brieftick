/** Golden-master calendar date semantics (aligned with Design Lab workflow-helpers). */

export const GOLDEN_MASTER_TODAY = '2026-10-14';

export function parseDateOnly(iso) {
  if (!iso) return null;
  return String(iso).slice(0, 10);
}

export function daysBetween(fromIso, toIso) {
  const a = Date.parse(`${parseDateOnly(fromIso)}T12:00:00.000Z`);
  const b = Date.parse(`${parseDateOnly(toIso)}T12:00:00.000Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return NaN;
  return Math.round((b - a) / 86400000);
}

/** Inclusive forward window from reference date (UTC date-only, noon anchor). */
export function isWithinForwardDateWindow(isoDate, windowDays, referenceDate = GOLDEN_MASTER_TODAY) {
  if (!isoDate || !windowDays) return false;
  const days = daysBetween(referenceDate, parseDateOnly(isoDate));
  return days >= 0 && days <= Number(windowDays);
}

export function forwardWindowEnd(referenceDate, windowDays) {
  const start = Date.parse(`${parseDateOnly(referenceDate)}T12:00:00.000Z`);
  const end = new Date(start + Number(windowDays) * 86400000);
  return end.toISOString().slice(0, 10);
}
