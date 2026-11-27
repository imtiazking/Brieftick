/**
 * Connected watchlists — CRUD, match history, staging evaluate hook.
 */
import { esc, badge, formatDate } from '../components.js';
import { getState } from '../store.js';
import { isConnectedBackendActive } from './connected-mode.js';

function apiBase(state) {
  return (state.platformConfig?.apiBaseUrl || '/api/ri-lab').replace(/\/$/, '');
}

function splitCsv(s) {
  return String(s || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

export function renderConnectedWatchlistsShell() {
  return `<section class="ri-panel" data-connected-watchlists>
    <div class="ri-toolbar">
      <button type="button" class="ri-btn ri-btn--primary ri-btn--sm" data-wl-create>New watchlist</button>
      <span class="ri-muted" data-wl-status>Loading…</span>
    </div>
    <p class="ri-muted">Personal watchlists are visible only to you. Organisation watchlists are shared with all members. Matches create in-app alerts only — no external email.</p>
    <div data-wl-list></div>
    <h3 class="ri-subhead">Recent matches</h3>
    <div data-wl-matches></div>
    <dialog class="ri-modal" data-wl-dialog>
      <form method="dialog" class="ri-modal__inner ri-form-grid">
        <h2 class="ri-modal__title" data-wl-dialog-title>Watchlist</h2>
        <input type="hidden" name="id" data-wl-id />
        <label>Name <input class="ri-input" name="name" required maxlength="120" /></label>
        <label>Description <input class="ri-input" name="description" maxlength="240" /></label>
        <label>Scope
          <select class="ri-select" name="scope"><option value="personal">Personal</option><option value="organisation">Organisation</option></select>
        </label>
        <label class="ri-checkbox"><input type="checkbox" name="enabled" checked data-wl-enabled /> Enabled</label>
        <label>Regulator keys <input class="ri-input" name="regulatorKeys" placeholder="REG-FCA, REG-PRA" /></label>
        <label>Jurisdiction codes <input class="ri-input" name="jurisdictionCodes" placeholder="GB, AE" /></label>
        <label>Topics / keywords <input class="ri-input" name="keywords" placeholder="BNPL, CONC" /></label>
        <label>Publication types <input class="ri-input" name="publicationTypes" placeholder="consultation, policy_statement" /></label>
        <label>Publication IDs (exact) <input class="ri-input" name="publicationIds" placeholder="uuid, uuid" /></label>
        <label>Regulatory change IDs <input class="ri-input" name="regulatoryChangeIds" /></label>
        <label>Obligation IDs <input class="ri-input" name="obligationIds" /></label>
        <div class="ri-modal__actions">
          <button type="submit" class="ri-btn ri-btn--primary">Save</button>
          <button type="button" class="ri-btn" data-wl-cancel>Cancel</button>
        </div>
      </form>
    </dialog>
  </section>`;
}

function filterSummary(f = {}) {
  return [
    f.regulatorKeys?.length ? `Regulators: ${f.regulatorKeys.join(', ')}` : '',
    f.jurisdictionCodes?.length ? `Jurisdictions: ${f.jurisdictionCodes.join(', ')}` : '',
    f.keywords?.length ? `Keywords: ${f.keywords.join(', ')}` : '',
    f.publicationTypes?.length ? `Types: ${f.publicationTypes.join(', ')}` : '',
    f.publicationIds?.length ? `Pub IDs: ${f.publicationIds.length}` : '',
    f.regulatoryChangeIds?.length ? `Changes: ${f.regulatoryChangeIds.length}` : '',
    f.obligationIds?.length ? `Obligations: ${f.obligationIds.length}` : '',
  ]
    .filter(Boolean)
    .join(' · ') || '—';
}

function renderList(rows) {
  if (!rows.length) return '<p class="ri-muted">No watchlists yet.</p>';
  return `<table class="ri-table"><thead><tr><th>Name</th><th>Scope</th><th>Status</th><th>Filters</th><th>Updated</th><th></th></tr></thead><tbody>
    ${rows
      .map((w) => {
        return `<tr data-wl-row="${esc(w.id)}">
          <td>${esc(w.name)}</td>
          <td>${badge(w.scope)}</td>
          <td>${w.enabled ? badge('ENABLED') : badge('DISABLED')}</td>
          <td class="ri-muted">${esc(filterSummary(w.filters))}</td>
          <td>${formatDate(w.updated_at)}</td>
          <td><button type="button" class="ri-btn ri-btn--sm ri-btn--ghost" data-wl-edit="${esc(w.id)}">Edit</button></td>
        </tr>`;
      })
      .join('')}
  </tbody></table>`;
}

function renderMatches(rows, watchlistsById) {
  if (!rows.length) return '<p class="ri-muted">No matches yet.</p>';
  return `<table class="ri-table"><thead><tr><th>When</th><th>Watchlist</th><th>Reason</th><th>Publication</th><th>Alert</th></tr></thead><tbody>
    ${rows
      .map((m) => {
        const wl = watchlistsById.get(m.watchlist_id);
        const pubLink = m.publication_id
          ? `<a href="#/publication/${esc(m.publication_id)}">Open publication</a>`
          : '—';
        const notif = m.notification_id ? `<a href="#/notifications/inbox">View alert</a>` : '—';
        return `<tr><td>${formatDate(m.matched_at)}</td><td>${esc(wl?.name || m.watchlist_id)}</td><td class="ri-muted">${esc(m.match_reason)}</td><td>${pubLink}</td><td>${notif}</td></tr>`;
      })
      .join('')}
  </tbody></table>`;
}

export async function hydrateConnectedWatchlists(root = document) {
  const panel = root.querySelector('[data-connected-watchlists]');
  if (!panel || !isConnectedBackendActive()) return;
  const status = panel.querySelector('[data-wl-status]');
  const list = panel.querySelector('[data-wl-list]');
  const matchesEl = panel.querySelector('[data-wl-matches]');
  const dialog = panel.querySelector('[data-wl-dialog]');
  const form = dialog?.querySelector('form');
  let watchlists = [];

  const byId = () => new Map(watchlists.map((w) => [w.id, w]));

  function fillForm(w) {
    form.querySelector('[data-wl-id]').value = w?.id || '';
    form.querySelector('[data-wl-dialog-title]').textContent = w ? 'Edit watchlist' : 'New watchlist';
    form.elements.name.value = w?.name || '';
    form.elements.description.value = w?.description || '';
    form.elements.scope.value = w?.scope === 'organisation' ? 'organisation' : 'personal';
    form.querySelector('[data-wl-enabled]').checked = w ? w.enabled !== false : true;
    const f = w?.filters || {};
    form.elements.regulatorKeys.value = (f.regulatorKeys || []).join(', ');
    form.elements.jurisdictionCodes.value = (f.jurisdictionCodes || []).join(', ');
    form.elements.keywords.value = (f.keywords || f.topicLabels || []).join(', ');
    form.elements.publicationTypes.value = (f.publicationTypes || []).join(', ');
    form.elements.publicationIds.value = (f.publicationIds || []).join(', ');
    form.elements.regulatoryChangeIds.value = (f.regulatoryChangeIds || []).join(', ');
    form.elements.obligationIds.value = (f.obligationIds || []).join(', ');
  }

  async function reloadMatches() {
    try {
      const res = await fetch(`${apiBase(getState())}/watchlists/matches?limit=25`, { credentials: 'same-origin' });
      const body = await res.json();
      if (!body.ok) throw new Error(body.error || 'matches_failed');
      matchesEl.innerHTML = renderMatches(body.matches || [], byId());
    } catch {
      matchesEl.innerHTML = '<p class="ri-muted">Could not load match history.</p>';
    }
  }

  async function reload() {
    status.textContent = 'Loading…';
    try {
      const res = await fetch(`${apiBase(getState())}/watchlists?includeDisabled=1`, { credentials: 'same-origin' });
      const body = await res.json();
      if (!body.ok) throw new Error(body.error || 'load_failed');
      watchlists = body.watchlists || [];
      list.innerHTML = renderList(watchlists);
      status.textContent = `${watchlists.length} watchlist(s)`;
      list.querySelectorAll('[data-wl-edit]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-wl-edit');
          fillForm(watchlists.find((x) => x.id === id));
          dialog?.showModal();
        });
      });
      await reloadMatches();
    } catch (e) {
      status.textContent = 'Could not load watchlists.';
      list.innerHTML = `<p class="ri-error">${esc(String(e.message || e))}</p>`;
    }
  }

  panel.querySelector('[data-wl-create]')?.addEventListener('click', () => {
    fillForm(null);
    dialog?.showModal();
  });
  panel.querySelector('[data-wl-cancel]')?.addEventListener('click', () => dialog?.close());

  form?.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const fd = new FormData(form);
    const payload = {
      id: String(fd.get('id') || '').trim() || undefined,
      name: String(fd.get('name') || '').trim(),
      description: String(fd.get('description') || '').trim() || null,
      scope: fd.get('scope') === 'organisation' ? 'organisation' : 'personal',
      enabled: fd.get('enabled') === 'on',
      filters: {
        regulatorKeys: splitCsv(fd.get('regulatorKeys')),
        jurisdictionCodes: splitCsv(fd.get('jurisdictionCodes')),
        topicLabels: splitCsv(fd.get('keywords')),
        keywords: splitCsv(fd.get('keywords')),
        publicationTypes: splitCsv(fd.get('publicationTypes')),
        publicationIds: splitCsv(fd.get('publicationIds')),
        regulatoryChangeIds: splitCsv(fd.get('regulatoryChangeIds')),
        obligationIds: splitCsv(fd.get('obligationIds')),
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