import { esc, badge, formatDate } from '../components.js';
import { getControl, getState } from '../store.js';
import { isConnectedAssuranceWritesEnabled } from './connected-mode.js';
import { renderConnectedWorkflowEventsTable } from './connected-governance-ui.js';
import { getConnectedEntityWorkflowEvents } from './connected-entity-audit.js';

export function renderConnectedAssuranceCreatePanel() {
  if (!isConnectedAssuranceWritesEnabled(getState())) return '';
  return `<section class="ri-panel" data-connected-assurance-create="true">
    <h2>Register assurance review</h2>
    <p class="ri-muted">Authorised UAT reviews should link an existing Authorised UAT control. Operational reviews appear in the operational register when <code>dataScope=operational</code>.</p>
    <label>Creation mode
      <select data-connected-assurance-create-mode>
        <option value="uat_authorised" selected>Authorised UAT</option>
        <option value="operational">Operational</option>
      </select>
    </label>
    <label>Review type <input data-connected-assurance-type placeholder="e.g. UAT — Consumer Duty Fair Value Control Assurance" /></label>
    <label>Result
      <select data-connected-assurance-result>
        <option value="PASS">Pass</option>
        <option value="PASS_WITH_OBSERVATIONS">Pass with observations</option>
        <option value="FAIL">Fail</option>
        <option value="NOT_TESTED" selected>Not tested</option>
      </select>
    </label>
    <label>Notes <textarea data-connected-assurance-notes rows="3"></textarea></label>
    <label>Link control (optional UUID) <input data-connected-assurance-control-id placeholder="control id" autocomplete="off" /></label>
    <button type="button" class="ri-btn ri-btn--primary" data-connected-create-assurance-review>Create review</button>
    <p class="ri-muted">Reviewer is the signed-in user. Provenance is enforced server-side — client cannot set <code>metadata</code>.</p>
  </section>`;
}

export function renderConnectedAssuranceHistoryNote() {
  return `<p class="ri-muted">Assurance history is loaded from tenant <code>assurance_reviews</code> and entity-scoped workflow events.</p>`;
}

function renderAssuranceControlBody(assuranceId, r) {
  const controlIds =
    (r?.controlIds?.length ? r.controlIds : null) ||
    (r?.parentControlId ? [r.parentControlId] : []);
  const linked =
    (r?.linkedControls || []).length > 0
      ? r.linkedControls
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
  const writeForm = isConnectedAssuranceWritesEnabled(getState())
    ? `<div class="ri-form ri-form--compact">
    <label>Control UUID
      <input data-connected-link-control-target placeholder="Full control UUID" autocomplete="off" />
    </label>
    <button type="button" class="ri-btn ri-btn--primary" data-ri-post-link data-link-type="assurance_control" data-left-id="${esc(assuranceId)}">Link control</button>
  </div>`
    : '';
  return `${controls ? `<p>Linked control${linked.length === 1 ? '' : 's'}:</p><ul>${controls}</ul>` : '<p class="ri-muted">No linked controls yet.</p>'}
    ${writeForm}`;
}

export function renderConnectedAssuranceRelationshipsPanel(assuranceId, r, loadState = {}) {
  if (loadState.loading) {
    return `<section class="ri-panel" data-connected-assurance-links="${esc(assuranceId)}">
      <h2>Control linkage</h2>
      <p class="ri-muted">Loading linked controls from staging…</p>
    </section>`;
  }
  if (loadState.error) {
    return `<section class="ri-panel ri-panel--warn" data-connected-assurance-links="${esc(assuranceId)}">
      <h2>Control linkage</h2>
      <p role="alert">Relationship load failed: ${esc(loadState.error)}</p>
      <button type="button" class="ri-btn ri-btn--ghost" data-connected-assurance-retry="${esc(assuranceId)}">Retry load</button>
    </section>`;
  }
  return `<section class="ri-panel" data-connected-assurance-links="${esc(assuranceId)}">
    <h2>Control linkage</h2>
    ${renderAssuranceControlBody(assuranceId, r)}
  </section>`;
}

export function renderConnectedAssuranceOutcomePanel(assuranceId, r) {
  if (!isConnectedAssuranceWritesEnabled(getState())) {
    return `<section class="ri-panel"><h2>Outcome</h2>
      <p>${esc(r.result || '—')}</p>
      <p class="ri-muted">${esc(r.notes || 'No notes recorded.')}</p>
    </section>`;
  }
  return `<section class="ri-panel" data-connected-assurance-outcome="${esc(assuranceId)}">
    <h2>Update outcome</h2>
    <label>Result
      <select data-connected-assurance-outcome-result>
        <option value="PASS" ${r.result === 'PASS' ? 'selected' : ''}>Pass</option>
        <option value="PASS_WITH_OBSERVATIONS" ${r.result === 'PASS_WITH_OBSERVATIONS' ? 'selected' : ''}>Pass with observations</option>
        <option value="FAIL" ${r.result === 'FAIL' ? 'selected' : ''}>Fail</option>
        <option value="NOT_TESTED" ${r.result === 'NOT_TESTED' ? 'selected' : ''}>Not tested</option>
      </select>
    </label>
    <label>Notes <textarea data-connected-assurance-outcome-notes rows="3">${esc(r.notes || '')}</textarea></label>
    <button type="button" class="ri-btn ri-btn--primary" data-connected-assurance-save-outcome>Save outcome</button>
    ${r.updatedAt ? `<p class="ri-muted">Last updated ${formatDate(r.updatedAt)}</p>` : ''}
  </section>`;
}

export function renderConnectedAssuranceWorkflowPanel(assuranceId, loadState = {}) {
  if (loadState.loading) {
    return `<section class="ri-panel"><h2>Audit history</h2>
      <p class="ri-muted" data-connected-assurance-audit-loading="true">Loading workflow events from staging…</p></section>`;
  }
  if (loadState.error) {
    return `<section class="ri-panel ri-panel--warn"><h2>Audit history</h2>
      <p role="alert">Could not load workflow events: ${esc(loadState.error)}</p></section>`;
  }
  const events = getConnectedEntityWorkflowEvents(getState(), 'assurance_review', assuranceId);
  return `<section class="ri-panel"><h2>Audit history</h2>
    ${renderConnectedWorkflowEventsTable(events, 'No workflow events for this assurance review yet')}</section>`;
}
