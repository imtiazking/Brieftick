import { esc, badge, formatDate } from '../components.js';
import { getControl, getState } from '../store.js';
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

function formatEvidenceFileTypeLabel(contentType) {
  const ct = String(contentType || '').toLowerCase();
  if (ct === 'text/plain') return 'TXT';
  if (ct === 'application/pdf') return 'PDF';
  if (ct === 'image/png') return 'PNG';
  if (ct === 'image/jpeg') return 'JPEG';
  return contentType || '—';
}

function formatEvidenceByteSize(bytes) {
  if (bytes == null) return '—';
  const n = Number(bytes);
  if (!Number.isFinite(n)) return '—';
  if (n < 1024) return `${n} bytes`;
  return `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`;
}

export function renderConnectedEvidenceVersionsPanel(e) {
  const evidenceId = e?.id;
  const versions = Array.isArray(e?.versions) ? e.versions : [];
  if (!versions.length) {
    return `<section class="ri-panel"><h2>File versions</h2><p class="ri-muted">No files uploaded yet.</p></section>`;
  }
  const rows = versions
    .map((v) => {
      const ver = esc(String(v.versionNumber ?? '—'));
      const fn = esc(v.filename || '—');
      const actions =
        evidenceId && v.versionNumber != null
          ? `<button type="button" class="ri-btn ri-btn--ghost ri-btn--sm" data-connected-evidence-version-preview data-evidence-id="${esc(evidenceId)}" data-version-number="${esc(String(v.versionNumber))}" data-filename="${fn}">Preview</button> ` +
            `<button type="button" class="ri-btn ri-btn--ghost ri-btn--sm" data-connected-evidence-version-download data-evidence-id="${esc(evidenceId)}" data-version-number="${esc(String(v.versionNumber))}" data-filename="${fn}">Download</button>`
          : '—';
      return (
        `<tr><td class="ri-mono">v${ver}</td>` +
        `<td>${fn}</td>` +
        `<td>${esc(formatEvidenceFileTypeLabel(v.contentType))}</td>` +
        `<td>${esc(formatEvidenceByteSize(v.byteSize))}</td>` +
        `<td>${formatDate(v.uploadedAt)}</td>` +
        `<td class="ri-actions">${actions}</td></tr>`
      );
    })
    .join('');
  return `<section class="ri-panel" data-connected-evidence-versions><h2>File versions</h2>
    <p class="ri-muted">Preview uses a short-lived signed URL. Download is served through the authenticated API with the original filename.</p>
    <table class="ri-table"><thead><tr><th>Ver</th><th>File</th><th>Type</th><th>Size</th><th>Uploaded</th><th>Actions</th></tr></thead>
    <tbody>${rows}</tbody></table></section>`;
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
  </section>`;
}

export function renderConnectedEvidenceLinkPanel(evidenceId, e) {
  if (!isConnectedEvidenceWritesEnabled(getState())) return '';
  const linked =
    (e?.linkedControls || []).length > 0
      ? e.linkedControls
      : (e?.controlIds || []).map((id) => ({
          id,
          name: getControl(id)?.name || getControl(id)?.title || '',
        }));
  const controls = linked
    .map((c) => {
      const label = c.name?.trim() ? c.name : `${String(c.id).slice(0, 8)}…`;
      return `<li><a href="#/control/${esc(c.id)}">${esc(label)}</a></li>`;
    })
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
