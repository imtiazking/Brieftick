/**
 * Tenant-scoped triage queues. Counts and rows come from GET /api/ri-lab/triage.
 * Draft obligations are created only by the existing finding-review panel.
 */
import { esc, pageHeader, badge } from '../components.js';
import { getState } from '../store.js';
import { isConnectedBackendActive } from './connected-mode.js';
import {
  bindConnectedAiFindingReview,
  fetchConnectedAiFindingReview,
  renderConnectedAiFindingReviewPanel,
} from './connected-ai-governance-panels.js';

export const TRIAGE_SCREENS = {
  obligations: {
    queue: 'OBLIGATION_TRIAGE',
    title: 'Obligation Triage',
    copy: 'Potential binding requirements from completed UC-RI-005 extractions. A row can become a DRAFT obligation only after human finding review accepts a conversion-eligible classification. Nothing here is legally approved.',
  },
  'non-obligations': {
    queue: 'NON_OBLIGATION_TRIAGE',
    title: 'Non-Obligation Triage',
    copy: 'Guidance, explanations and other non-binding findings. Review decisions are recorded on the finding. These rows cannot become approved obligations.',
  },
  exceptions: {
    queue: 'EXCEPTION_TRIAGE',
    title: 'Exception Triage',
    copy: 'Ambiguous findings, unverified citations, scope or evidential questions, and disputed classifications. Resolve them in finding review. They are not approved obligations.',
  },
};

function apiBase(state) {
  return (state.platformConfig?.apiBaseUrl || '/api/ri-lab').replace(/\/$/, '');
}

export function triageScreenFor(segment) {
  return TRIAGE_SCREENS[segment] || null;
}

export function renderTriageBoard() {
  const card = (segment, title, hint) => {
    const queue = TRIAGE_SCREENS[segment].queue;
    return `<a class="ri-metric ri-triage-card" href="#/triage/${segment}" data-triage-card="${queue}">
      <span class="ri-metric__label">${esc(title)}</span>
      <span class="ri-metric__value" data-triage-count="${queue}">…</span>
      <span class="ri-metric__hint">${esc(hint)}</span>
    </a>`;
  };
  return `<section class="ri-panel" data-triage-board>
    <h2>Triage</h2>
    <p class="ri-muted">Counts are loaded from this organisation’s completed extractions. They are not demonstration figures.</p>
    <div class="ri-priority-metrics">
      ${card('obligations', 'Obligation Triage', 'Potential binding requirements')}
      ${card('non-obligations', 'Non-Obligation Triage', 'Guidance and other non-binding findings')}
      ${card('exceptions', 'Exception Triage', 'Ambiguous and disputed findings')}
    </div>
  </section>`;
}

export function renderTriageScreen(segment) {
  const screen = triageScreenFor(segment);
  if (!screen) {
    return `${pageHeader('Triage', 'Choose a queue')}
      <ul>
        <li><a href="#/triage/obligations">Obligation Triage</a></li>
        <li><a href="#/triage/non-obligations">Non-Obligation Triage</a></li>
        <li><a href="#/triage/exceptions">Exception Triage</a></li>
      </ul>`;
  }
  if (!isConnectedBackendActive(getState())) {
    return `${pageHeader(screen.title, 'Connected staging data is required')}
      <section class="ri-panel"><p>Sign in and connect this organisation. Demonstration counts are not shown on this screen.</p></section>`;
  }
  return `${pageHeader({ title: screen.title, subtitle: screen.copy })}
    <section class="ri-panel" data-triage-screen="${esc(screen.queue)}">
      <p class="ri-muted" data-triage-status>Loading this organisation’s ${esc(screen.title)} queue…</p>
      <div data-triage-rows></div>
      <div data-triage-review-host></div>
    </section>`;
}

