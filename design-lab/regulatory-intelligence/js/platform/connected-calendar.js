/**
 * Connected regulatory calendar — tenant obligation / impact / action deadlines and catalogue publication dates from
 * GET /api/ri-lab/calendar. Never shows demo seed data in connected mode and never invents an event: an empty window is
 * reported as empty, a failed load as an error.
 */
import { esc, badge, formatDate } from '../components.js';
import { getState } from '../store.js';
import { isConnectedBackendActive } from './connected-mode.js';

const WINDOWS = [30, 90, 180, 365];
const DEFAULT_WINDOW = 90;

const SEGMENT = { Publication: 'publication', 'Impact Assessment': 'assessment', Obligation: 'obligation', Action: 'action' };

const KIND_LABEL = {
  effective: 'Effective',
  consultation: 'Consultation deadline',
  publication: 'Published',
  implementation: 'Obligation',
  assessment: 'Assessment due',
  action: 'Action due',
};

function apiBase(state) {
  return (state.platformConfig?.apiBaseUrl || '/api/ri-lab').replace(/\/$/, '');
}

export function calendarEventHref(e) {
  const seg = SEGMENT[e?.recordType];
  return seg && e.recordId ? `#/${seg}/${encodeURIComponent(e.recordId)}` : '#/calendar';
}

export function normaliseCalendarWindow(raw) {
  const n = Number(raw);
  return WINDOWS.includes(n) ? n : DEFAULT_WINDOW;
}

export async function fetchConnectedCalendar(state = getState(), windowDays = DEFAULT_WINDOW) {
  const res = await fetch(`${apiBase(state)}/calendar?window=${normaliseCalendarWindow(windowDays)}&dataScope=operational`, {
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) throw new Error(body.error || 'calendar_unavailable');
  return body;
}

export function renderConnectedCalendarShell() {
  return `<section class="ri-panel" data-connected-calendar data-connected-calendar-window="${DEFAULT_WINDOW}">
    <div class="ri-toolbar">
      <label>Window
        <select class="ri-select" data-connected-calendar-window-select aria-label="Calendar window">
          ${WINDOWS.map((w) => `<option value="${w}"${w === DEFAULT_WINDOW ? ' selected' : ''}>${w === 365 ? '12 months' : w === 180 ? '6 months' : `${w} days`}</option>`).join('')}
        </select>
      </label>
    </div>
    <p class="ri-muted" data-connected-calendar-status role="status">Loading tenant calendar…</p>
    <ul class="ri-cal-list" data-connected-calendar-list></ul>
  </section>`;
}

/** Pure renderer — every dynamic value is escaped. */
export function renderConnectedCalendarEvents(events) {
  return (events || [])
    .map((e) => {
      const kind = KIND_LABEL[e.kind] || e.kind || 'Event';
      const uat = e.dataProvenance === 'uat_authorised' ? ` ${badge('Authorised UAT', 'info')}` : '';
      const status = e.status ? ` <span class="ri-muted">· ${esc(String(e.status))}</span>` : '';
      return `<li data-cal-item data-cal-date="${esc(e.date)}" data-cal-kind="${esc(e.kind)}">
        <span class="ri-cal-date">${esc(formatDate(e.date))}</span>
        <span class="ri-cal-kind">${esc(kind)}</span>
        <a href="${calendarEventHref(e)}">${esc(e.title)}</a>${status}${uat}
      </li>`;
    })
    .join('');
}

export function summariseCalendar(body) {
  const n = body?.total ?? (body?.events || []).length;
  if (!n) return `No dated regulatory events between ${formatDate(body?.from)} and ${formatDate(body?.to)}.`;
  const hidden = body?.calendarProvenance?.uatAuthorised ?? 0;
  const note = hidden > 0 ? ` ${hidden} authorised-UAT item(s) are excluded from the operational calendar.` : '';
  return `${n} event(s) between ${formatDate(body.from)} and ${formatDate(body.to)}.${note}`;
}

async function loadCalendar(screen, windowDays) {
  const status = screen.querySelector('[data-connected-calendar-status]');
  const list = screen.querySelector('[data-connected-calendar-list]');
  status.textContent = 'Loading tenant calendar…';
  list.innerHTML = '';
  try {
    const body = await fetchConnectedCalendar(getState(), windowDays);
    list.innerHTML = renderConnectedCalendarEvents(body.events);
    status.textContent = summariseCalendar(body);
  } catch (e) {
    status.textContent = `Calendar unavailable: ${e?.message || 'calendar_unavailable'}`;
    status.setAttribute('role', 'alert');
  }
}

export function renderCalendarRailShell() {
  return `<aside class="ri-calendar-rail" id="ri-calendar-rail" aria-label="Regulatory Calendar">
    <header class="ri-calendar-rail__head">
      <h2 class="ri-calendar-rail__title">Regulatory Calendar</h2>
      <div class="ri-calendar-rail__actions">
        <a class="ri-calendar-rail__link" href="#/calendar">Full view</a>
        <button type="button" class="ri-calendar-rail__collapse" data-calendar-rail-collapse aria-label="Hide calendar panel">Hide</button>
      </div>
    </header>
    <section class="ri-calendar-rail__body" data-connected-calendar data-connected-calendar-window="${DEFAULT_WINDOW}" data-calendar-rail="1">
      <label class="ri-calendar-rail__window">Window
        <select class="ri-select ri-select--sm" data-connected-calendar-window-select aria-label="Calendar window">
          ${WINDOWS.map((w) => `<option value="${w}"${w === DEFAULT_WINDOW ? ' selected' : ''}>${w === 365 ? '12 mo' : w === 180 ? '6 mo' : `${w}d`}</option>`).join('')}
        </select>
      </label>
      <p class="ri-muted ri-calendar-rail__status" data-connected-calendar-status role="status">Loading…</p>
      <ul class="ri-cal-list ri-cal-list--rail" data-connected-calendar-list></ul>
    </section>
  </aside>`;
}

export function hydrateConnectedCalendar(doc = document) {
  const connected = isConnectedBackendActive(getState());
  doc.querySelectorAll('[data-connected-calendar]').forEach((screen) => {
    if (screen.dataset.connectedCalendarBound === '1') return;
    if (!connected) {
      const status = screen.querySelector('[data-connected-calendar-status]');
      if (status) status.textContent = 'Sign in to load tenant calendar.';
      return;
    }
    screen.dataset.connectedCalendarBound = '1';
    screen.querySelector('[data-connected-calendar-window-select]')?.addEventListener('change', (ev) => {
      loadCalendar(screen, normaliseCalendarWindow(ev.target.value));
    });
    loadCalendar(screen, normaliseCalendarWindow(screen.dataset.connectedCalendarWindow || DEFAULT_WINDOW));
  });
}
