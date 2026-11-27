/**
 * Connected watchlists — GET/POST /api/ri-lab/watchlists
 */
import { esc, badge, formatDate } from '../components.js';
import { getState } from '../store.js';
import { isConnectedBackendActive } from './connected-mode.js';

function apiBase(state) {
  return (state.platformConfig?.apiBaseUrl || '/api/ri-lab').replace(/\/$/, '');
}

export function renderConnectedWatchlistsShell() {
  return `<section class="ri-panel" data-connected-watchlists>
    <div class="ri-toolbar">
      <button type="button" class="ri-btn ri-btn--primary ri-btn--sm" data-wl-create>New watchlist</button>
      <span class="ri-muted" data-wl-status>Loading…</span>
    </div>
    <p class="ri-muted">Personal watchlists are visible only to you. Organisation watchlists are shared with all members. Matches create in-app alerts — no external email.</p>
    <div data-wl-list></div>
    <dialog class="ri-modal" data-wl-dialog>
      <form method="dialog" class="ri-modal__inner">
        <h2 class="ri-modal__title">Watchlist</h2>
        <label>Name <input class="ri-input" name="name" required maxlength="120" /></label>
        <label>Scope
          <select class="ri-select" name="scope"><option value="personal">Personal</option><option value="organisation">Organisation</option></select>
        </label>
        <label>Regulator keys (comma-separated) <input class="ri-input" name="regulatorKeys" placeholder="REG-FCA" /></label>
        <label>Keywords (comma-separated) <input class="ri-input" name="keywords" placeholder="BNPL, CONC" /></label>
        <label>Publication types (comma-separated) <input class="ri-input" name="publicationTypes" placeholder="consultation, policy_statement" /></label>
        <div class="ri-modal__actions">
          <button type="submit" class="ri-btn ri-btn--primary">Save</button>
          <button type="button" class="ri-btn" data-wl-cancel>Cancel</button>
        </div>
      </form>
    </dialog>
  </section>`;
}

function renderList(rows) {
  if (!rows.length) return '<p class="ri-muted">No watchlists yet.</p>';
  return `<table class="ri-table"><thead><tr><th>Name</th><th>Scope</th><th>Filters</th><th>Updated</th></tr></thead><tbody>
    ${rows
      .map((w) => {
        const f = w.filters || {};
        const summary = [
          f.regulatorKeys?.length ? `Regulators: ${f.regulatorKeys.join(', ')}` : '',
          f.keywords?.length ? `Keywords: ${f.keywords.join(', ')}` : '',
          f.publicationTypes?.length ? `Types: ${f.publicationTypes.join(', ')}` : '',
        ]
          .filter(Boolean)
          .join(' · ') || '—';
        return `<tr><td>${esc(w.name)}</td><td>${badge(w.scope)}</td><td class="ri-muted">${esc(summary)}</td><td>${formatDate(w.updated_at)}</td></tr>`;
      })
      .join('')}
  </tbody></table>`;
}

export async function hydrateConnectedWatchlists(root = document) {
  const panel = root.querySelector('[data-connected-watchlists]');
  if (!panel || !isConnectedBackendActive()) return;
  const status = panel.querySelector('[data-wl-status]');
  const list = panel.querySelector('[data-wl-list]');
  const dialog = panel.querySelector('[data-wl-dialog]');
  const form = dialog?.querySelector('form');

  async function reload() {
    status.textContent = 'Loading…';
    try {
      const res = await fetch(`${apiBase(getState())}/watchlists`, { credentials: 'same-origin' });
      const body = await res.json();
      if (!body.ok) throw new Error(body.error || 'load_failed');
      list.innerHTML = renderList(body.watchlists || []);
      status.textContent = `${(body.watchlists || []).length} watchlist(s)`;
    } catch (e) {
      status.textContent = 'Could not load watchlists.';
      list.innerHTML = `<p class="ri-error">${esc(String(e.message || e))}</p>`;
    }
  }

  panel.querySelector('[data-wl-create]')?.addEventListener('click', () => {
    form?.reset();
    dialog?.showModal();
  });
  panel.querySelector('[data-wl-cancel]')?.addEventListener('click', () => dialog?.close());

  form?.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const fd = new FormData(form);
    const split = (k) =>
      String(fd.get(k) || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    const payload = {
      name: String(fd.get('name') || '').trim(),
      scope: fd.get('scope') === 'organisation' ? 'organisation' : 'personal',
      filters: {
        regulatorKeys: split('regulatorKeys'),
        keywords: split('keywords'),
        publicationTypes: split('publicationTypes'),
      },
    };
    const res = await fetch(`${apiBase(getState())}/watchlists`, {
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