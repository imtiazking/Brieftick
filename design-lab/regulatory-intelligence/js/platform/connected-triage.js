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

const HUMAN_VERIFICATION_LABELS = {
  UNVERIFIED: { icon: '⚪', label: 'UNVERIFIED' },
  VERIFIED: { icon: '✅', label: 'VERIFIED' },
  NEEDS_REVIEW: { icon: '🟠', label: 'NEEDS REVIEW' },
  REJECTED: { icon: '❌', label: 'REJECTED' },
  RE_VERIFICATION_REQUIRED: { icon: '🟠', label: 'RE-VERIFICATION REQUIRED' },
};

const APPROVAL_STATUS_LABELS = {
  NONE: { icon: '—', label: 'No draft obligation' },
  DRAFT: { icon: '⚪', label: 'DRAFT' },
  AWAITING_APPROVAL: { icon: '🟠', label: 'AWAITING APPROVAL' },
  APPROVED: { icon: '🟢', label: 'APPROVED' },
  APPROVAL_REJECTED: { icon: '🔴', label: 'APPROVAL REJECTED' },
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
  const filterBlock =
    segment === 'obligations'
      ? `<div class="ri-triage-filters" data-triage-filters hidden>
      <p class="ri-muted" data-triage-filter-hint>Human verification and formal approval are separate. <strong>Verified (regulatory)</strong> counts only evidence-backed regulatory reviews — not UAT or staging test decisions.</p>
      <div class="ri-triage-filter-row" data-triage-verification-filters></div>
      <div class="ri-triage-filter-row" data-triage-approval-filters></div>
    </div>`
      : `<div class="ri-triage-filters" data-triage-filters hidden>
      <div class="ri-triage-filter-row" data-triage-verification-filters></div>
    </div>`;
  return `${pageHeader({ title: screen.title, subtitle: screen.copy })}
    <section class="ri-panel" data-triage-screen="${esc(screen.queue)}" data-triage-segment="${esc(segment)}">
      ${filterBlock}
      <p class="ri-muted" data-triage-status>Loading this organisation’s ${esc(screen.title)} queue…</p>
      <div data-triage-rows></div>
      <dialog class="ri-dialog" data-triage-detail-dialog>
        <form method="dialog">
          <h3 data-triage-detail-title>Record</h3>
          <div data-triage-detail-body class="ri-read"></div>
          <button type="submit" class="ri-btn">Close</button>
        </form>
      </dialog>
      <div data-triage-review-host></div>
    </section>`;
}

function verificationBadge(status, item) {
  const meta = HUMAN_VERIFICATION_LABELS[status] || HUMAN_VERIFICATION_LABELS.UNVERIFIED;
  const prov = item?.decisionProvenance;
  const uat = item?.countsAsUatOrTest || prov?.countsAsUatOrTest;
  const suffix =
    status === 'VERIFIED' && uat ? ' <span class="ri-badge ri-badge--warn">UAT / test</span>' : '';
  const provenanceLine = prov?.label
    ? `<br><span class="ri-muted" title="${esc(prov.detail || '')}">${esc(prov.label)}</span>`
    : '';
  return `<span class="ri-triage-status-badge" title="${esc(meta.label)}" aria-label="${esc(meta.label)}">${esc(meta.icon)} <strong>${esc(meta.label)}</strong>${suffix}${provenanceLine}</span>`;
}

function approvalBadge(status) {
  const meta = APPROVAL_STATUS_LABELS[status] || APPROVAL_STATUS_LABELS.NONE;
  return `<span class="ri-triage-status-badge" title="${esc(meta.label)}" aria-label="${esc(meta.label)}">${esc(meta.icon)} <strong>${esc(meta.label)}</strong></span>`;
}

function manualReviewButtons(item) {
  const run = esc(item.runId);
  const finding = esc(item.findingId);
  return `<div class="ri-triage-manual-actions">
    <button type="button" class="ri-btn ri-btn--primary" data-triage-open-review="${run}" data-triage-finding-id="${finding}" data-triage-review-mode="verify" title="Accept after confirming quotation, provision, legal basis and justification">✅ Verify</button>
    <button type="button" class="ri-btn ri-btn--ghost" data-triage-open-review="${run}" data-triage-finding-id="${finding}" data-triage-review-mode="reject" title="Reject with mandatory justification">❌ Reject</button>
    <button type="button" class="ri-btn ri-btn--ghost" data-triage-open-review="${run}" data-triage-finding-id="${finding}" data-triage-review-mode="needs-review" title="Flag for further investigation (reclassification)">🟠 Needs review</button>
  </div>`;
}

