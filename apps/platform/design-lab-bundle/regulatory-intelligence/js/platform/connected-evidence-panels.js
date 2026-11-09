import { esc, badge, formatDate } from '../components.js';
import { getState } from '../store.js';
import { isConnectedEvidenceWritesEnabled, isConnectedFindingWritesEnabled } from './connected-mode.js';
import { renderConnectedWorkflowEventsTable } from './connected-governance-ui.js';
import { getConnectedEntityWorkflowEvents } from './connected-entity-audit.js';

export function renderConnectedEvidenceCreatePanel() {
  if (!isConnectedEvidenceWritesEnabled(getState())) return '';
  return `<section class="ri-panel" data-connected-evidence-create>
    <h2>Register evidence</h2>
    <p class="ri-muted">Authorised UAT evidence must align with an existing Authorised UAT control. Operational evidence stays in the operational register when <code>dataScope=operational</code>. Do not enter fabricated source hashes — attach files after create if needed.</p>
    <div class="ri-form">
      <label>Title <input data-connected-evidence-title /></label>
      <label>Type <input data-connected-evidence-type placeholder="e.g. uat_test_artifact, test_result" /></label>
      <label>Description <textarea data-connected-evidence-description rows="2"></textarea></label>
      <label>Control ID (Authorised UAT) <input data-connected-evidence-create-control placeholder="Full control UUID (required for Authorised UAT)" autocomplete="off" /></label>
      <label>Creation mode
        <select data-connected-evidence-create-mode>
          <option value="uat_authorised" selected>Authorised UAT</option>
          <option value="operational">Operational</option>
        </select>
      </label>
      <label>Source hash (optional) <input data-connected-evidence-hash placeholder="SHA-256 after upload only — leave blank unless known" /></label>
    </div>
    <button type="button" class="ri-btn ri-btn--primary" data-connected-create-evidence>Create evidence record</button>
    <p class="ri-muted">Attach labelled UAT test documents from the evidence detail page after creation.</p>
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

export function renderConnectedEvidenceLinkPanel(evidenceId, e) {
  if (!isConnectedEvidenceWritesEnabled(getState())) return '';
  const controls = (e?.controlIds || [])
    .map((cid) => `<li><a href="#/control/${esc(cid)}">${esc(String(cid).slice(0, 8))}…</a></li>`)
    .join('');
  return `<section class="ri-panel" data-connected-link-panel data-evidence-id="${esc(evidenceId)}">
    <h2>Control linkage</h2>
    <p class="ri-muted">Link evidence to a control (<code>evidence_control</code>). Provenance classes must match.</p>
    ${controls ? `<p>Linked controls:</p><ul>${controls}</ul>` : '<p class="ri-muted">No linked controls yet.</p>'}
    <label>Control UUID
      <input data-connected-link-control-target placeholder="Full control UUID" autocomplete="off" />
    </label>
    <button type="button" class="ri-btn ri-btn--primary" data-ri-post-link data-link-type="evidence_control" data-left-id="${esc(evidenceId)}">Link control</button>
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

export function renderConnectedEvidenceWorkflowPanel(evidenceId) {
  const events = getConnectedEntityWorkflowEvents(getState(), 'evidence_item', evidenceId);
  return `<section class="ri-panel"><h2>Audit history</h2>
    ${renderConnectedWorkflowEventsTable(events, 'No workflow events for this evidence yet')}</section>`;
}
