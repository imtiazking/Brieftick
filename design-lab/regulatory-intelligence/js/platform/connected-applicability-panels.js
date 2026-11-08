import { esc, badge, dataTable, pageHeader } from '../components.js';
import { connectedCatalogueBanner } from './connected-catalogue.js';
import {
  isConnectedApplicabilityWritesEnabled,
  isConnectedImpactApproveEnabled,
} from './connected-mode.js';

export function renderConnectedApplicabilityView(publicationId, publication, assessment) {
  const rec = assessment?.recommendation || publication?.display?.classification || 'UNASSESSED';
  const status = assessment?.status || 'DRAFT';
  const canWrite = isConnectedApplicabilityWritesEnabled();
  const canApprove = isConnectedImpactApproveEnabled();
  return `${pageHeader('Applicability assessment', publication?.title || publicationId)}
    ${connectedCatalogueBanner()}
    <p class="ri-muted">Tenant-scoped applicability only — global publication catalogue rows are never modified.</p>
    <dl class="ri-dl">
      <dt>Recommendation</dt><dd>${badge(rec)}</dd>
      <dt>Workflow status</dt><dd>${badge(status)}</dd>
      <dt>Assessment id</dt><dd class="ri-mono">${esc(assessment?.id || '—')}</dd>
    </dl>
    ${
      canWrite
        ? `<section class="ri-panel" data-connected-applicability-panel="${esc(publicationId)}">
      <h2>Record decision (draft)</h2>
      <label>Recommendation
        <select data-connected-applicability-recommendation>
          <option value="APPLICABLE">Applicable</option>
          <option value="POSSIBLY_APPLICABLE">Possibly applicable</option>
          <option value="NOT_APPLICABLE">Not applicable</option>
          <option value="UNASSESSED">Unassessed</option>
        </select>
      </label>
      <label>Rationale <textarea data-connected-applicability-rationale rows="3"></textarea></label>
      <button type="button" class="ri-btn ri-btn--primary" data-connected-applicability-save data-publication-id="${esc(publicationId)}" data-assessment-id="${esc(assessment?.id || '')}" data-expected-updated-at="${esc(assessment?.updatedAt || assessment?.updated_at || '')}">Save draft</button>
      <button type="button" class="ri-btn ri-btn--ghost" data-connected-applicability-submit data-assessment-id="${esc(assessment?.id || '')}" data-expected-updated-at="${esc(assessment?.updatedAt || assessment?.updated_at || '')}">Submit for approval</button>
    </section>`
        : ''
    }
    ${
      canApprove && assessment?.id
        ? `<section class="ri-panel" data-connected-applicability-approve="${esc(assessment.id)}">
      <h2>Checker decision</h2>
      <label>Comments <textarea data-connected-applicability-decision-comments rows="2"></textarea></label>
      <button type="button" class="ri-btn ri-btn--primary" data-connected-applicability-approve data-assessment-id="${esc(assessment.id)}" data-expected-updated-at="${esc(assessment?.updatedAt || assessment?.updated_at || '')}">Approve</button>
      <button type="button" class="ri-btn ri-btn--ghost" data-connected-applicability-reject data-assessment-id="${esc(assessment.id)}" data-expected-updated-at="${esc(assessment?.updatedAt || assessment?.updated_at || '')}">Reject</button>
    </section>`
        : ''
    }
    <p><a href="#/publication/${esc(publicationId)}">← Publication</a></p>`;
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