function rowActionButtons(item) {
  const hv = item.humanVerification || 'UNVERIFIED';
  const parts = [manualReviewButtons(item)];
  if (hv === 'VERIFIED') {
    parts.push(
      `<button type="button" class="ri-btn ri-btn--ghost" data-triage-view-verification="${esc(item.findingId)}">View verification record</button>`,
    );
  } else if (hv === 'REJECTED') {
    parts.push(
      `<button type="button" class="ri-btn ri-btn--ghost" data-triage-view-decision="${esc(item.findingId)}">View rejection record</button>`,
    );
  } else if (hv === 'NEEDS_REVIEW' || hv === 'RE_VERIFICATION_REQUIRED') {
    parts.push(`<span class="ri-muted">Prior decision flagged for investigation — use Reassess below after opening history.</span>`);
  }
  parts.push(
    `<button type="button" class="ri-btn ri-btn--ghost" data-triage-open-review="${esc(item.runId)}" data-triage-finding-id="${esc(item.findingId)}" data-triage-review-mode="history">View history / reassess</button>`,
  );
  if (item.approvalStatus === 'APPROVED' && item.obligationId) {
    parts.push(
      `<a class="ri-btn ri-btn--ghost" href="${esc(item.approvalRecord?.obligationHref || `#/obligation/${item.obligationId}`)}">View Approval</a>`,
    );
  } else if (item.approvalStatus === 'AWAITING_APPROVAL' && item.obligationId) {
    parts.push(`<a class="ri-btn ri-btn--ghost" href="#/obligation/${esc(item.obligationId)}">View submission</a>`);
  }
  parts.push(`<a class="ri-muted" href="${esc(item.reviewHref)}">Full run</a>`);
  return parts.join('<br>');
}

function rowHtml(item, segment) {
  const reasons = Array.isArray(item.exceptionReasons) && item.exceptionReasons.length
    ? `<br><span class="ri-muted">${esc(item.exceptionReasons.join(', '))}</span>`
    : '';
  if (segment === 'obligations') {
    return `<tr data-triage-row data-human-verification="${esc(item.humanVerification || 'UNVERIFIED')}" data-approval-status="${esc(item.approvalStatus || 'NONE')}" data-counts-as-uat="${item.countsAsUatOrTest ? '1' : '0'}" data-genuine-verified="${item.countsAsGenuineHumanVerification ? '1' : '0'}">
      <td>${esc(item.provisionReference || '—')}</td>
      <td>${esc(item.regulatoryFinding || item.quotation || '—')}</td>
      <td>${verificationBadge(item.humanVerification, item)}${item.reVerificationRequired ? '<br><span class="ri-muted">Source revision changed</span>' : ''}</td>
      <td>${approvalBadge(item.approvalStatus)}</td>
      <td>${rowActionButtons(item)}</td>
    </tr>`;
  }
  const draft = item.obligationId
    ? `DRAFT recorded ${item.obligationId}`
    : item.triageQueue === 'OBLIGATION_TRIAGE'
      ? 'Human review required before a DRAFT obligation can be created'
      : 'Cannot become an approved obligation from this queue';
  return `<tr data-triage-row data-human-verification="${esc(item.humanVerification || 'UNVERIFIED')}" data-approval-status="${esc(item.approvalStatus || 'NONE')}">
    <td>${esc(item.regulator || '—')}</td>
    <td>${item.publicationId ? `<a href="#/publication/${esc(item.publicationId)}">${esc(item.publicationTitle || item.publicationId)}</a>` : '—'}</td>
    <td>${esc(item.provisionReference || '—')}</td>
    <td>${esc(item.quotation || '—')}</td>
    <td>${esc(item.classificationCode || (item.modelLabels || []).join(', ') || '—')}${item.provisional ? ' <span class="ri-muted">(provisional)</span>' : ''}</td>
    <td>${verificationBadge(item.humanVerification, item)}</td>
    <td>${esc(item.legalStatus || '—')}${item.legalBasis ? `<br><span class="ri-muted">${esc(item.legalBasis)}</span>` : ''}</td>
    <td>${esc(item.applicability || '—')}</td>
    <td>${badge(item.reviewStatus || '—')}${item.disposition ? `<br><span class="ri-muted">${esc(item.disposition)}</span>` : ''}${reasons}</td>
    <td>${esc(draft)}<br>${rowActionButtons(item)}</td>
  </tr>`;
}

