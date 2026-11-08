/**
 * Step 81H — connected operations / ingestion UI (read-only).
 */
import { esc, badge, dataTable, formatDateTime, emptyState, pageHeader } from '../components.js';
import { connectedCatalogueBanner } from './connected-catalogue.js';

export function connectedReadOnlyOperationsBanner() {
  return `<p class="ri-alert ri-alert--readonly" data-connected-readonly-operations="true">Connected read-only — connector execution, ingestion retries, and monitoring configuration writes are disabled (<code>writesEnabled: false</code>). Platform operators may validate configuration via server APIs when explicitly enabled; scheduled monitoring is not activated in this step.</p>`;
}

export function renderConnectedSourceMonitoringSummary(summary, note) {
  if (!summary) {
    return emptyState('Source monitoring summary unavailable.');
  }
  const restricted = summary.operationsVisibility === 'restricted';
  const opsLine = restricted
    ? `<p class="ri-muted">Configured / active / failure counts from <code>regulatory_source_operations</code> require platform-operator access (RLS).</p>`
    : `<p class="ri-metrics-inline">
        <span>Configured <strong>${summary.configuredCount ?? '—'}</strong></span>
        <span>Active (verified success) <strong>${summary.activeMonitoredCount ?? '—'}</strong></span>
        <span>Disabled <strong>${summary.disabledCount ?? '—'}</strong></span>
        <span>Failures/degraded <strong>${summary.failedOrDegradedCount ?? '—'}</strong></span>
      </p>`;
  return `<section class="ri-panel" data-connected-monitoring-summary="true">
    <h2>Regulatory source monitoring readiness</h2>
    <p class="ri-metrics-inline">
      <span>Registered sources <strong>${summary.catalogueSourceCount ?? 0}</strong></span>
      <span>With production connector <strong>${summary.withCompatibleConnector ?? 0}</strong></span>
      <span>Ready for configuration <strong>${summary.readyForConfiguration ?? 0}</strong></span>
      <span>Connector work needed <strong>${summary.requiresConnectorWork ?? 0}</strong></span>
      <span>Validation needed <strong>${summary.requiresValidation ?? 0}</strong></span>
      <span>Unsupported <strong>${summary.unsupported ?? 0}</strong></span>
    </p>
    ${opsLine}
    ${note ? `<p class="ri-muted">${esc(note)}</p>` : ''}
    <p class="ri-muted">Readiness is derived from the reference catalogue and production connector registry — not demonstration metrics. Sources are never shown as actively monitored without <code>last_success_at</code> evidence.</p>
  </section>`;
}

export function renderConnectedOperationsMetrics(metrics) {
  if (!metrics) return emptyState('Operations metrics unavailable.');
  const restricted = metrics.operationsVisibility === 'restricted';
  const fmt = (value) => (restricted && (value === null || value === undefined) ? '—' : String(value ?? 0));
  const restrictedNote = restricted
    ? 'Connector enablement, ingestion runs, and regulatory_source_operations counts require a platform-operator session (RLS). Catalogue readiness below is from the reference inventory.'
    : metrics.ingestionRestricted
      ? 'Ingestion runs/alerts hidden — requires ingestion:read (Compliance Manager+).'
      : metrics.ingestionRunCountVisible === 0 && metrics.sourceCount > 0
        ? 'No ingestion runs visible for this session.'
        : '';
  return `<p class="ri-metrics-inline">
    <span>Regulators <strong>${metrics.regulatorCount ?? 0}</strong></span>
    <span>Catalogue sources <strong>${metrics.catalogueSourceCount ?? metrics.sourceCount ?? 0}</strong></span>
    <span>Ops rows <strong>${fmt(metrics.sourcesWithOperationsRow)}</strong></span>
    <span>Connectors enabled <strong>${fmt(metrics.sourcesEnabled)}</strong></span>
    <span>Runs (visible) <strong>${fmt(metrics.ingestionRunCountVisible)}</strong></span>
    <span>Alerts <strong>${metrics.operationalAlertCount ?? 0}</strong></span>
  </p>${restrictedNote ? `<p class="ri-muted">${esc(restrictedNote)}</p>` : ''}
  <p class="ri-muted">Snapshots and tenant notifications are not exposed on this API (platform-operator restrictions).</p>`;
}

export function renderConnectedRegulatorySourcesTable(sources) {
  if (!sources?.length) return emptyState('No regulatory sources in catalogue.');
  const rows = sources.map(
    (src) => `<tr>
      <td class="ri-mono">${esc(src.externalKey)}</td>
      <td>${esc(src.name)}</td>
      <td>${esc(src.regulatorAcronym || '—')}</td>
      <td>${badge(src.productionStatus)}</td>
      <td>${esc(src.ingestionMode || '—')}</td>
      <td>${badge(src.monitoringState)}</td>
      <td>${src.readinessBucket ? badge(src.readinessBucket.replaceAll('_', ' ')) : '—'}</td>
      <td>${src.connectorId ? esc(src.connectorId) : '—'}</td>
      <td>${src.lastSuccessAt ? formatDateTime(src.lastSuccessAt) : '—'}</td>
      <td>${src.lastFailureAt ? formatDateTime(src.lastFailureAt) : '—'}</td>
      <td>${src.connectorEnabled === true ? badge('Enabled') : src.connectorEnabled === false ? badge('Disabled') : '—'}</td>
    </tr>`,
  );
  return `${dataTable(
    ['Key', 'Name', 'Regulator', 'Production', 'Mode', 'Monitoring', 'Readiness', 'Connector', 'Last success', 'Last failure', 'Connector enabled'],
    rows,
  )}
  <p class="ri-muted">${esc(sources[0]?.monitoringLabel ? 'Monitoring states derive from regulatory_source_operations when present — registered sources are not shown as actively monitored.' : '')}</p>`;
}

export function renderConnectedIngestionRunsTable(runs) {
  if (!runs?.length) {
    return emptyState('No ingestion runs visible for your role (requires ingestion:read and platform-operator RLS where applicable).');
  }
  const rows = runs.map(
    (r) => `<tr>
      <td><a href="#/ingestion/run/${esc(r.id)}">${esc(r.id.slice(0, 8))}…</a></td>
      <td>${esc(r.sourceKey || '—')}</td>
      <td>${badge(r.status)}</td>
      <td>${esc(r.runType)}</td>
      <td>${r.startedAt ? formatDateTime(r.startedAt) : '—'}</td>
      <td>${r.recordsNew ?? '—'} / ${r.recordsDiscovered ?? '—'}</td>
      <td>${esc(r.errorSummary || '—')}</td>
    </tr>`,
  );
  return dataTable(['Run', 'Source', 'Status', 'Type', 'Started', 'New/Discovered', 'Error'], rows);
}

export function renderConnectedOperationalAlertsTable(alerts) {
  if (!alerts?.length) {
    return emptyState('No operational alerts visible for your role.');
  }
  const rows = alerts.map(
    (a) => `<tr>
      <td>${badge(a.severity)}</td>
      <td>${esc(a.category)}</td>
      <td>${esc(a.title)}</td>
      <td>${esc(a.sourceKey || '—')}</td>
      <td>${badge(a.status)}</td>
      <td>${a.lastSeenAt ? formatDateTime(a.lastSeenAt) : '—'}</td>
    </tr>`,
  );
  return dataTable(['Severity', 'Category', 'Title', 'Source', 'Status', 'Last seen'], rows);
}

export function connectedOperationsUnavailable(title, detail) {
  return `${pageHeader(title, 'Connected read-only')}
    <p class="ri-muted">${esc(detail)}</p>`;
}