function rowHtml(item) {
  const reasons = Array.isArray(item.exceptionReasons) && item.exceptionReasons.length
    ? `<br><span class="ri-muted">${esc(item.exceptionReasons.join(', '))}</span>`
    : '';
  const draft = item.obligationId
    ? `DRAFT recorded ${item.obligationId}`
    : item.triageQueue === 'OBLIGATION_TRIAGE'
      ? 'Human review required before a DRAFT obligation can be created'
      : 'Cannot become an approved obligation from this queue';
  return `<tr>
    <td>${esc(item.regulator || '—')}</td>
    <td>${item.publicationId ? `<a href="#/publication/${esc(item.publicationId)}">${esc(item.publicationTitle || item.publicationId)}</a>` : '—'}</td>
    <td>${esc(item.provisionReference || '—')}</td>
    <td>${esc(item.quotation || '—')}</td>
    <td>${esc(item.classificationCode || (item.modelLabels || []).join(', ') || '—')}${item.provisional ? ' <span class="ri-muted">(provisional)</span>' : ''}</td>
    <td>${esc(item.legalStatus || '—')}${item.legalBasis ? `<br><span class="ri-muted">${esc(item.legalBasis)}</span>` : ''}</td>
    <td>${esc(item.applicability || '—')}</td>
    <td>${badge(item.reviewStatus || '—')}${item.disposition ? `<br><span class="ri-muted">${esc(item.disposition)}</span>` : ''}${reasons}</td>
    <td>${esc(draft)}<br><a href="${esc(item.reviewHref)}">Open finding review</a><br>
      <button type="button" class="ri-btn" data-triage-open-review="${esc(item.runId)}">Review on this page</button></td>
  </tr>`;
}

export async function hydrateConnectedTriage(root = document) {
  const state = getState();
  if (!isConnectedBackendActive(state)) return;
  const board = root.querySelector('[data-triage-board]');
  const screen = root.querySelector('[data-triage-screen]');
  if (!board && !screen) return;
  const base = apiBase(state);
  const queue = screen?.getAttribute('data-triage-screen') || '';
  const url = queue ? `${base}/triage?queue=${encodeURIComponent(queue)}` : `${base}/triage`;
  const target = screen || board;
  if (target.dataset.loaded === '1') return;
  target.dataset.loaded = '1';
  try {
    const res = await fetch(url, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.ok) throw new Error(body.error || body.code || 'triage_unavailable');
    root.querySelectorAll('[data-triage-count]').forEach((el) => {
      const key = el.getAttribute('data-triage-count');
      const value = body.counts?.[key];
      el.textContent = Number.isInteger(value) ? String(value) : '0';
    });
    if (!screen) return;
    const status = screen.querySelector('[data-triage-status]');
    const rows = screen.querySelector('[data-triage-rows]');
    const note = body.truncated ? ' The newest completed runs are shown; older runs are not in this count.' : '';
    if (status) {
      status.textContent = `${body.total ?? 0} finding(s) in this queue from ${body.scannedRuns ?? 0} completed extraction run(s).${note} ${body.draftCreation || ''}`;
    }
    if (!rows) return;
    if (!body.items?.length) {
      rows.innerHTML = '<p>No findings in this queue for the scanned runs.</p>';
      return;
    }
    rows.innerHTML = `<table class="ri-table"><thead><tr>
      <th>Regulator</th><th>Publication</th><th>Provision</th><th>Quotation</th><th>Classification</th><th>Legal basis</th><th>Applicability</th><th>Review</th><th>Human review</th>
    </tr></thead><tbody>${body.items.map(rowHtml).join('')}</tbody></table>`;
    bindTriageReview(screen);
  } catch (err) {
    target.dataset.loaded = '';
    const status = screen?.querySelector('[data-triage-status]');
    if (status) status.textContent = err?.message || 'Triage queue unavailable';
    root.querySelectorAll('[data-triage-count]').forEach((el) => {
      if (el.textContent === '…') el.textContent = '—';
    });
  }
}

export function bindTriageReview(screen = document.querySelector('[data-triage-screen]')) {
  const host = screen?.querySelector('[data-triage-review-host]');
  if (!screen || !host || screen.dataset.reviewBound === '1') return;
  screen.dataset.reviewBound = '1';
  screen.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-triage-open-review]');
    if (!button) return;
    const runId = button.getAttribute('data-triage-open-review');
    host.innerHTML = '<p class="ri-muted">Loading finding review…</p>';
    try {
      const body = await fetchConnectedAiFindingReview(getState(), runId);
      host.innerHTML = renderConnectedAiFindingReviewPanel(body);
      bindConnectedAiFindingReview(host.querySelector('[data-connected-ai-finding-review]'), {
        onSubmitted: () => {
          const screen = document.querySelector('[data-triage-screen]');
          if (screen) screen.dataset.loaded = '';
          hydrateConnectedTriage(document);
        },
      });
    } catch (err) {
      host.textContent = err?.message || 'Finding review unavailable';
    }
  });
}
