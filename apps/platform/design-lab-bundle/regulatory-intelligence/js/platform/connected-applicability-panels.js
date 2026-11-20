import { esc, badge, dataTable, pageHeader } from '../components.js';
import { getState } from '../store.js';
import { connectedCatalogueBanner } from './connected-catalogue.js';
import {
  isConnectedApplicabilityWritesEnabled,
  isConnectedImpactApproveEnabled,
} from './connected-mode.js';

const RECOMMENDATION_OPTIONS = [
  ['APPLICABLE', 'Applicable'],
  ['POSSIBLY_APPLICABLE', 'Possibly applicable'],
  ['NOT_APPLICABLE', 'Not applicable'],
  ['UNASSESSED', 'Unassessed'],
];
const EDITABLE_STATUSES = new Set(['DRAFT', 'REJECTED']);

/**
 * @param {string} publicationId
 * @param {object} publication
 * @param {object | null} assessment Latest tenant assessment (snake_case API row) or null when none exists.
 * @param {{ detailLoaded?: boolean, currentUserId?: string | null }} [options]
 */
export function renderConnectedApplicabilityView(publicationId, publication, assessment, options = {}) {
  const state = getState();
  const header = `${pageHeader('Applicability assessment', publication?.title || publicationId)}
    ${connectedCatalogueBanner(state)}
    <p class="ri-muted">Tenant-scoped applicability only — global publication catalogue rows are never modified.</p>`;
  const back = `<p><a href="#/publication/${esc(publicationId)}">← Publication</a></p>`;
  if (!options.detailLoaded) {
    return `${header}<p class="ri-muted" data-connected-applicability-loading>Loading this organisation's applicability assessment…</p>${back}`;
  }

  const id = assessment?.id || '';
  const status = assessment?.status || 'NOT_STARTED';
  const rec = assessment?.recommendation || 'UNASSESSED';
  const updatedAt = assessment?.updatedAt || assessment?.updated_at || '';
  const submittedBy = assessment?.submitted_by || assessment?.submittedBy || null;
  const reviewedBy = assessment?.reviewed_by || assessment?.reviewedBy || null;
  const editable = !id || EDITABLE_STATUSES.has(status);
  const canWrite = isConnectedApplicabilityWritesEnabled(state) && editable;
  const canApprove = isConnectedImpactApproveEnabled(state) && Boolean(id) && status === 'IN_REVIEW';
  const isSubmitter = Boolean(submittedBy && options.currentUserId && submittedBy === options.currentUserId);
  const savedRationale = String(assessment?.rationale || '').trim();
  const selected = assessment?.recommendation || 'APPLICABLE';
  const optionHtml = RECOMMENDATION_OPTIONS.map(
    ([value, label]) => `<option value="${value}"${value === selected ? ' selected' : ''}>${label}</option>`,
  ).join('');

  return `${header}
    <dl class="ri-dl">
      <dt>Recommendation</dt><dd>${badge(rec)}</dd>
      <dt>Workflow status</dt><dd>${badge(status)}</dd>
      <dt>Assessment id</dt><dd class="ri-mono">${esc(id || '—')}</dd>
      <dt>Submitted by</dt><dd class="ri-mono">${esc(submittedBy || '—')}</dd>
      <dt>Reviewed by</dt><dd class="ri-mono">${esc(reviewedBy || '—')}</dd>
      <dt>Saved rationale</dt><dd data-connected-applicability-saved-rationale>${esc(savedRationale || '—')}</dd>
    </dl>
    ${
      canWrite
        ? `<section class="ri-panel" data-connected-applicability-panel="${esc(publicationId)}">
      <h2>Record decision (draft)</h2>
      <label>Recommendation
        <select data-connected-applicability-recommendation data-preserve-input="applicability-recommendation">${optionHtml}</select>
      </label>
      <label>Rationale (required) <textarea data-connected-applicability-rationale data-preserve-input="applicability-rationale" rows="3" required>${esc(assessment?.rationale || '')}</textarea></label>
      <button type="button" class="ri-btn ri-btn--primary" data-connected-applicability-save data-publication-id="${esc(publicationId)}" data-assessment-id="${esc(id)}" data-expected-updated-at="${esc(updatedAt)}">Save draft</button>
      ${
        id && !savedRationale
          ? '<p class="ri-muted" data-connected-applicability-submit-blocked>Save a draft with a rationale; Submit for approval becomes available once the rationale is saved.</p>'
          : id
          ? `<button type="button" class="ri-btn ri-btn--ghost" data-connected-applicability-submit data-publication-id="${esc(publicationId)}" data-assessment-id="${esc(id)}" data-expected-updated-at="${esc(updatedAt)}">Submit for approval</button>`
          : '<p class="ri-muted">Save a draft first; Submit for approval becomes available once the draft exists.</p>'
      }
    </section>`
        : ''
    }
    ${
      canApprove
        ? `<section class="ri-panel" data-connected-applicability-checker="${esc(id)}">
      <h2>Checker decision</h2>
      ${
        isSubmitter
          ? '<p class="ri-muted">You submitted this assessment. Approval requires a different authorised reviewer (segregation of duties).</p>'
          : `<label>Comments <textarea data-connected-applicability-decision-comments data-preserve-input="applicability-decision-comments" rows="2"></textarea></label>
      <button type="button" class="ri-btn ri-btn--primary" data-connected-applicability-approve data-publication-id="${esc(publicationId)}" data-assessment-id="${esc(id)}" data-expected-updated-at="${esc(updatedAt)}">Approve</button>
      <button type="button" class="ri-btn ri-btn--ghost" data-connected-applicability-reject data-publication-id="${esc(publicationId)}" data-assessment-id="${esc(id)}" data-expected-updated-at="${esc(updatedAt)}">Reject</button>`
      }
    </section>`
        : ''
    }
    ${back}`;
}

