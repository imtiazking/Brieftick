import { DEMO_TODAY } from '../workflow-helpers.js';

/** Design Lab deterministic "today" for deadline logic. */
export function labTodayISO() {
  return DEMO_TODAY;
}

export function labNowISO() {
  return `${DEMO_TODAY}T12:00:00.000Z`;
}

export function parseBusinessDate(d) {
  if (!d) return null;
  try {
    const iso = d.length === 10 ? `${d}T12:00:00` : d;
    const dt = new Date(iso);
    return Number.isNaN(dt.getTime()) ? null : dt;
  } catch {
    return null;
  }
}

export function daysBetween(fromIso, toIso) {
  const a = parseBusinessDate(fromIso);
  const b = parseBusinessDate(toIso);
  if (!a || !b) return null;
  return Math.round((b - a) / (24 * 60 * 60 * 1000));
}
