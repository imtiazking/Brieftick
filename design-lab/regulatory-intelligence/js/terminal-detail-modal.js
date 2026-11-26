/**
 * Centred quick-view modal for the Publications and Obligations terminal views.
 * One native <dialog> (focus trap, Esc, inert background) with a blurred backdrop; one delegated listener.
 * The modal only reads records already loaded in the store and links to the full record page.
 */
import { esc, formatDate } from './components.js';
import { getObligation, getPublication } from './store.js';
import { DETAIL_KINDS, buildObligationDetail, buildPublicationDetail } from './terminal-detail-model.js';

const DIALOG_ID = 'ri-terminal-detail';
let bound = false;
let lastOpener = null;

function build(kind, id) {
  if (kind === 'publication') return buildPublicationDetail(getPublication(id), formatDate);
  if (kind === 'obligation') return buildObligationDetail(getObligation(id), formatDate);
  return null;
}

function ensureDialog() {
  let dialog = document.getElementById(DIALOG_ID);
  if (dialog) return dialog;
  dialog = document.createElement('dialog');
  dialog.id = DIALOG_ID;
  dialog.className = 'ri-terminal-modal';
  dialog.setAttribute('aria-labelledby', `${DIALOG_ID}-title`);
  dialog.addEventListener('click', (event) => {
    // A click on the backdrop lands on the dialog element itself, never on its content.
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener('close', () => {
    const opener = lastOpener;
    lastOpener = null;
    if (opener && document.contains(opener)) opener.focus();
  });
  document.body.appendChild(dialog);
  return dialog;
}

/** Keyboard- and screen-reader-accessible entry point shown beside each record link. */
export function peekButton(kind, id, label) {
  if (!DETAIL_KINDS.includes(kind) || !id) return '';
  return `<button type="button" class="ri-terminal-peek" data-ri-detail="${esc(kind)}" data-ri-detail-id="${esc(id)}" aria-haspopup="dialog" aria-label="Quick view: ${esc(label || id)}">Quick view</button>`;
}

export function renderDetailMarkup(model) {
  const badges = model.badges.length
    ? `<p class="ri-terminal-modal__badges">${model.badges.map((b) => `<span class="ri-terminal-chip">${esc(b)}</span>`).join('')}</p>`
    : '';
  const fields = model.fields
    .map((f) => `<div class="ri-terminal-modal__field"><dt>${esc(f.label)}</dt><dd>${esc(f.value)}</dd></div>`)
    .join('');
  const summary = model.summary ? `<p class="ri-terminal-modal__summary">${esc(model.summary)}</p>` : '';
  const source = model.sourceUrl
    ? `<a class="ri-terminal-link" href="${esc(model.sourceUrl)}" target="_blank" rel="noopener noreferrer">Official source ↗</a>`
    : '';
  return `
    <header class="ri-terminal-modal__head">
      <p class="ri-terminal-modal__eyebrow">${esc(model.eyebrow)}</p>
      <h2 id="${DIALOG_ID}-title" class="ri-terminal-modal__title">${esc(model.title)}</h2>
      ${badges}
    </header>
    <div class="ri-terminal-modal__body">
      ${summary}
      <dl class="ri-terminal-modal__fields">${fields}</dl>
    </div>
    <footer class="ri-terminal-modal__foot">
      ${source}
      <span class="ri-terminal-modal__spacer"></span>
      <button type="button" class="ri-terminal-btn ri-terminal-btn--ghost" data-ri-detail-close>Close</button>
      <a class="ri-terminal-btn ri-terminal-btn--primary" href="${esc(model.fullHref)}" data-ri-detail-open>${esc(model.fullLabel)} →</a>
    </footer>`;
}

export function openTerminalDetail(kind, id, opener = null) {
  if (!DETAIL_KINDS.includes(kind) || !id) return false;
  const model = build(kind, id);
  if (!model) return false;
  const dialog = ensureDialog();
  dialog.innerHTML = renderDetailMarkup(model);
  lastOpener = opener;
  if (!dialog.open) dialog.showModal();
  dialog.querySelector('[data-ri-detail-close]')?.addEventListener('click', () => dialog.close());
  // Following the link to the full record closes the modal so the route change is not hidden behind it.
  dialog.querySelector('[data-ri-detail-open]')?.addEventListener('click', () => dialog.close());
  dialog.querySelector('[data-ri-detail-open]')?.focus();
  return true;
}

export function closeTerminalDetail() {
  const dialog = document.getElementById(DIALOG_ID);
  if (dialog?.open) dialog.close();
}

/** Idempotent: safe to call on every render. */
export function bindTerminalDetail() {
  if (bound) return;
  bound = true;
  document.addEventListener('click', (event) => {
    // Text nodes and the document have no closest(); only element targets can be a record control.
    const target = event.target && typeof event.target.closest === 'function' ? event.target : null;
    if (!target) return;
    const button = target.closest('[data-ri-detail]');
    if (button) {
      event.preventDefault();
      openTerminalDetail(button.getAttribute('data-ri-detail'), button.getAttribute('data-ri-detail-id'), button);
      return;
    }
    // A plain click on a row opens the modal, but never when the click was on a link or a form control.
    const row = target.closest('tr[data-ri-detail-row]');
    if (row && !target.closest('a, button, input, select, textarea, label, summary')) {
      openTerminalDetail(row.getAttribute('data-ri-detail-row'), row.getAttribute('data-ri-detail-id'), row);
    }
  });
  window.addEventListener('hashchange', closeTerminalDetail);
}