/** Publication → Applicability tab in connected mode: tenant assessment and changes only (no demo AI recommendation). */
export function renderConnectedPublicationApplicabilityTab(publication) {
  const detail = publication?._detail;
  const pubId = publication?.id || '';
  const link = `<a class="ri-btn ri-btn--primary" href="#/applicability/${esc(pubId)}">Open full Applicability Assessment</a>`;
  if (!detail) {
    return `<div class="ri-panel"><h3>Publication-level applicability</h3><p class="ri-muted">Loading this organisation's applicability assessment…</p>${link}</div>`;
  }
  const a = detail.applicability || null;
  const changes = detail.changes || [];
  const changeItems = changes.length
    ? changes
        .map(
          (c) => `<li><a href="#/change/${esc(c.id)}">${esc(String(c.id).slice(0, 8))}…</a> — ${badge(c.status || '—')} <span class="ri-muted">${esc(c.title || '')}</span></li>`,
        )
        .join('')
    : '<li class="ri-muted">No regulatory changes for this publication in this organisation.</li>';
  return `
    <div class="ri-panel">
      <h3>Publication-level applicability</h3>
      <p class="ri-muted">Human maker-checker assessment for this organisation. No AI recommendation is shown here.</p>
      <dl class="ri-dl">
        <dt>Recommendation</dt><dd>${badge(a?.recommendation || 'UNASSESSED')}</dd>
        <dt>Workflow status</dt><dd>${badge(a?.status || 'NOT_STARTED')}</dd>
        <dt>Submitted</dt><dd>${esc(a?.submitted_at ? String(a.submitted_at).slice(0, 10) : '—')}</dd>
        <dt>Reviewed</dt><dd>${esc(a?.reviewed_at ? String(a.reviewed_at).slice(0, 10) : '—')}</dd>
        <dt>Rationale</dt><dd>${esc(a?.rationale || '—')}</dd>
      </dl>
      ${link}
    </div>
    <div class="ri-panel">
      <h3>Regulatory changes (this organisation)</h3>
      <ul class="ri-change-appl-list">${changeItems}</ul>
    </div>`;
}

export function renderConnectedGovernancePendingTable(items) {
  if (!items?.length) {
    return `<p class="ri-muted">No items awaiting approval in this organisation.</p>`;
  }
  const rows = items.map(
    (item) => `<tr>
      <td>${badge(item.kind)}</td>
      <td>${esc(item.title)}</td>
      <td>${badge(item.status)}</td>
      <td class="ri-mono">${esc(String(item.id).slice(0, 8))}…</td>
      <td>${item.kind === 'impact_assessment' ? `<a href="#/assessment/${esc(item.id)}">Open</a>` : `<a href="#/applicability/${esc(item.publicationId || '')}">Open</a>`}</td>
    </tr>`,
  );
  return dataTable(['Type', 'Title', 'Status', 'Id', 'Link'], rows);
}
