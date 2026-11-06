import { esc, badge, formatDate } from '../components.js';
import { getState } from '../store.js';
import { getConnectedAssigneeLabel, getConnectedCatalogue } from './connected-catalogue.js';
import { isConnectedObligationWritesEnabled } from './connected-mode.js';
import { renderConnectedWorkflowEventsTable } from './connected-governance-ui.js';
import { getConnectedEntityWorkflowEvents } from './connected-entity-audit.js';

export function renderConnectedObligationWorkflowPanel(obligationId) {
  const events = getConnectedEntityWorkflowEvents(getState(), 'regulatory_obligation', obligationId);
  return `<section class="ri-panel"><h2>Audit history</h2>
    ${renderConnectedWorkflowEventsTable(events, 'No workflow events for this obligation yet')}</section>`;
}

export function renderConnectedObligationEditPanel(id, o) {
  if (!isConnectedObligationWritesEnabled(getState())) return '';
  const s = getState();
  const cat = getConnectedCatalogue(s);
  const members = cat.orgMembers || [];
  const options = members
    .map((m) => `<option value="${esc(m.clerkUserId)}">${esc(m.label || m.clerkUserId)}</option>`)
    .join('');
  return `<section class="ri-panel" data-connected-obligation-panel="${esc(id)}">
    <h2>Obligation maintenance</h2>
    <div class="ri-form">
      <label>Statement <textarea data-connected-obligation-field="obligation_statement" rows="3">${esc(o.statement || o.title || '')}</textarea></label>
      <label>Citation <input data-connected-obligation-field="citation" value="${esc(o.citation || '')}" /></label>
      <label>Priority <input data-connected-obligation-field="priority" value="${esc(o.priority || '')}" /></label>
      <label>Due date <input type="date" data-connected-obligation-field="due_date" value="${esc(o.dueDateRaw || '')}" /></label>
      <label>Status <input data-connected-obligation-field="status" value="${esc(o.statusCode || o.status || 'DRAFT')}" /></label>
      <label>Assign owner
        <select data-connected-obligation-owner-select>
          <option value="">Select member…</option>
          ${options}
        </select>
      </label>
    </div>
    <div class="ri-form__actions">
      <button type="button" class="ri-btn ri-btn--primary" data-connected-obligation-save data-obligation-id="${esc(id)}" data-expected-updated-at="${esc(o.updatedAt || '')}">Save</button>
      <button type="button" class="ri-btn ri-btn--ghost" data-connected-obligation-assign data-obligation-id="${esc(id)}" data-expected-updated-at="${esc(o.updatedAt || '')}">Assign owner</button>
    </div>
    <p class="ri-muted">Owner: ${esc(getConnectedAssigneeLabel(s, o.ownerId) || o.ownerLabel || '—')} · Updated ${formatDate(o.updatedAt)}</p>
  </section>`;
}

export function renderConnectedCreateObligationPanel(changeId) {
  if (!isConnectedObligationWritesEnabled(getState())) return '';
  return `<section class="ri-panel" data-connected-create-obligation="${esc(changeId)}">
    <h2>Regulatory obligation</h2>
    <div class="ri-form">
      <label>Statement <textarea data-connected-obligation-create-statement rows="2" placeholder="Describe the implementation obligation…"></textarea></label>
      <label>Citation <input data-connected-obligation-create-citation /></label>
      <label>Due date <input type="date" data-connected-obligation-create-due /></label>
    </div>
    <button type="button" class="ri-btn ri-btn--primary" data-connected-create-obligation data-change-id="${esc(changeId)}">Create obligation</button>
  </section>`;
}

export function renderConnectedObligationLinkPanel(id, o) {
  if (!isConnectedObligationWritesEnabled(getState())) return '';
  return `<section class="ri-panel">
    <h2>Link risk or control</h2>
    <div class="ri-form__actions">
      <input data-connected-link-right placeholder="Risk or control UUID" aria-label="Target record id" />
      <button type="button" class="ri-btn ri-btn--sm ri-btn--ghost" data-connected-link="obligation_risk" data-left-id="${esc(id)}">Link risk</button>
      <button type="button" class="ri-btn ri-btn--sm ri-btn--ghost" data-connected-link="obligation_control" data-left-id="${esc(id)}">Link control</button>
    </div>
    <p class="ri-muted">Paste a tenant risk or control id from the register.</p>
  </section>`;
}