function renderFilterChips(container, groups, activeKey, attrName) {
  if (!container) return;
  container.innerHTML = groups
    .map(
      ([key, label, count]) =>
        `<button type="button" class="ri-btn ri-btn--ghost${activeKey === key ? ' ri-btn--active' : ''}" data-${attrName}="${esc(key)}">${esc(label)} (${count})</button>`,
    )
    .join(' ');
}

function applyRowFilters(screen, verificationFilter, approvalFilter) {
  const rows = screen.querySelectorAll('[data-triage-row]');
  let visible = 0;
  rows.forEach((row) => {
    const hv = row.getAttribute('data-human-verification');
    const ap = row.getAttribute('data-approval-status');
    let show = true;
    if (verificationFilter && verificationFilter !== 'ALL') {
      if (verificationFilter === 'NEEDS_REVIEW') {
        show = hv === 'NEEDS_REVIEW' || hv === 'RE_VERIFICATION_REQUIRED';
      } else if (verificationFilter === 'UAT_TEST') {
        show = row.getAttribute('data-counts-as-uat') === '1';
      } else if (verificationFilter === 'VERIFIED') {
        show = hv === 'VERIFIED' && row.getAttribute('data-genuine-verified') === '1';
      } else if (verificationFilter === 'VERIFIED_UAT') {
        show = hv === 'VERIFIED' && row.getAttribute('data-genuine-verified') !== '1';
      } else {
        show = hv === verificationFilter;
      }
    }
    if (show && approvalFilter && approvalFilter !== 'ALL') {
      show = ap === approvalFilter;
    }
    row.hidden = !show;
    if (show) visible += 1;
  });
  const status = screen.querySelector('[data-triage-status]');
  if (status?.dataset.baseStatus) {
    status.textContent = `${visible} shown (filtered) · ${status.dataset.baseStatus}`;
  }
}

export async function hydrateConnectedTriage(root = document) {
  const state = getState();
  if (!isConnectedBackendActive(state)) return;
  const board = root.querySelector('[data-triage-board]');
  const screen = root.querySelector('[data-triage-screen]');
  if (!board && !screen) return;
  const base = apiBase(state);
  const queue = screen?.getAttribute('data-triage-screen') || '';
  const segment = screen?.getAttribute('data-triage-segment') || '';
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
    const statusText = `${body.total ?? 0} finding(s) in this queue from ${body.scannedRuns ?? 0} completed extraction run(s).${note} ${body.draftCreation || ''}`;
    if (status) {
      status.textContent = statusText;
      status.dataset.baseStatus = statusText;
    }
    const filters = screen.querySelector('[data-triage-filters]');
    const vCounts = body.verificationCounts || { ALL: body.items?.length ?? 0 };
    const aCounts = body.approvalCounts || { ALL: body.items?.length ?? 0 };
    if (filters) {
      filters.hidden = false;
      const verificationGroups = [
        ['ALL', 'All', vCounts.ALL ?? 0],
        ['UNVERIFIED', 'Unverified', vCounts.UNVERIFIED ?? 0],
        ['VERIFIED', 'Verified (regulatory)', vCounts.VERIFIED ?? vCounts.GENUINE_VERIFIED ?? 0],
        ['VERIFIED_UAT', 'Verified (UAT)', vCounts.VERIFIED_UAT ?? 0],
        ['NEEDS_REVIEW', 'Needs Review', (vCounts.NEEDS_REVIEW ?? 0) + (vCounts.RE_VERIFICATION_REQUIRED ?? 0)],
        ['REJECTED', 'Rejected', vCounts.REJECTED ?? 0],
        ['UAT_TEST', 'UAT / test decisions', vCounts.UAT_TEST ?? 0],
      ];
      renderFilterChips(
        screen.querySelector('[data-triage-verification-filters]'),
        verificationGroups,
        screen.dataset.verificationFilter || 'ALL',
        'triage-verification-filter',
      );
      if (segment === 'obligations') {
        const approvalGroups = [
          ['ALL', 'All Approvals', aCounts.ALL ?? 0],
          ['NONE', 'No draft', aCounts.NONE ?? 0],
          ['DRAFT', 'Draft', aCounts.DRAFT ?? 0],
          ['AWAITING_APPROVAL', 'Awaiting Approval', aCounts.AWAITING_APPROVAL ?? 0],
          ['APPROVED', 'Approved', aCounts.APPROVED ?? 0],
          ['APPROVAL_REJECTED', 'Approval Rejected', aCounts.APPROVAL_REJECTED ?? 0],
        ];
        renderFilterChips(
          screen.querySelector('[data-triage-approval-filters]'),
          approvalGroups,
          screen.dataset.approvalFilter || 'ALL',
          'triage-approval-filter',
        );
      }
    }
    if (!rows) return;
    if (!body.items?.length) {
      rows.innerHTML = '<p>No findings in this queue for the scanned runs.</p>';
      return;
    }
    screen._triageItems = body.items;
    const head =
      segment === 'obligations'
        ? `<thead><tr>
      <th>Provision</th><th>Regulatory Finding</th><th>Human Verification</th><th>Approval Status</th><th>Action</th>
    </tr></thead>`
        : `<thead><tr>
      <th>Regulator</th><th>Publication</th><th>Provision</th><th>Quotation</th><th>Classification</th><th>Human Verification</th><th>Legal basis</th><th>Applicability</th><th>Review</th><th>Action</th>
    </tr></thead>`;
    rows.innerHTML = `<table class="ri-table">${head}<tbody>${body.items.map((item) => rowHtml(item, segment)).join('')}</tbody></table>`;
    bindTriageReview(screen);
    bindTriageFilters(screen);
    bindTriageDetailDialogs(screen);
  } catch (err) {
    target.dataset.loaded = '';
    const status = screen?.querySelector('[data-triage-status]');
    if (status) status.textContent = err?.message || 'Triage queue unavailable';
    root.querySelectorAll('[data-triage-count]').forEach((el) => {
      if (el.textContent === '…') el.textContent = '—';
    });
  }
}

