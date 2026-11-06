import { esc, badge, formatDate } from '../components.js';
import { getState } from '../store.js';
import { getConnectedAssigneeLabel, getConnectedCatalogue } from './connected-catalogue.js';
import { getConnectedEntityWorkflowEvents } from './connected-entity-audit.js';
import { isConnectedImpactWritesEnabled } from './connected-mode.js';
import { renderConnectedWorkflowEventsTable } from './connected-governance-ui.js';

export function renderConnectedImpactWorkflowPanel(assessmentId) {
  const events = getConnectedEntityWorkflowEvents(getState(), 'impact_assessment', assessmentId);
  return `<section class="ri-panel"><h2>Workflow history</h2>
    ${renderConnectedWorkflowEventsTable(events, 'No workflow audit events for this assessment yet')}</section>`;
}

export function renderConnectedImpactEditPanel(id, a) {
  if (!isConnectedImpactWritesEnabled(getState())) return '';
  const s = getState();
  const members = getConnectedCatalogue(s).orgMembers || [];
  const ownerOptions = members
    .map((m) => `<option value="${esc(m.clerkUserId)}">${esc(m.label || m.clerkUserId)}</option>`)
    .join('');
  return `<section class="ri-panel" data-connected-impact-panel="${esc(id)}">
    <h2>Assessment fields</h2>
    <div class="ri-form">
      <label>Business impact <textarea data-connected-impact-field="business_impact" rows="2">${esc(a.businessImpact || '')}</textarea></label>
      <label>Operational impact <textarea data-connected-impact-field="operational_impact" rows="2">${esc(a.operationalImpact || '')}</textarea></label>
      <label>Compliance impact <textarea data-connected-impact-field="compliance_impact" rows="2">${esc(a.complianceImpact || '')}</textarea></label>
      <label>Materiality <input data-connected-impact-field="materiality" value="${esc(a.materiality || '')}" /></label>
      <label>Due date <input type="date" data-connected-impact-field="due_date" value="${esc(a.dueDateRaw || '')}" /></label>
      <label>Assign owner <select data-connected-impact-owner-select><option value="">Select…</option>${ownerOptions}</select></label>
    </div>
    <div class="ri-form__actions">
      <button type="button" class="ri-btn ri-btn--ghost" data-connected-impact-save data-assessment-id="${esc(id)}" data-expected-updated-at="${esc(a.updatedAt || '')}">Save draft</button>
      <button type="button" class="ri-btn ri-btn--ghost" data-connected-impact-assign data-assessment-id="${esc(id)}" data-expected-updated-at="${esc(a.updatedAt || '')}">Assign owner</button>
      <button type="button" class="ri-btn ri-btn--primary" data-connected-impact-action="submit" data-assessment-id="${esc(id)}" data-expected-updated-at="${esc(a.updatedAt || '')}">Submit for review</button>
      <button type="button" class="ri-btn ri-btn--primary" data-connected-impact-action="approve" data-assessment-id="${esc(id)}" data-expected-updated-at="${esc(a.updatedAt || '')}">Approve</button>
      <button type="button" class="ri-btn ri-btn--ghost" data-connected-impact-action="reject" data-assessment-id="${esc(id)}" data-expected-updated-at="${esc(a.updatedAt || '')}">Reject</button>
    </div>
    <p class="ri-muted">Status: ${badge(a.status)} · Owner: ${esc(getConnectedAssigneeLabel(s, a.ownerId) || a.ownerLabel || '—')} · Updated ${formatDate(a.updatedAt)}</p>
  </section>`;
}

export function renderConnectedCreateImpactPanel(changeId) {
  if (!isConnectedImpactWritesEnabled(getState())) return '';
  return `<section class="ri-panel">
    <h2>Impact assessment</h2>
    <p class="ri-muted">Create a tenant-scoped impact assessment linked to this regulatory change.</p>
    <button type="button" class="ri-btn ri-btn--primary" data-connected-create-impact data-change-id="${esc(changeId)}">Create impact assessment</button>
  </section>`;
}
