import { esc, badge } from '../components.js';
import { getState, getViewWorkflowEvents } from '../store.js';
import { isConnectedControlWritesEnabled, isConnectedRiskWritesEnabled } from './connected-mode.js';
import { renderConnectedWorkflowEventsTable } from './connected-governance-ui.js';

export function renderConnectedRiskEditPanel(id, r) {
  if (!isConnectedRiskWritesEnabled(getState())) return '';
  const prov = r.dataProvenance || '—';
  const lab = r.labClassificationLabel || r.labClassification || '';
  return `<section class="ri-panel" data-connected-risk-panel="${esc(id)}">
    <h2>Update risk</h2>
    <p class="ri-muted">Saved provenance: <strong>${esc(prov)}</strong>${lab ? ` · ${esc(lab)}` : ''}</p>
    <div class="ri-form">
      <label>Title <input data-connected-risk-field="title" value="${esc(r.title || '')}" /></label>
      <label>Description <textarea data-connected-risk-field="description" rows="2">${esc(r.description || '')}</textarea></label>
      <label>Category <input data-connected-risk-field="category" value="${esc(r.category || '')}" /></label>
      <label>Inherent <input data-connected-risk-field="inherent_risk" value="${esc(r.inherentRisk || '')}" /></label>
      <label>Residual <input data-connected-risk-field="residual_risk" value="${esc(r.residualRisk || '')}" /></label>
      <label>Review date <input type="date" data-connected-risk-field="review_date" value="${esc(String(r.reviewDate || '').slice(0, 10))}" /></label>
      <label>Status <input data-connected-risk-field="status" value="${esc(r.status || 'OPEN')}" /></label>
    </div>
    <button type="button" class="ri-btn ri-btn--primary" data-connected-risk-save data-risk-id="${esc(id)}" data-expected-updated-at="${esc(r.updatedAt || '')}">Save</button>
  </section>`;
}

export function renderConnectedControlEditPanel(id, c) {
  if (!isConnectedControlWritesEnabled(getState())) return '';
  const prov = c.dataProvenance || '—';
  const lab = c.labClassificationLabel || c.labClassification || '';
  return `<section class="ri-panel" data-connected-control-panel="${esc(id)}">
    <h2>Update control</h2>
    <p class="ri-muted">Saved provenance: <strong>${esc(prov)}</strong>${lab ? ` · ${esc(lab)}` : ''}</p>
    <div class="ri-form">
      <label>Name <input data-connected-control-field="name" value="${esc(c.name || c.title || '')}" /></label>
      <label>Description <textarea data-connected-control-field="description" rows="2">${esc(c.description || '')}</textarea></label>
      <label>Control type <input data-connected-control-field="control_type" value="${esc(c.controlType || '')}" /></label>
      <label>Frequency <input data-connected-control-field="frequency" value="${esc(c.frequency || '')}" /></label>
      <label>Effectiveness <input data-connected-control-field="effectiveness" value="${esc(c.effectiveness || '')}" /></label>
      <label>Testing status <input data-connected-control-field="testing_status" value="${esc(c.testingStatus || '')}" /></label>
      <label>Status <input data-connected-control-field="status" value="${esc(c.status || 'ACTIVE')}" /></label>
    </div>
    <button type="button" class="ri-btn ri-btn--primary" data-connected-control-save data-control-id="${esc(id)}" data-expected-updated-at="${esc(c.updatedAt || '')}">Save</button>
  </section>`;
}

export function renderConnectedRiskCreateBanner() {
  if (!isConnectedRiskWritesEnabled(getState())) return '';
  return `<section class="ri-panel" data-connected-create-risk>
    <h2>Create risk</h2>
    <p class="ri-muted">Use <strong>creation mode</strong> for operational vs authorised UAT; obligation-derived risks follow parent provenance.</p>
    <div class="ri-form">
      <label>Title <input data-connected-risk-create-title placeholder="Risk title" /></label>
      <label>Description <textarea data-connected-risk-create-description rows="2"></textarea></label>
      <label>Category <input data-connected-risk-create-category /></label>
      <label>Inherent <input data-connected-risk-create-inherent /></label>
      <label>Residual <input data-connected-risk-create-residual /></label>
      <label>Review date <input type="date" data-connected-risk-create-review /></label>
      <label>Creation mode
        <select data-connected-risk-create-mode>
          <option value="operational">Operational</option>
          <option value="uat_authorised">Authorised UAT</option>
        </select>
      </label>
    </div>
    <button type="button" class="ri-btn ri-btn--primary" data-connected-create-risk-btn>Create</button>
  </section>`;
}

export function renderConnectedControlCreateBanner() {
  if (!isConnectedControlWritesEnabled(getState())) return '';
  return `<section class="ri-panel" data-connected-create-control>
    <h2>Create control</h2>
    <p class="ri-muted">Standalone controls require creation mode; controls created from a risk workflow inherit risk classification.</p>
    <div class="ri-form">
      <label>Name <input data-connected-control-create-name placeholder="Control name" /></label>
      <label>Description <textarea data-connected-control-create-description rows="2"></textarea></label>
      <label>Control type <input data-connected-control-create-type /></label>
      <label>Frequency <input data-connected-control-create-frequency /></label>
      <label>Effectiveness <input data-connected-control-create-effectiveness /></label>
      <label>Testing status <input data-connected-control-create-testing /></label>
      <label>Creation mode
        <select data-connected-control-create-mode>
          <option value="operational">Operational</option>
          <option value="uat_authorised">Authorised UAT</option>
        </select>
      </label>
    </div>
    <button type="button" class="ri-btn ri-btn--primary" data-connected-create-control-btn>Create</button>
  </section>`;
}

export function renderConnectedRiskWorkflowPanel(riskId) {
  const events = getViewWorkflowEvents().filter(
    (e) => e.entityType === 'risk' || (e.metadata?.risk_id === riskId),
  );
  return `<section class="ri-panel"><h2>Related workflow</h2>
    ${renderConnectedWorkflowEventsTable(events.slice(0, 15), 'No linked workflow events')}</section>`;
}

export function renderConnectedControlWorkflowPanel(controlId) {
  const events = getViewWorkflowEvents().filter(
    (e) => e.entityType === 'control' || e.metadata?.control_id === controlId,
  );
  return `<section class="ri-panel"><h2>Related workflow</h2>
    ${renderConnectedWorkflowEventsTable(events.slice(0, 15), 'No linked workflow events')}</section>`;
}