function formatVerificationDetail(item) {
  const v = item?.verificationRecord;
  if (!v) return '<p>No verification record.</p>';
  return `<dl class="ri-dl">
    <dt>Reviewer</dt><dd>${esc(v.reviewerUserId || '—')}</dd>
    <dt>Decision</dt><dd>${esc(v.decision || '—')}</dd>
    <dt>Verified at</dt><dd>${esc(v.verifiedAt || '—')}</dd>
    <dt>Audit reference</dt><dd>${esc(v.analysisReviewId || '—')}</dd>
    <dt>Provision</dt><dd>${esc(v.provisionReference || '—')} (${esc(v.provisionFunction || '—')})</dd>
    <dt>Verified quotation</dt><dd>${esc(v.verifiedQuotation || '—')}${v.quotationPage != null ? ` (p.${esc(String(v.quotationPage))})` : ''}</dd>
    <dt>Legal basis</dt><dd>${esc(v.legalBasis || '—')}</dd>
    <dt>Classification</dt><dd>${esc(v.regulatoryClassificationCode || '—')} · ${esc(v.legalStatus || '—')}</dd>
    <dt>Evidence pathway</dt><dd>${esc(v.evidencePathway || '—')}</dd>
    <dt>Quotation verification</dt><dd>${esc(v.quotationVerificationId || '—')}</dd>
    <dt>Provenance</dt><dd>${esc(v.provenanceLabel || item.decisionProvenance?.label || '—')} (${esc(v.provenanceClass || item.decisionProvenance?.provenanceClass || '—')})</dd>
    <dt>Reviewer role</dt><dd>${esc(v.reviewerRole || item.reviewerRole || '—')}</dd>
    <dt>Justification</dt><dd>${esc(v.reviewerJustification || '—')}</dd>
    ${item.countsAsUatOrTest ? '<dt>Regulatory sign-off</dt><dd><strong>Not legal verification</strong> — staging/UAT pathway. Audit record only.</dd>' : ''}
    ${item.reVerificationRequired ? '<dt>Note</dt><dd><strong>RE-VERIFICATION REQUIRED</strong> — publication version at extraction differs from current version.</dd>' : ''}
    <dt>Reassessment</dt><dd>Prior run-level reviews are immutable. Reassessment requires a new extraction run or future reassessment workflow — use View history to inspect the audit record without overwriting it.</dd>
  </dl>`;
}

function formatDecisionDetail(item) {
  const v = item?.verificationRecord;
  if (!v) return '<p>No decision record.</p>';
  return `<dl class="ri-dl">
    <dt>Reviewer</dt><dd>${esc(v.reviewerUserId || '—')}</dd>
    <dt>Decision</dt><dd>${esc(v.decision || '—')}</dd>
    <dt>Recorded at</dt><dd>${esc(v.verifiedAt || '—')}</dd>
    <dt>Audit reference</dt><dd>${esc(v.analysisReviewId || '—')}</dd>
    <dt>Justification</dt><dd>${esc(v.reviewerJustification || '—')}</dd>
    <dt>Disposition</dt><dd>${esc(v.disposition || '—')}</dd>
  </dl>`;
}

