/**
 * Consultation Tracker — catalogue consultations + tenant workflow overlay (editable).
 */
import { esc, badge, formatDate } from '../components.js';
import { getState } from '../store.js';
import { isConnectedBackendActive } from './connected-mode.js';

function apiBase(state) {
  return (state.platformConfig?.apiBaseUrl || '/api/ri-lab').replace(/\/$/, '');
}

const STATUS_OPTIONS = ['OPEN', 'UNDER_REVIEW', 'RESPONSE_IN_PROGRESS', 'SUBMITTED', 'CLOSED', 'NOT_APPLICABLE'];

export function renderConnectedConsultationsShell() {
  return `<section class="ri-panel" data-connected-consultations>
    <p class="ri-muted">Regulatory consultation deadlines come from the catalogue. Internal response deadlines and ownership are tenant records only. A consultation does not automatically become a binding obligation.</p>
    <p class="ri-muted" data-consult-status>Loading…</p>
    <div data-consult-table></div>
    <dialog class="ri-modal" data-consult-dialog>
      <form method="dialog" class="ri-modal__inner ri-form-grid">
        <h2 class="ri-modal__title">Consultation tracking</h2>
        <input type="hidden" name="publicationId" data-consult-pub-id />
        <p class="ri-muted" data-consult-pub-title></p>
        <p class="ri-muted">Regulatory close: <span data-consult-reg-deadline>—</span></p>
        <label>Workflow status
          <select class="ri-select" name="status">${STATUS_OPTIONS.map((s) => `<option value="${s}">${s}</option>`).join('')}</select>
        </label>
        <label>Organisational relevance
          <select class="ri-select" name="organisationalRelevance">
            <option value="">—</option>
            <option value="HIGH">HIGH</option>
            <option value="MEDIUM">MEDIUM</option>
            <option value="LOW">LOW</option>
            <option value="NOT_APPLICABLE">NOT_APPLICABLE</option>
          </select>
        </label>
        <label>Internal decision
          <select class="ri-select" name="internalDecision">
            <option value="">—</option>
            <option value="RESPOND">RESPOND</option>
            <option value="NO_RESPONSE">NO_RESPONSE</option>
            <option value="MONITOR">MONITOR</option>
          </select>
        </label>
        <label>Internal response deadline <input class="ri-input" type="date" name="internalResponseDeadline" /></label>
        <label>Response preparation
          <input class="ri-input" name="responsePreparationStatus" placeholder="e.g. DRAFTING" />
        </label>
        <label>Review / submission
          <input class="ri-input" name="submissionStatus" placeholder="e.g. PENDING_SIGN_OFF" />
        </label>
        <label>Comments and evidence <textarea class="ri-input" name="notes" rows="4"></textarea></label>
        <p class="ri-muted" data-consult-related></p>
        <div class="ri-modal__actions">
          <button type="submit" class="ri-btn ri-btn--primary">Save tracking</button>
          <button type="button" class="ri-btn" data-consult-cancel>Cancel</button>
        </div>
      </form>
    </dialog>
  </section>`;
}

function renderTable(rows) {
  if (!rows.length) return '<p class="ri-muted">No consultation publications in the catalogue.</p>';
  return `<table class="ri-table"><thead><tr>
    <th>Publication</th><th>Regulator</th><th>Opens</th><th>Closes (regulatory)</th><th>Status</th><th>Relevance</th><th>Internal deadline</th><th></th>
  </tr></thead><tbody>
    ${rows
      .map((c) => {
        const t = c.tracking;
        return `<tr>
          <td><a href="#/publication/${esc(c.publicationId)}">${esc(c.title)}</a></td>
          <td>${esc(c.regulator || '—')}</td>
          <td>${formatDate(c.consultationOpeningDate)}</td>
          <td>${formatDate(c.consultationClosingDate)}</td>
          <td>${badge(t?.status || 'UNTRACKED')}</td>
          <td>${esc(t?.organisational_relevance || '—')}</td>
          <td>${formatDate(t?.internal_response_deadline)}</td>
          <td><button type="button" class="ri-btn ri-btn--sm" data-consult-edit="${esc(c.publicationId)}">Track</button></td>
        </tr>`;
      })
      .join('')}
  </tbody></table>`;
}

export async function hydrateConnectedConsultations(root = document) {
  const panel = root.querySelector('[data-connected-consultations]');
  if (!panel || !isConnectedBackendActive()) return;
  const status = panel.querySelector('[data-consult-status]');
  const table = panel.querySelector('[data-consult-table]');
  const dialog = panel.querySelector('[data-consult-dialog]');
  const form = dialog?.querySelector('form');
  let consultations = [];

  function openEditor(pubId) {
    const c = consultations.find((x) => x.publicationId === pubId);
    if (!c) return;
    const t = c.tracking;
    form.querySelector('[data-consult-pub-id]').value = c.publicationId;
    form.querySelector('[data-consult-pub-title]').textContent = c.title;
    form.querySelector('[data-consult-reg-deadline]').textContent = formatDate(c.consultationClosingDate);
    form.elements.status.value = t?.status || 'OPEN';
    form.elements.organisationalRelevance.value = t?.organisational_relevance || '';
    form.elements.internalDecision.value = t?.internal_decision || '';
    form.elements.internalResponseDeadline.value = t?.internal_response_deadline?.slice(0, 10) || '';
    form.elements.responsePreparationStatus.value = t?.response_preparation_status || '';
    form.elements.submissionStatus.value = t?.submission_status || '';
    form.elements.notes.value = t?.notes || '';
    const rel =
      c.relatedChangeIds?.length
        ? `Verified related regulatory changes: ${c.relatedChangeIds.length} (from tenant change records linked to this publication).`
        : 'No verified related regulatory changes in tenant data.';
    form.querySelector('[data-consult-related]').textContent = rel;
    dialog?.showModal();
  }

  async function reload() {
    status.textContent = 'Loading…';
    try {
      const res = await fetch(`${apiBase(getState())}/consultations`, { credentials: 'same-origin' });
      const body = await res.json();
      if (!body.ok) throw new Error(body.error || 'load_failed');
      consultations = body.consultations || [];
      table.innerHTML = renderTable(consultations);
      status.textContent = `${body.total ?? consultations.length} consultation publication(s)`;
      table.querySelectorAll('[data-consult-edit]').forEach((btn) => {
        btn.addEventListener('click', () => openEditor(btn.getAttribute('data-consult-edit')));
      });
    } catch (e) {
      status.textContent = 'Could not load consultations.';
      table.innerHTML = `<p class="ri-error">${esc(String(e.message || e))}</p>`;
    }
  }

  panel.querySelector('[data-consult-cancel]')?.addEventListener('click', () => dialog?.close());

  form?.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const fd = new FormData(form);
    const payload = {
      publicationId: String(fd.get('publicationId') || '').trim(),
      status: String(fd.get('status') || 'OPEN'),
      organisationalRelevance: String(fd.get('organisationalRelevance') || '') || null,
      internalDecision: String(fd.get('internalDecision') || '') || null,
      internalResponseDeadline: String(fd.get('internalResponseDeadline') || '') || null,
      responsePreparationStatus: String(fd.get('responsePreparationStatus') || '') || null,
      submissionStatus: String(fd.get('submissionStatus') || '') || null,
      notes: String(fd.get('notes') || '') || null,
    };
    const res = await fetch(`${apiBase(getState())}/consultations`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.ok) {
      alert(body.error || 'Save failed');
      return;
    }
    dialog?.close();
    await reload();
  });

  await reload();
}