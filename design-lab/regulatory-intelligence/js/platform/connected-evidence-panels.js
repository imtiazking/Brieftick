import { esc } from '../components.js';
import { getState, getViewWorkflowEvents } from '../store.js';
import { isConnectedEvidenceWritesEnabled, isConnectedFindingWritesEnabled } from './connected-mode.js';
import { renderConnectedWorkflowEventsTable } from './connected-governance-ui.js';

export function renderConnectedEvidenceCreatePanel() {
  if (!isConnectedEvidenceWritesEnabled(getState())) return '';
  return `<section class="ri-panel" data-connected-evidence-create>
    <h2>Register evidence</h2>
    <div class="ri-form">
      <label>Title <input data-connected-evidence-title /></label>
      <label>Type <input data-connected-evidence-type placeholder="e.g. policy, test_result" /></label>
      <label>Description <textarea data-connected-evidence-description rows="2"></textarea></label>
      <label>Source hash (optional) <input data-connected-evidence-hash placeholder="SHA-256 of uploaded file" /></label>
    </div>
    <button type="button" class="ri-btn ri-btn--primary" data-connected-create-evidence>Create evidence record</button>
    <p class="ri-muted">Tenant-scoped metadata — attach files from the evidence detail screen after creation.</p>
  </section>`;
}

export function renderConnectedEvidenceUploadPanel(evidenceId) {
  if (!isConnectedEvidenceWritesEnabled(getState())) return '';
  return `<section class="ri-panel" data-connected-evidence-upload-panel="${esc(evidenceId)}">
    <h2>Secure file upload</h2>
    <p class="ri-muted">Private bucket <code>ri-tenant-evidence</code> — short-lived download URLs only.</p>
    <label class="ri-form">File (PDF/PNG/JPEG/TXT, max 5MB)
      <input type="file" data-connected-evidence-file accept=".pdf,.png,.jpg,.jpeg,.txt" />
    </label>
    <button type="button" class="ri-btn ri-btn--primary" data-connected-evidence-upload data-evidence-id="${esc(evidenceId)}">Upload version</button>
    <button type="button" class="ri-btn ri-btn--ghost" data-connected-evidence-download data-evidence-id="${esc(evidenceId)}">Get download link</button>
  </section>`;
}

export function renderConnectedFindingStatusPanel(id, f) {
  if (!isConnectedFindingWritesEnabled(getState())) return '';
  return `<section class="ri-panel" data-connected-finding-panel="${esc(id)}">
    <h2>Remediation</h2>
    <label>Status <input data-connected-finding-status value="${esc(f.status || 'OPEN')}" /></label>
    <button type="button" class="ri-btn ri-btn--primary" data-connected-finding-save data-finding-id="${esc(id)}" data-expected-updated-at="${esc(f.updatedAt || '')}">Update status</button>
  </section>`;
}

export function renderConnectedEvidenceWorkflowPanel() {
  const events = getViewWorkflowEvents().filter((e) => e.eventType === 'EVIDENCE_LINKED').slice(0, 20);
  return `<section class="ri-panel"><h2>Evidence linkage audit</h2>
    ${renderConnectedWorkflowEventsTable(events, 'No evidence link events yet')}</section>`;
}
