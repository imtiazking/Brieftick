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
  const s = getState();
  const cat = getConnectedCatalogue(s);
  const riskPick = [];
  const seenRisk = new Set();
  for (const r of [...(cat.authorisedUatRisks || []), ...(cat.risks || [])]) {
    if (!r?.id || seenRisk.has(r.id)) continue;
    seenRisk.add(r.id);
    riskPick.push(`<option value="${esc(r.id)}">${esc(r.title || r.id.slice(0, 8))}</option>`);
  }
  const controlPick = [];
  const seenCtrl = new Set();
  for (const c of [...(cat.authorisedUatControls || []), ...(cat.controls || [])]) {
    if (!c?.id || seenCtrl.has(c.id)) continue;
    seenCtrl.add(c.id);
    controlPick.push(`<option value="${esc(c.id)}">${esc(c.name || c.title || c.id.slice(0, 8))}</option>`);
  }
  const listId = `connected-link-targets-${esc(id).replace(/[^a-zA-Z0-9_-]/g, '')}`;
  return `<section class="ri-panel" data-connected-link-panel data-obligation-id="${esc(id)}">
    <h2>Link risk or control</h2>
    <div class="ri-form">
      <label>Risk ID
        <input data-connected-link-target list="${listId}-risks" placeholder="Full risk UUID" autocomplete="off" />
      </label>
      <label>Control ID
        <input data-connected-link-control-target list="${listId}-controls" placeholder="Full control UUID" autocomplete="off" />
      </label>
      <datalist id="${listId}-risks">${riskPick.join('')}</datalist>
      <datalist id="${listId}-controls">${controlPick.join('')}</datalist>
    </div>
    <div class="ri-form__actions">
      <button type="button" class="ri-btn ri-btn--sm ri-btn--primary" data-ri-post-link data-link-type="obligation_risk" data-left-id="${esc(id)}">Link risk</button>
      <button type="button" class="ri-btn ri-btn--sm ri-btn--ghost" data-ri-post-link data-link-type="obligation_control" data-left-id="${esc(id)}">Link control</button>
    </div>
    <p class="ri-muted">Choose from the register list or paste the full UUID. Short prefixes are not accepted.</p>
  </section>`;
}
