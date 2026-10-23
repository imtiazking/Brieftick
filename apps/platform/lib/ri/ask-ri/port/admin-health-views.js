import { getState } from './store.js';
import { computePlatformHealth } from './platform/health.js';
import { esc, badge, pageHeader, dataTable, formatDateTime } from './components.js';

export function viewAdminHealth() {
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

export function viewAdminReadiness() {
  const s = getState();
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