function bindTriageDetailDialogs(screen) {
  if (screen.dataset.detailBound === '1') return;
  screen.dataset.detailBound = '1';
  const dialog = screen.querySelector('[data-triage-detail-dialog]');
  const titleEl = screen.querySelector('[data-triage-detail-title]');
  const bodyEl = screen.querySelector('[data-triage-detail-body]');
  screen.addEventListener('click', (event) => {
    const viewV = event.target.closest('[data-triage-view-verification]');
    const viewD = event.target.closest('[data-triage-view-decision]');
    const findingId = viewV?.getAttribute('data-triage-view-verification') || viewD?.getAttribute('data-triage-view-decision');
    if (!findingId || !dialog) return;
    const item = (screen._triageItems || []).find((i) => i.findingId === findingId);
    if (!item) return;
    if (titleEl) titleEl.textContent = viewV ? 'Human verification record' : 'Rejection decision';
    if (bodyEl) bodyEl.innerHTML = viewV ? formatVerificationDetail(item) : formatDecisionDetail(item);
    dialog.showModal();
  });
}

function bindTriageFilters(screen) {
  if (screen.dataset.filterBound === '1') return;
  screen.dataset.filterBound = '1';
  screen.addEventListener('click', (event) => {
    const vf = event.target.closest('[data-triage-verification-filter]');
    const af = event.target.closest('[data-triage-approval-filter]');
    if (vf) {
      screen.dataset.verificationFilter = vf.getAttribute('data-triage-verification-filter');
      applyRowFilters(screen, screen.dataset.verificationFilter, screen.dataset.approvalFilter || 'ALL');
      screen.querySelectorAll('[data-triage-verification-filter]').forEach((btn) => {
        btn.classList.toggle('ri-btn--active', btn === vf);
      });
    }
    if (af) {
      screen.dataset.approvalFilter = af.getAttribute('data-triage-approval-filter');
      applyRowFilters(screen, screen.dataset.verificationFilter || 'ALL', screen.dataset.approvalFilter);
      screen.querySelectorAll('[data-triage-approval-filter]').forEach((btn) => {
        btn.classList.toggle('ri-btn--active', btn === af);
      });
    }
  });
}

function applyTriageReviewMode(host, findingId, mode) {
  const card = host.querySelector(`[data-finding-review-item="${CSS.escape(findingId)}"]`);
  if (!card) return;
  if (mode === 'verify') {
    card.querySelector('[data-finding-decision][value="ACCEPTED"]')?.click();
  } else if (mode === 'reject') {
    card.querySelector('[data-finding-decision][value="REJECTED"]')?.click();
  } else if (mode === 'needs-review') {
    card.querySelector('[data-finding-decision][value="ACCEPTED"]')?.click();
    const disp = card.querySelector('[data-finding-disposition]');
    if (disp) disp.value = 'RECLASSIFICATION_REQUESTED';
    const reclass = card.querySelector('[data-finding-reclassification]');
    if (reclass && !reclass.value) {
      reclass.value = 'Further investigation required — applicability or classification uncertain.';
    }
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
    const findingId = button.getAttribute('data-triage-finding-id');
    const mode = button.getAttribute('data-triage-review-mode') || 'verify';
    host.innerHTML = '<p class="ri-muted">Loading finding review…</p>';
    try {
      const body = await fetchConnectedAiFindingReview(getState(), runId);
      host.innerHTML = renderConnectedAiFindingReviewPanel(body);
      const panel = host.querySelector('[data-connected-ai-finding-review]');
      if (panel) {
        bindConnectedAiFindingReview(panel, {
          onSubmitted: () => {
            const screen = document.querySelector('[data-triage-screen]');
            if (screen) screen.dataset.loaded = '';
            hydrateConnectedTriage(document);
          },
        });
        if (findingId && mode !== 'history') applyTriageReviewMode(host, findingId, mode);
      } else if (body.decisions?.length) {
        host.insertAdjacentHTML(
          'afterbegin',
          '<p class="ri-callout">This extraction run was already reviewed. Decisions are immutable — reassessment requires a new UC-RI-005 run. The audit history is shown below.</p>',
        );
      }
      if (findingId) {
        const target =
          host.querySelector(`[data-finding-review-item="${CSS.escape(findingId)}"]`) ||
          host.querySelector(`[data-finding-decision-row="${CSS.escape(findingId)}"]`);
        target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        target?.classList.add('ri-finding-review--highlight');
      }
    } catch (err) {
      host.textContent = err?.message || 'Finding review unavailable';
    }
  });
}