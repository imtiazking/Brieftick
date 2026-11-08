import { esc, badge, formatDate } from '../components.js';
import { getState } from '../store.js';
import { getConnectedAssigneeLabel, getConnectedCatalogue } from './connected-catalogue.js';
import { isConnectedActionWritesEnabled } from './connected-mode.js';
import { renderConnectedWorkflowEventsTable } from './connected-governance-ui.js';
import { getConnectedEntityWorkflowEvents } from './connected-entity-audit.js';

export function renderConnectedActionCreateBanner() {
  if (!isConnectedActionWritesEnabled(getState())) return '';
  const cat = getConnectedCatalogue(getState());
  const members = cat.orgMembers || [];
  const ownerOptions = members
    .map((m) => `<option value="${esc(m.clerkUserId)}">${esc(m.label || m.clerkUserId)}</option>`)
    .join('');
  return `<section class="ri-panel" data-connected-create-action>
    <h2>Create remediation action</h2>
    <p class="ri-muted">Authorised UAT actions must match linked obligation, risk, and control provenance. Operational actions stay in the operational register when <code>dataScope=operational</code>.</p>
    <div class="ri-form">
      <label>Title <input data-connected-action-create-title placeholder="Remediation action title" /></label>
      <label>Description <textarea data-connected-action-create-description rows="2" placeholder="Scope and expected outcome…"></textarea></label>
      <label>Priority <input data-connected-action-create-priority placeholder="e.g. High" /></label>
      <label>Due date <input type="date" data-connected-action-create-due /></label>
      <label>Owner
        <select data-connected-action-create-owner>
          <option value="">Current user (default)</option>
          ${ownerOptions}
        </select>
      </label>
      <label>Obligation ID <input data-connected-action-create-obligation placeholder="Full obligation UUID (optional)" autocomplete="off" /></label>
      <label>Risk ID <input data-connected-action-create-risk placeholder="Full risk UUID (optional)" autocomplete="off" /></label>
      <label>Control ID <input data-connected-action-create-control placeholder="Full control UUID (optional)" autocomplete="off" /></label>
      <label>Creation mode
        <select data-connected-action-create-mode>
          <option value="uat_authorised">Authorised UAT</option>
          <option value="operational">Operational</option>
        </select>
      </label>
    </div>
    <button type="button" class="ri-btn ri-btn--primary" data-connected-create-action-btn>Create action</button>
  </section>`;
}

export function renderConnectedActionEditPanel(id, a) {
  if (!isConnectedActionWritesEnabled(getState())) return '';
  const s = getState();
  const cat = getConnectedCatalogue(s);
  const members = cat.orgMembers || [];
  const ownerOptions = members
    .map((m) => `<option value="${esc(m.clerkUserId)}">${esc(m.label || m.clerkUserId)}</option>`)
    .join('');
  const prov = a.dataProvenance || '—';
  const lab = a.labClassificationLabel || a.labClassification || '';
  const statusRaw = a.statusCode || String(a.status || 'OPEN').toUpperCase().replace(/\s+/g, '_');
  return `<section class="ri-panel" data-connected-action-panel="${esc(id)}">
    <h2>Update action</h2>
    <p class="ri-muted">Provenance: <strong>${esc(prov)}</strong>${lab ? ` · ${esc(lab)}` : ''}</p>
    <div class="ri-form">
      <label>Title <input data-connected-action-field="title" value="${esc(a.title || a.description || '')}" /></label>
      <label>Description <textarea data-connected-action-field="description" rows="2">${esc(a.description || '')}</textarea></label>
      <label>Priority <input data-connected-action-field="priority" value="${esc(a.priority || '')}" /></label>
      <label>Due date <input type="date" data-connected-action-field="due_date" value="${esc(String(a.dueDate || '').slice(0, 10))}" /></label>
      <label>Status
        <select data-connected-action-field="status">
          ${['OPEN', 'IN_PROGRESS', 'COMPLETE', 'BLOCKED', 'CLOSED'].map(
            (st) => `<option value="${st}"${statusRaw === st ? ' selected' : ''}>${st}</option>`,
          ).join('')}
        </select>
      </label>
      <label>Reassign owner
        <select data-connected-action-owner-select>
          <option value="">Keep current</option>
          ${ownerOptions}
        </select>
      </label>
    </div>
    <button type="button" class="ri-btn ri-btn--primary" data-connected-action-save data-action-id="${esc(id)}" data-expected-updated-at="${esc(a.updatedAt || '')}">Save</button>
    <p class="ri-muted">Owner: ${esc(getConnectedAssigneeLabel(s, a.ownerId) || a.owner || '—')} · Updated ${formatDate(a.updatedAt)}</p>
  </section>`;
}

export function renderConnectedActionWorkflowPanel(actionId) {
  const events = getConnectedEntityWorkflowEvents(getState(), 'action', actionId);
  return `<section class="ri-panel"><h2>Audit history</h2>
    ${renderConnectedWorkflowEventsTable(events, 'No workflow events for this action yet')}</section>`;
}
