import { getState, getConnectedOperationsMetrics, getConnectedSourceMonitoringSummary, getConnectedSourceMonitoringNote } from './store.js';
import { computePlatformHealth } from './platform/health.js';
import { esc, badge, pageHeader, dataTable, formatDateTime } from './components.js';
import { isConnectedBackendActive } from './platform/connected-mode.js';
import { connectedCatalogueBanner } from './platform/connected-catalogue.js';
import {
  connectedReadOnlyOperationsBanner,
  renderConnectedOperationsMetrics,
  renderConnectedSourceMonitoringSummary,
} from './platform/connected-operations-ui.js';

export function viewAdminHealth() {
  const s = getState();
  if (isConnectedBackendActive(s)) {
    const session = s.platformConfig?.backendSession;
    const metrics = getConnectedOperationsMetrics();
    const backendOk = s.platformConfig?.backendReady === true;
    const catCount = s.platformConfig?.cataloguePublicationCount;
    return `${pageHeader('Platform health', 'FORGENIQ backend connectivity · connected read-only')}
      ${connectedCatalogueBanner(s)}
      ${connectedReadOnlyOperationsBanner()}
      ${renderConnectedSourceMonitoringSummary(getConnectedSourceMonitoringSummary(), getConnectedSourceMonitoringNote())}
      <dl class="ri-dl ri-dl--compact">
        <dt>Backend session</dt><dd>${backendOk ? badge('Healthy') : badge('Unavailable')}</dd>
        <dt>Environment</dt><dd>${esc(s.platformConfig?.environment || 'connected')}</dd>
        <dt>Lab phase</dt><dd class="ri-mono">${esc(session?.phase || '—')}</dd>
        <dt>Organisation</dt><dd class="ri-mono">${esc(session?.organisationId || s.connectivity?.activeOrganisationId || '—')}</dd>
        <dt>Role</dt><dd>${esc(session?.role || '—')}</dd>
        <dt>Writes</dt><dd>${session?.writesEnabled === false ? 'Disabled (read-only)' : esc(String(session?.writesEnabled ?? '—'))}</dd>
        <dt>Catalogue publications (readiness)</dt><dd>${catCount != null ? esc(String(catCount)) : '—'}</dd>
      </dl>
      <section class="ri-panel"><h2>Ingestion catalogue</h2>
        ${renderConnectedOperationsMetrics(metrics)}
      </section>
      <p class="ri-muted">Design Lab LocalAdapter health percentages are demo-only — not shown here.</p>
      <p><a href="#/admin/readiness">Readiness dashboard</a> · <a href="#/admin">Administration</a></p>`;
  }
  const health = computePlatformHealth(getState());
  const rows = health.components.map(
    (c) => `<tr><td>${esc(c.name)}</td><td>${badge(c.status)}</td><td>${esc(c.detail)}</td></tr>`
  );
  return `
    ${pageHeader('Platform health', 'Design Lab component status — no secrets or live provider credentials.')}
    <dl class="ri-dl ri-dl--compact">
      <dt>Environment</dt><dd>${esc(health.environment)}</dd>
      <dt>Adapter</dt><dd>${esc(health.adapter)}</dd>
      <dt>Schema</dt><dd class="ri-mono">v${esc(String(health.schemaVersion))}</dd>
      <dt>Checked</dt><dd>${formatDateTime(health.checkedAt)}</dd>
    </dl>
    ${dataTable(['Component', 'Status', 'Detail'], rows, 'No components')}
    <p class="ri-muted"><a href="#/admin/readiness">Production readiness dashboard</a> · <a href="#/admin/platform">Platform administration</a></p>`;
}

function renderOperationalReadinessTable(readiness) {
  if (!readiness?.components?.length) {
    return '<p class="ri-muted">Operational readiness components not loaded — reconnect from Platform health.</p>';
  }
  const rows = readiness.components.map((c) => {
    const badgeClass =
      c.state === 'HEALTHY'
        ? 'Healthy'
        : c.state === 'DEGRADED'
          ? 'Degraded'
          : c.state === 'DISABLED'
            ? 'Disabled'
            : 'Failed';
    const detail = [c.summary, c.lastSuccessAt ? `Last success: ${c.lastSuccessAt}` : '']
      .filter(Boolean)
      .join(' · ');
    return `<tr><td>${esc(c.label)}</td><td>${badge(badgeClass)}</td><td>${esc(detail)}</td></tr>`;
  });
  return `${dataTable(['Service', 'State', 'Detail'], rows, 'No readiness data')}
    <p class="ri-muted">Evidence timestamp: ${esc(readiness.evidenceAt || '—')} · Environment: ${esc(readiness.environment || '—')}</p>`;
}

export function viewAdminReadiness() {
  const s = getState();
  if (isConnectedBackendActive(s)) {
    const session = s.platformConfig?.backendSession;
    const metrics = getConnectedOperationsMetrics();
    const opReady = s.platformConfig?.operationalReadiness;
    return `${pageHeader('Readiness dashboard', 'Server-reported staging operational status (not simulated LocalAdapter health)')}
      ${connectedCatalogueBanner(s)}
      ${renderConnectedSourceMonitoringSummary(getConnectedSourceMonitoringSummary(), getConnectedSourceMonitoringNote())}
      <section class="ri-panel"><h2>Operational readiness (API)</h2>
      ${renderOperationalReadinessTable(opReady)}
      </section>
      <ul class="ri-list">
        <li>Backend ready: <strong>${s.platformConfig?.backendReady ? 'Yes' : 'No'}</strong></li>
        <li>Organisation: <strong class="ri-mono">${esc(session?.organisationId || '—')}</strong></li>
        <li>Role: <strong>${esc(session?.role || '—')}</strong></li>
        <li>Staging project match: <strong>${s.platformConfig?.stagingProjectMatch ? 'Yes' : 'No'}</strong></li>
        <li>Catalogue publications: <strong>${s.platformConfig?.cataloguePublicationCount ?? '—'}</strong></li>
      </ul>
      <p class="ri-muted">Demo LocalAdapter percentages are hidden in connected mode. States: HEALTHY · DEGRADED · DISABLED · FAILED.</p>
      <p><a href="#/admin/health">Platform health</a></p>`;
  }
  const health = computePlatformHealth(s);
  const degraded = health.components.filter((c) => c.status !== 'Healthy').length;
  return `
    ${pageHeader('Readiness dashboard', 'Honest Design Lab status — not production deployable.')}
    <p class="ri-banner ri-banner--warn" role="status"><strong>PRODUCTION DEPLOYABLE: NO</strong> — LocalAdapter, mock RBAC, fixture AI, and browser persistence only.</p>
    <ul class="ri-list">
      <li>Schema version: <strong>v${esc(String(s.schemaVersion))}</strong></li>
      <li>AI execution mode: <strong>${esc(s.platformConfig?.aiExecutionMode || 'fixture')}</strong></li>
      <li>Components degraded/disabled: <strong>${degraded}</strong></li>
      <li>Persistence recovery used: <strong>${s.persistenceRecovery?.usedBaseline ? 'Yes' : 'No'}</strong></li>
    </ul>
    <p>See <code>architecture/production-readiness.md</code>, <code>architecture/technical-debt.md</code>, and runbooks under <code>architecture/runbooks/</code>.</p>
    <p><a href="#/admin/health">Platform health</a></p>`;
}
