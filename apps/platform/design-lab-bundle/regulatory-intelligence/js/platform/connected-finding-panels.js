import { esc, badge, formatDate } from '../components.js';
import { getControl, getRisk, getState } from '../store.js';
import { isConnectedFindingWritesEnabled } from './connected-mode.js';
import { renderConnectedWorkflowEventsTable } from './connected-governance-ui.js';
import { getConnectedEntityWorkflowEvents } from './connected-entity-audit.js';
export function renderConnectedFindingCreatePanel() {
  if (!isConnectedFindingWritesEnabled(getState())) return '';
  return `<section class="ri-panel" data-connected-finding-create-panel="true">
    <h2>Register finding</h2>
    <p class="ri-muted">Authorised UAT findings should reference an existing Authorised UAT control and/or risk. Operational findings appear in the operational register when <code>dataScope=operational</code>.</p>
    <div class="ri-form">
      <label>Title <input data-connected-finding-title type="text" /></label>
      <label>Description <textarea data-connected-finding-description rows="2"></textarea></label>
      <label>Severity
        <select data-connected-finding-severity>
          <option value="HIGH">HIGH</option>
          <option value="MEDIUM" selected>MEDIUM</option>
          <option value="LOW">LOW</option>
        </select>
      </label>
      <label>Due date <input type="date" data-connected-finding-due /></label>
      <label>Control ID (Authorised UAT) <input data-connected-finding-control placeholder="Full control UUID (recommended for UAT)" autocomplete="off" /></label>
      <label>Risk ID (optional) <input data-connected-finding-risk placeholder="Full risk UUID" autocomplete="off" /></label>
      <label>Creation mode
        <select data-connected-finding-create-mode>
          <option value="uat_authorised" selected>Authorised UAT</option>
          <option value="operational">Operational</option>
        </select>
      </label>
    </div>
    <button type="button" class="ri-btn ri-btn--primary" data-connected-finding-submit>Create finding</button>
  </section>`;
}

export function renderConnectedFindingLinkPanel(findingId, f, loadState = {}) {
  if (!isConnectedFindingWritesEnabled(getState())) return '';
  if (loadState.loading) {
    return `<section class="ri-panel" data-connected-link-panel data-finding-id="${esc(findingId)}">
      <h2>Risk &amp; control linkage</h2>
      <p class="ri-muted" data-connected-finding-links-loading="true">Loading risk and control relationships from staging…</p>
    </section>`;
  }
  if (loadState.error) {
    return `<section class="ri-panel ri-panel--warn" data-connected-link-panel data-finding-id="${esc(findingId)}">
      <h2>Risk &amp; control linkage</h2>
      <p role="alert">Relationship load failed: ${esc(loadState.error)}</p>
      <p class="ri-muted">Use <strong>Retry load</strong> above to refetch authoritative finding detail.</p>
    </section>`;
  }
  const controlIds =
    (f?.controlIds?.length ? f.controlIds : null) ||
    (f?.parentControlId ? [f.parentControlId] : []);
  const linked =
    (f?.linkedControls || []).length > 0
      ? f.linkedControls
      : controlIds.map((id) => ({
          id,
          name: getControl(id)?.name || getControl(id)?.title || '',
        }));
  const controls = linked
    .map((c) => {
      const label = c.name?.trim() ? c.name : `${String(c.id).slice(0, 8)}…`;
      return `<li><a href="#/control/${esc(c.id)}">${esc(label)}</a></li>`;
    })
    .join('');
  const riskId = f?.parentRiskId;
  const risk = riskId ? getRisk(riskId) : null;
  const riskLine = riskId
    ? `<p>Related risk: <a href="#/risk/${esc(riskId)}">${esc(risk?.title || `${String(riskId).slice(0, 8)}…`)}</a></p>`
    : '';
  return `<section class="ri-panel" data-connected-link-panel data-finding-id="${esc(findingId)}">
    <h2>Risk &amp; control linkage</h2>
    ${riskLine || '<p class="ri-muted">No related risk recorded on finding metadata.</p>'}
    ${controls ? `<p>Linked controls:</p><ul>${controls}</ul>` : '<p class="ri-muted">No linked controls yet.</p>'}
    <label>Control UUID
      <input data-connected-link-control-target placeholder="Full control UUID" autocomplete="off" />
    </label>
    <button type="button" class="ri-btn ri-btn--primary" data-ri-post-link data-link-type="finding_control" data-left-id="${esc(findingId)}">Link control</button>
  </section>`;
}

export function renderConnectedFindingWorkflowPanel(findingId, loadState = {}) {
  if (loadState.loading) {
    return `<section class="ri-panel"><h2>Audit history</h2>
      <p class="ri-muted" data-connected-finding-audit-loading="true">Loading workflow events from staging…</p></section>`;
  }
  if (loadState.error) {
    return `<section class="ri-panel ri-panel--warn"><h2>Audit history</h2>
      <p role="alert">Could not load workflow events: ${esc(loadState.error)}</p></section>`;
  }
  const events = getConnectedEntityWorkflowEvents(getState(), 'finding', findingId);
  return `<section class="ri-panel"><h2>Audit history</h2>
    ${renderConnectedWorkflowEventsTable(events, 'No workflow events for this finding yet')}</section>`;
}

export function renderConnectedFindingRemediationPanel(findingId, f) {
  if (!isConnectedFindingWritesEnabled(getState())) {
    return '<p class="ri-muted">Finding status updates are disabled when finding writes are off.</p>';
  }
  return `<section class="ri-panel" data-connected-finding-workflow="${esc(findingId)}">
    <h2>Remediation</h2>
    <p>${badge(f.severity)} · ${badge(f.status)}</p>
    <label>Status
      <select data-connected-finding-status-select>
        <option value="OPEN" ${f.status === 'OPEN' ? 'selected' : ''}>Open</option>
        <option value="IN_REMEDIATION" ${f.status === 'IN_REMEDIATION' ? 'selected' : ''}>In remediation</option>
        <option value="CLOSED" ${f.status === 'CLOSED' ? 'selected' : ''}>Closed</option>
      </select>
    </label>
    <button type="button" class="ri-btn ri-btn--primary" data-connected-finding-status-save data-finding-id="${esc(findingId)}" data-expected-updated-at="${esc(f.updatedAt || '')}">Save status</button>
    <p class="ri-muted">Changes persist to tenant <code>findings</code> and <code>workflow_events</code>.</p>
  </section>`;
}
