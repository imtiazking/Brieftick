/**
 * Connected board / executive reporting (Step 83E.7 / 83F.1 periods).
 */
import { getState } from '../store.js';

function apiBase(state) {
  return (state.platformConfig?.apiBaseUrl || '/api/ri-lab').replace(/\/$/, '');
}

export function reportingPeriodQueryFromDom() {
  const sel = document.querySelector('[data-connected-reporting-period]');
  const period = sel?.value || 'last30';
  return `period=${encodeURIComponent(period)}`;
}

export function renderConnectedReportingPeriodSelector() {
  return `<section class="ri-panel ri-panel--compact" data-connected-reporting-period-panel="true">
    <label>Reporting period
      <select data-connected-reporting-period>
        <option value="last30">Last 30 days</option>
        <option value="last90">Last 90 days</option>
        <option value="ytd">Year to date</option>
      </select>
    </label>
    <button type="button" class="ri-btn ri-btn--sm ri-btn--ghost" data-connected-reporting-refresh>Refresh reports</button>
    <p class="ri-muted">Operational data scope only (excludes authorised UAT). Snapshot = current open counts; period activity = rows created/submitted in the window.</p>
  </section>`;
}

function reportUrl(base, path, state) {
  const q = typeof document !== 'undefined' ? reportingPeriodQueryFromDom() : 'period=last30';
  return `${base}${path}?${q}`;
}

export async function fetchConnectedBoardReport(state = getState()) {
  const base = apiBase(state);
  const res = await fetch(reportUrl(base, '/reports/board', state), {
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) {
    const err = new Error(body.error || 'board_report_unavailable');
    err.status = res.status;
    throw err;
  }
  return body;
}

export async function fetchConnectedExecutiveReport(state = getState()) {
  const base = apiBase(state);
  const res = await fetch(reportUrl(base, '/reports/executive', state), {
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) {
    const err = new Error(body.error || 'executive_report_unavailable');
    err.status = res.status;
    throw err;
  }
  return body;
}

export function boardPdfExportUrl(state = getState()) {
  const base = apiBase(state);
  const q = typeof document !== 'undefined' ? reportingPeriodQueryFromDom() : 'period=last30';
  return `${base}/reports/board/export?${q}`;
}

export function renderConnectedExecutiveReport(body) {
  const s = body.summary || {};
  const act = body.activityInPeriod || {};
  const period = body.reportingPeriod?.label || 'Last 30 days';
  return `<section class="ri-panel" data-connected-executive-report="true">
    <h2>Tenant executive metrics</h2>
    <p class="ri-muted">Period: <strong>${period}</strong>. Population: <strong>${body.dataPopulation || 'operational'}</strong>. ${body.metricsNote || ''}</p>
    <div class="ri-module-grid">
      <article class="ri-panel"><h3>Open changes (snapshot)</h3><p class="ri-module__value">${s.changesOpen ?? 0}</p></article>
      <article class="ri-panel"><h3>Impacts in progress</h3><p class="ri-module__value">${s.impactsInProgress ?? 0}</p></article>
      <article class="ri-panel"><h3>Overdue obligations</h3><p class="ri-module__value">${s.obligationsOverdue ?? 0}</p></article>
      <article class="ri-panel"><h3>Open findings</h3><p class="ri-module__value">${s.findingsOpen ?? 0}</p></article>
      <article class="ri-panel"><h3>Assurance open</h3><p class="ri-module__value">${s.assuranceOpen ?? 0}</p></article>
      <article class="ri-panel"><h3>Changes registered (period)</h3><p class="ri-module__value">${act.changesRegistered ?? 0}</p></article>
    </div>
    <p class="ri-muted">No demo scores or AI conclusions.</p>
    <p><a href="${boardPdfExportUrl()}">Download board PDF</a> · <a href="#/governance">Governance</a></p>
  </section>`;
}
