/**
 * Regulatory Calendar right rail — route defaults and persisted user toggle.
 */

const STORAGE_KEY = 'forgeniq-ri-calendar-rail';

/** Routes where the calendar rail is shown by default when the user has not collapsed it. */
const DEFAULT_OPEN = new Set(['dashboard', 'horizon', 'feed', 'library', 'obligations']);

/** Routes where the rail is available but hidden until the user opens it. */
const OPTIONAL = new Set(['changes', 'horizon/consultations']);

export function readCalendarRailUserOpen() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === '1' || v === 'open') return true;
    if (v === '0' || v === 'closed') return false;
    return null;
  } catch {
    return null;
  }
}

export function writeCalendarRailUserOpen(open) {
  try {
    localStorage.setItem(STORAGE_KEY, open ? 'open' : 'closed');
  } catch {
    /* ignore */
  }
}

export function calendarRailPolicyForRoute(routeKey) {
  const key = (routeKey || 'dashboard').replace(/^\//, '');
  if (DEFAULT_OPEN.has(key)) return 'default-open';
  if (key === 'changes' || key.startsWith('changes/')) return 'optional';
  if (key === 'horizon/consultations' || key.startsWith('horizon/consultations')) return 'optional';
  if (OPTIONAL.has(key)) return 'optional';
  return 'hidden';
}

export function calendarRailShouldShow(routeKey) {
  const policy = calendarRailPolicyForRoute(routeKey);
  if (policy === 'hidden') return false;
  const user = readCalendarRailUserOpen();
  if (policy === 'default-open') return user !== false;
  return user === true;
}

export function calendarRailToggleAllowed(routeKey) {
  return calendarRailPolicyForRoute(routeKey) !== 'hidden';
}