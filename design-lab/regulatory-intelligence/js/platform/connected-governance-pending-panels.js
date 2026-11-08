import { esc, badge, dataTable, emptyState } from '../components.js';
import { getState } from '../store.js';
import {
  isConnectedApplicabilityWritesEnabled,
  isConnectedImpactApproveEnabled,
} from './connected-mode.js';

export function renderConnectedGovernancePendingPanel(pendingItems) {
  const s = getState();
  const canApproveImpact = isConnectedImpactApproveEnabled(s);
  const canApproveApplicability = isConnectedImpactApproveEnabled(s);
  const canSubmitApplicability = isConnectedApplicabilityWritesEnabled(s);

  if (!pendingItems?.length) {
    return `<section class="ri-panel" data-connected-governance-pending="true">
      <h2>Pending approvals</h2>
      ${emptyState('No items awaiting approval in this organisation.')}
    </section>`;
  }

  const rows = pendingItems.map((item) => {
    const reviewer = item.ownerUserId ? `${String(item.ownerUserId).slice(0, 10)}…` : '—';
    const link =
      item.kind === 'impact_assessment'
        ? `#/assessment/${esc(item.id)}`
        : `#/applicability/${esc(item.publicationId || '')}`;
    return `<tr data-pending-item="${esc(item.id)}" data-pending-kind="${esc(item.kind)}">
      <td>${badge(item.kind)}</td>
      <td><a href="${link}">${esc(item.title)}</a></td>
      <td>${badge(item.status)}</td>
      <td>${esc(reviewer)}</td>
      <td>${item.submittedAt ? esc(String(item.submittedAt).slice(0, 10)) : '—'}</td>
      <td class="ri-form__actions">
        ${
          item.kind === 'impact_assessment' && canApproveImpact
            ? `<button type="button" class="ri-btn ri-btn--sm ri-btn--primary" data-governance-impact-approve data-impact-id="${esc(item.id)}">Approve</button>
               <button type="button" class="ri-btn ri-btn--sm ri-btn--ghost" data-governance-impact-reject data-impact-id="${esc(item.id)}">Reject</button>`
            : ''
        }
        ${
          item.kind === 'applicability_assessment' && canApproveApplicability
            ? `<button type="button" class="ri-btn ri-btn--sm ri-btn--primary" data-governance-applicability-approve data-assessment-id="${esc(item.id)}">Approve</button>
               <button type="button" class="ri-btn ri-btn--sm ri-btn--ghost" data-governance-applicability-reject data-assessment-id="${esc(item.id)}">Reject</button>`
            : ''
        }
        ${item.kind === 'applicability_assessment' && canSubmitApplicability ? `<span class="ri-muted">Draft/submit on applicability screen</span>` : ''}
      </td>
    </tr>`;
  });

  return `<section class="ri-panel" data-connected-governance-pending="true">
    <h2>Pending approvals (authoritative queue)</h2>
    <p class="ri-muted">From <code>GET /api/ri-lab/governance/pending</code>. Approvals require checker role and maker/checker separation.</p>
    ${dataTable(['Type', 'Title', 'Status', 'Submitter', 'Submitted', 'Actions'], rows)}
  </section>`;
}
