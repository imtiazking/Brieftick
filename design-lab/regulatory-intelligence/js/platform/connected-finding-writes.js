/**
 * Connected finding PATCH (status, remediation lifecycle).
 */
import { notify } from '../store.js';
import { initConnectedCatalogueState } from './connected-catalogue.js';
import { isConnectedFindingWritesEnabled } from './connected-mode.js';

function apiBase(state) {
  return (state.platformConfig?.apiBaseUrl || '/api/ri-lab').replace(/\/$/, '');
}

export async function patchConnectedFinding(state, findingId, fields) {
  if (!isConnectedFindingWritesEnabled(state)) throw new Error('connected_writes_disabled');
  const base = apiBase(state);
  const res = await fetch(`${base}/findings/${encodeURIComponent(findingId)}`, {
    method: 'PATCH',
    credentials: 'same-origin',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) throw new Error(body.error || 'finding_update_failed');
  const cat = initConnectedCatalogueState(state);
  const idx = (cat.findings || []).findIndex((f) => f.id === findingId);
  if (idx >= 0) cat.findings[idx] = { ...cat.findings[idx], ...body.finding, _connected: true };
  notify();
  return body;
}

export function renderConnectedFindingWorkflowPanel(finding) {
  if (!finding?.id) return '';
  return `<section class="ri-panel" data-connected-finding-workflow="${finding.id}">
    <h3>Finding workflow (connected)</h3>
    <label>Status
      <select data-connected-finding-status-select>
        <option value="OPEN" ${finding.status === 'OPEN' ? 'selected' : ''}>Open</option>
        <option value="IN_REMEDIATION" ${finding.status === 'IN_REMEDIATION' ? 'selected' : ''}>In remediation</option>
        <option value="CLOSED" ${finding.status === 'CLOSED' ? 'selected' : ''}>Closed</option>
      </select>
    </label>
    <button type="button" class="ri-btn ri-btn--primary" data-connected-finding-status-save data-finding-id="${finding.id}">Save status</button>
    <p class="ri-muted">Status changes persist to tenant <code>findings</code> and <code>workflow_events</code>.</p>
  </section>`;
}
