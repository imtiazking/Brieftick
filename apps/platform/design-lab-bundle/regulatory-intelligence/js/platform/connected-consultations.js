/**
 * Consultation Tracker — catalogue consultations + tenant tracking overlay.
 */
import { esc, badge, formatDate } from '../components.js';
import { getState } from '../store.js';
import { isConnectedBackendActive } from './connected-mode.js';

function apiBase(state) {
  return (state.platformConfig?.apiBaseUrl || '/api/ri-lab').replace(/\/$/, '');
}

export function renderConnectedConsultationsShell() {
  return `<section class="ri-panel" data-connected-consultations>
    <p class="ri-muted">Regulatory consultation deadlines come from the catalogue. Internal response deadlines and ownership are tenant records only. A consultation does not automatically become a binding obligation.</p>
    <p class="ri-muted" data-consult-status>Loading…</p>
    <div data-consult-table></div>
  </section>`;
}

function renderTable(rows) {
  if (!rows.length) return '<p class="ri-muted">No consultation publications in the catalogue.</p>';
  return `<table class="ri-table"><thead><tr>
    <th>Publication</th><th>Regulator</th><th>Opens</th><th>Closes</th><th>Status</th><th>Owner</th><th>Internal deadline</th>
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
          <td>${esc(t?.owner_user_id || '—')}</td>
          <td>${formatDate(t?.internal_response_deadline)}</td>
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
  status.textContent = 'Loading…';
  try {
    const res = await fetch(`${apiBase(getState())}/consultations`, { credentials: 'same-origin' });
    const body = await res.json();
    if (!body.ok) throw new Error(body.error || 'load_failed');
    table.innerHTML = renderTable(body.consultations || []);
    status.textContent = `${body.total ?? 0} consultation publication(s)`;
  } catch (e) {
    status.textContent = 'Could not load consultations.';
    table.innerHTML = `<p class="ri-error">${esc(String(e.message || e))}</p>`;
  }
}