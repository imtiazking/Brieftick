/**
 * Tenant-scoped triage queues. Counts and rows come from GET /api/ri-lab/triage.
 * Draft obligations are created only by the existing finding-review panel.
 */
import { esc, pageHeader, badge } from '../components.js';
import { getState } from '../store.js';
import { isConnectedBackendActive } from './connected-mode.js';
import { isConnectedAiReviewEnabled } from './connected-mode.js';
import {
  bindConnectedAiFindingReview,
  bindFindingReassessment,
  fetchConnectedAiFindingReview,
  renderConnectedAiFindingReviewPanel,
  renderFindingReassessmentPanel,
} from './connected-ai-governance-panels.js';

const LEGACY_TRIAGE_SEGMENT = {
  obligations: 'verified-obligations',
  exceptions: 'exceptions',
};

export const TRIAGE_SCREENS = {
  'ai-findings': {
    queue: 'AI_FINDINGS',
    title: 'AI Findings',
    copy: 'Newly extracted findings awaiting human classification. AI recommendations are provisional — they are not verification or approval.',
  },
  'verified-obligations': {
    queue: 'VERIFIED_OBLIGATIONS',
    title: 'Verified Obligations',
    copy: 'Human-verified potential obligations. Human verified ≠ maker-checker approved ≠ legally verified. DRAFT materialisation follows existing finding review only.',
  },
  'non-obligations': {
    queue: 'NON_OBLIGATIONS',
    title: 'Non-Obligations',
    copy: 'Findings confirmed as non-binding material, guidance, or definitions. No approved organisation obligations are created here.',
  },
  rejected: {
    queue: 'REJECTED_FINDINGS',
    title: 'Rejected Findings',
    copy: 'Incorrect extractions, duplicates and rejected AI findings. Original extraction and audit history are preserved.',
  },
  exceptions: {
    queue: 'EXCEPTIONS',
    title: 'Exceptions',
    copy: 'Ambiguous findings requiring further investigation, conflicting classifications, or specialist review.',
  },
  'not-applicable': {
    queue: 'NOT_APPLICABLE',
    title: 'Not Applicable',
    copy: 'Binding requirements assessed as not applicable to this organisation. Distinct from non-binding regulatory material.',
  },
  all: {
    queue: 'ALL_FINDINGS',
    title: 'All Findings',
    copy: 'Every finding in the current scan window regardless of workflow queue.',
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
  const resolved = LEGACY_TRIAGE_SEGMENT[segment] || segment;
  return TRIAGE_SCREENS[resolved] || null;
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
    <h2>Regulatory triage</h2>
    <p class="ri-muted">Six workflow queues plus All Findings — live counts from persisted review decisions (tenant-scoped).</p>
    <div class="ri-priority-metrics ri-priority-metrics--dense">
      ${card('ai-findings', 'AI Findings', 'Awaiting human review')}
      ${card('verified-obligations', 'Verified Obligations', 'Human-verified potential obligations')}
      ${card('non-obligations', 'Non-Obligations', 'Non-binding confirmations')}
      ${card('rejected', 'Rejected Findings', 'Rejected extractions')}
      ${card('exceptions', 'Exceptions', 'Needs investigation')}
      ${card('not-applicable', 'Not Applicable', 'Binding but N/A to org')}
      ${card('all', 'All Findings', 'Complete inventory')}
    </div>
  </section>`;
}

export function renderTriageScreen(segment) {
  const screen = triageScreenFor(segment);
  if (!screen) {
    return `${pageHeader('Regulatory triage', 'Choose a workflow queue')}
      <ul>
        ${Object.entries(TRIAGE_SCREENS)
          .map(([seg, s]) => `<li><a href="#/triage/${seg}">${esc(s.title)}</a></li>`)
          .join('')}
      </ul>`;
  }
  if (!isConnectedBackendActive(getState())) {
    return `${pageHeader(screen.title, 'Connected staging data is required')}
      <section class="ri-panel"><p>Sign in and connect this organisation. Demonstration counts are not shown on this screen.</p></section>`;
  }
  const resolvedSegment = LEGACY_TRIAGE_SEGMENT[segment] || segment;
  const filterBlock =
    resolvedSegment === 'verified-obligations' || resolvedSegment === 'ai-findings' || resolvedSegment === 'all'
      ? `<div class="ri-triage-filters" data-triage-filters hidden>
      <p class="ri-muted" data-triage-filter-hint>Human verification and formal approval are separate. <strong>Verified (regulatory)</strong> counts only evidence-backed regulatory reviews — not UAT or staging test decisions.</p>
      <div class="ri-triage-presentation-metrics" data-triage-presentation-metrics hidden></div>
      <div class="ri-triage-filter-row" data-triage-verification-filters></div>
      <div class="ri-triage-filter-row" data-triage-approval-filters></div>
    </div>`
      : `<div class="ri-triage-filters" data-triage-filters hidden>
      <div class="ri-triage-filter-row" data-triage-verification-filters></div>
    </div>`;
  return `${pageHeader({ title: screen.title, subtitle: screen.copy })}
    <section class="ri-panel" data-triage-screen="${esc(screen.queue)}" data-triage-segment="${esc(resolvedSegment)}">
      ${filterBlock}
      <p class="ri-muted" data-triage-status>Loading this organisation’s ${esc(screen.title)} queue…</p>
      <nav class="ri-triage-pagination" data-triage-pagination hidden aria-label="Findings pagination">
        <label class="ri-muted">Per page
          <select data-triage-page-size>
            <option value="25">25</option>
            <option value="50" selected>50</option>
            <option value="100">100</option>
          </select>
        </label>
        <input type="search" class="ri-input" data-triage-search placeholder="Search this queue (server-side)…" autocomplete="off" />
        <button type="button" class="ri-btn ri-btn--ghost" data-triage-prev>Previous</button>
        <span data-triage-page-info class="ri-muted">Page 1</span>
        <button type="button" class="ri-btn ri-btn--ghost" data-triage-next>Next</button>
      </nav>
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

function manualReviewButtons(item, intent) {
  const run = esc(item.runId);
  const finding = esc(item.findingId);
  const prefix = intent === 'reassess' ? 'Reassess' : '';
  if (intent === 'reassess') {
    return `<div class="ri-triage-manual-actions" data-triage-manual-actions>
    <button type="button" class="ri-btn ri-btn--primary" data-triage-open-review="${run}" data-triage-finding-id="${finding}" data-triage-review-mode="verify-obligation" data-triage-review-intent="reassess" title="Reassess → Verified Obligations">✅ Reassess · Verify obligation</button>
    <button type="button" class="ri-btn ri-btn--ghost" data-triage-open-review="${run}" data-triage-finding-id="${finding}" data-triage-review-mode="non-obligation" data-triage-review-intent="reassess">🔵 Reassess · Non-obligation</button>
    <button type="button" class="ri-btn ri-btn--ghost" data-triage-open-review="${run}" data-triage-finding-id="${finding}" data-triage-review-mode="reject" data-triage-review-intent="reassess">🔴 Reassess · Reject</button>
    <button type="button" class="ri-btn ri-btn--ghost" data-triage-open-review="${run}" data-triage-finding-id="${finding}" data-triage-review-mode="exception" data-triage-review-intent="reassess">🟠 Reassess · Exception</button>
    <button type="button" class="ri-btn ri-btn--ghost" data-triage-open-review="${run}" data-triage-finding-id="${finding}" data-triage-review-mode="not-applicable" data-triage-review-intent="reassess">⚪ Reassess · Not applicable</button>
  </div>`;
  }
  return `<div class="ri-triage-manual-actions" data-triage-manual-actions data-triage-five-decisions>
    <button type="button" class="ri-btn ri-btn--primary" data-triage-open-review="${run}" data-triage-finding-id="${finding}" data-triage-review-mode="verify-obligation" data-triage-review-intent="first-review" title="Verify obligation — routes to Verified Obligations">✅ ${prefix} Verify obligation</button>
    <button type="button" class="ri-btn ri-btn--ghost" data-triage-open-review="${run}" data-triage-finding-id="${finding}" data-triage-review-mode="non-obligation" data-triage-review-intent="first-review">🔵 ${prefix} Non-obligation</button>
    <button type="button" class="ri-btn ri-btn--ghost" data-triage-open-review="${run}" data-triage-finding-id="${finding}" data-triage-review-mode="reject" data-triage-review-intent="first-review">🔴 ${prefix} Reject</button>
    <button type="button" class="ri-btn ri-btn--ghost" data-triage-open-review="${run}" data-triage-finding-id="${finding}" data-triage-review-mode="exception" data-triage-review-intent="first-review">🟠 ${prefix} Exception</button>
    <button type="button" class="ri-btn ri-btn--ghost" data-triage-open-review="${run}" data-triage-finding-id="${finding}" data-triage-review-mode="not-applicable" data-triage-review-intent="first-review">⚪ ${prefix} Not applicable</button>
  </div>`;
}

function rowActionButtons(item, state) {
  const hv = item.humanVerification || 'UNVERIFIED';
  const canWrite = isConnectedAiReviewEnabled(state);
  const parts = [];
  const inAiInbox = item.workflowQueue === 'AI_FINDINGS';
  if (canWrite && item.canFirstReview && inAiInbox) {
    parts.push(manualReviewButtons(item, 'first-review'));
  } else if (canWrite && item.canReassess) {
    parts.push(manualReviewButtons(item, 'reassess'));
  } else if (item.obligationApprovalLocked) {
    parts.push('<p class="ri-muted">Reassessment unavailable — linked obligation is approved in the register.</p>');
  } else if (!item.hasPersistedDecision && !item.canFirstReview) {
    parts.push('<p class="ri-muted">First review must be completed for this extraction run elsewhere before this finding can be reassessed.</p>');
  } else if (!canWrite) {
    parts.push('<p class="ri-muted">Review writes require an authorised reviewer session.</p>');
  }
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
    `<button type="button" class="ri-btn ri-btn--ghost" data-triage-open-review="${esc(item.runId)}" data-triage-finding-id="${esc(item.findingId)}" data-triage-review-mode="history" data-triage-review-intent="history">View history</button>`,
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
  const rowAttrs = `data-triage-row data-workflow-queue="${esc(item.workflowQueue || '')}" data-human-verification="${esc(item.humanVerification || 'UNVERIFIED')}" data-approval-status="${esc(item.approvalStatus || 'NONE')}" data-counts-as-uat="${item.countsAsUatOrTest ? '1' : '0'}" data-genuine-verified="${item.countsAsGenuineHumanVerification ? '1' : '0'}" data-awaiting-first-review="${item.hasPersistedDecision ? '0' : '1'}"`;
  const confidence =
    item.aiConfidence != null ? `<br><span class="ri-muted">AI confidence ${esc(String(Math.round(item.aiConfidence * 100)))}%</span>` : '';
  const pdfRef = item.sourcePdfPage != null ? `<br><span class="ri-muted">PDF p.${esc(String(item.sourcePdfPage))}</span>` : '';
  const draft = item.obligationId
    ? `DRAFT ${item.obligationId}`
    : item.workflowQueue === 'VERIFIED_OBLIGATIONS'
      ? 'Eligible for DRAFT via full finding review'
      : '—';
  if (segment === 'ai-findings') {
    return `<tr ${rowAttrs}>
      <td>${esc(item.regulator || '—')}</td>
      <td>${item.publicationId ? `<a href="#/publication/${esc(item.publicationId)}">${esc(item.publicationTitle || item.publicationId)}</a>` : '—'}</td>
      <td>${esc(item.provisionReference || '—')}</td>
      <td>${esc(item.aiClassification || item.classificationCode || '—')}${item.provisional ? ' <span class="ri-muted">(provisional)</span>' : ''}</td>
      <td>${esc(item.aiAssessmentRationale || item.regulatoryFinding || '—')}${confidence}</td>
      <td>${esc(item.quotation || '—')}${pdfRef}</td>
      <td>${esc(item.legalBasis || '—')}</td>
      <td>${esc(item.applicability || '—')}</td>
      <td>${verificationBadge(item.humanVerification, item)}</td>
      <td>${rowActionButtons(item, getState())}</td>
    </tr>`;
  }
  if (segment === 'verified-obligations') {
    return `<tr ${rowAttrs}>
      <td>${esc(item.provisionReference || '—')}</td>
      <td>${esc(item.regulatoryFinding || item.quotation || '—')}</td>
      <td>${verificationBadge(item.humanVerification, item)}${item.reassessmentCount ? `<br><span class="ri-muted">${item.reassessmentCount} reassessment(s)</span>` : ''}</td>
      <td>${approvalBadge(item.approvalStatus)}</td>
      <td>${esc(draft)}</td>
      <td>${rowActionButtons(item, getState())}</td>
    </tr>`;
  }
  return `<tr ${rowAttrs}>
    <td>${esc(item.regulator || '—')}</td>
    <td>${item.publicationId ? `<a href="#/publication/${esc(item.publicationId)}">${esc(item.publicationTitle || item.publicationId)}</a>` : '—'}</td>
    <td>${esc(item.provisionReference || '—')}</td>
    <td>${esc(item.quotation || '—')}</td>
    <td>${esc(item.classificationCode || (item.modelLabels || []).join(', ') || '—')}${item.provisional ? ' <span class="ri-muted">(provisional)</span>' : ''}</td>
    <td>${verificationBadge(item.humanVerification, item)}</td>
    <td>${esc(item.legalStatus || '—')}${item.legalBasis ? `<br><span class="ri-muted">${esc(item.legalBasis)}</span>` : ''}</td>
    <td>${badge(item.workflowQueue || '—')}${item.disposition ? `<br><span class="ri-muted">${esc(item.disposition)}</span>` : ''}${reasons}</td>
    <td>${rowActionButtons(item, getState())}</td>
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

function buildTriageListUrl(base, queue, screen) {
  const params = new URLSearchParams();
  if (queue) params.set('queue', queue);
  params.set('page', String(screen.dataset.triagePage || '1'));
  params.set('pageSize', String(screen.dataset.triagePageSize || '50'));
  params.set('verificationFilter', screen.dataset.verificationFilter || 'ALL');
  params.set('approvalFilter', screen.dataset.approvalFilter || 'ALL');
  const search = (screen.dataset.triageSearch || '').trim();
  if (search) params.set('search', search);
  const qs = params.toString();
  return qs ? `${base}/triage?${qs}` : `${base}/triage`;
}

function syncPaginationUi(screen, body) {
  const nav = screen.querySelector('[data-triage-pagination]');
  const pg = body.pagination;
  if (!nav || !pg) {
    if (nav) nav.hidden = true;
    return;
  }
  nav.hidden = false;
  const sizeSelect = nav.querySelector('[data-triage-page-size]');
  if (sizeSelect && String(sizeSelect.value) !== String(pg.pageSize)) sizeSelect.value = String(pg.pageSize);
  const info = nav.querySelector('[data-triage-page-info]');
  if (info) info.textContent = `Page ${pg.page} of ${pg.totalPages || 1} · ${pg.totalItems} in view`;
  const prev = nav.querySelector('[data-triage-prev]');
  const next = nav.querySelector('[data-triage-next]');
  if (prev) prev.disabled = !pg.hasPreviousPage;
  if (next) next.disabled = !pg.hasNextPage;
  const searchInput = nav.querySelector('[data-triage-search]');
  if (searchInput && searchInput !== document.activeElement) {
    searchInput.value = body.activeFilters?.search || screen.dataset.triageSearch || '';
  }
}

export async function loadConnectedTriageScreen(screen, root, { force = false } = {}) {
  const state = getState();
  const base = apiBase(state);
  const queue = screen.getAttribute('data-triage-screen') || '';
  const rawSegment = screen.getAttribute('data-triage-segment') || '';
  const segment = LEGACY_TRIAGE_SEGMENT[rawSegment] || rawSegment;
  const loadKey = `${queue}|${screen.dataset.triagePage || '1'}|${screen.dataset.triagePageSize || '50'}|${screen.dataset.verificationFilter || 'ALL'}|${screen.dataset.approvalFilter || 'ALL'}|${screen.dataset.triageSearch || ''}`;
  if (!force && screen.dataset.loadKey === loadKey) return;
  screen.dataset.loadKey = loadKey;
  const url = buildTriageListUrl(base, queue, screen);
  const status = screen.querySelector('[data-triage-status]');
  const rows = screen.querySelector('[data-triage-rows]');
  try {
    const res = await fetch(url, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.ok) throw new Error(body.error || body.code || 'triage_unavailable');
    const note = body.truncated
      ? ' Counts reflect the newest completed extraction runs in the scan window only.'
      : '';
    const pg = body.pagination;
    const listTotal = body.filteredTotal ?? body.items?.length ?? 0;
    const range =
      pg && pg.totalItems
        ? `Showing ${body.items?.length ?? 0} of ${listTotal} on this page (queue total ${body.total ?? 0}).`
        : `${body.total ?? 0} finding(s) in this queue.`;
    const statusText = `${range} ${body.scannedRuns ?? 0} completed extraction run(s) scanned.${note} ${body.draftCreation || ''}`;
    if (status) {
      status.textContent = statusText;
      status.dataset.baseStatus = statusText;
    }
    syncPaginationUi(screen, body);
    const filters = screen.querySelector('[data-triage-filters]');
    const vCounts = body.verificationCounts || { ALL: body.total ?? 0 };
    const pCounts = body.presentationCounts || {};
    const aCounts = body.approvalCounts || { ALL: body.total ?? 0 };
    if (filters) {
      filters.hidden = false;
      const metrics = screen.querySelector('[data-triage-presentation-metrics]');
      if (metrics && (segment === 'verified-obligations' || segment === 'ai-findings' || segment === 'all')) {
        metrics.hidden = false;
        metrics.innerHTML = `<div class="ri-priority-metrics">
          <span class="ri-metric"><span class="ri-metric__label">Awaiting first review</span><span class="ri-metric__value">${pCounts.AWAITING_FIRST_REVIEW ?? 0}</span></span>
          <span class="ri-metric"><span class="ri-metric__label">Regulatory verified</span><span class="ri-metric__value">${pCounts.GENUINE_REGULATORY_VERIFIED ?? 0}</span></span>
          <span class="ri-metric"><span class="ri-metric__label">UAT verified</span><span class="ri-metric__value">${pCounts.UAT_VERIFIED ?? 0}</span></span>
          <span class="ri-metric"><span class="ri-metric__label">Needs investigation</span><span class="ri-metric__value">${pCounts.NEEDS_FURTHER_INVESTIGATION ?? 0}</span></span>
          <span class="ri-metric"><span class="ri-metric__label">Rejected (UAT)</span><span class="ri-metric__value">${pCounts.REJECTED_UAT ?? 0}</span></span>
        </div>`;
      }
      const verificationGroups = [
        ['ALL', 'All', vCounts.ALL ?? 0],
        ['AWAITING_FIRST_REVIEW', 'Awaiting first review', pCounts.AWAITING_FIRST_REVIEW ?? vCounts.UNVERIFIED ?? 0],
        ['UNVERIFIED', 'Unverified (routed)', vCounts.UNVERIFIED ?? 0],
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
      if (segment === 'verified-obligations') {
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
      rows.innerHTML = '<p>No findings in this queue for the current filters.</p>';
      screen._triageItems = [];
      return;
    }
    screen._triageItems = body.items;
    const head =
      segment === 'ai-findings'
        ? `<thead><tr>
      <th>Regulator</th><th>Publication</th><th>Provision</th><th>AI classification</th><th>AI rationale</th><th>Quotation</th><th>Legal basis</th><th>Applicability</th><th>Status</th><th>Actions</th>
    </tr></thead>`
        : segment === 'verified-obligations'
          ? `<thead><tr>
      <th>Provision</th><th>Requirement</th><th>Human verification</th><th>Approval</th><th>Draft</th><th>Actions</th>
    </tr></thead>`
          : `<thead><tr>
      <th>Regulator</th><th>Publication</th><th>Provision</th><th>Quotation</th><th>Classification</th><th>Verification</th><th>Legal basis</th><th>Queue / disposition</th><th>Actions</th>
    </tr></thead>`;
    rows.innerHTML = `<table class="ri-table">${head}<tbody>${body.items.map((item) => rowHtml(item, segment)).join('')}</tbody></table>`;
    bindTriageReview(screen);
    bindTriageFilters(screen);
    bindTriagePagination(screen);
    bindTriageDetailDialogs(screen);
  } catch (err) {
    screen.dataset.loadKey = '';
    if (status) status.textContent = err?.message || 'Triage queue unavailable';
    if (rows) rows.innerHTML = '';
  }
}

export async function hydrateConnectedTriage(root = document) {
  const state = getState();
  if (!isConnectedBackendActive(state)) return;
  const board = root.querySelector('[data-triage-board]');
  const screen = root.querySelector('[data-triage-screen]');
  if (!board && !screen) return;
  const base = apiBase(state);
  const target = screen || board;
  if (screen) {
    if (!screen.dataset.triagePage) screen.dataset.triagePage = '1';
    if (!screen.dataset.triagePageSize) screen.dataset.triagePageSize = '50';
    if (!screen.dataset.verificationFilter) screen.dataset.verificationFilter = 'ALL';
    if (!screen.dataset.approvalFilter) screen.dataset.approvalFilter = 'ALL';
    await loadConnectedTriageScreen(screen, root);
    return;
  }
  const url = `${base}/triage`;
  if (target.dataset.boardLoaded === '1') return;
  target.dataset.boardLoaded = '1';
  try {
    const res = await fetch(url, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.ok) throw new Error(body.error || body.code || 'triage_unavailable');
    root.querySelectorAll('[data-triage-count]').forEach((el) => {
      const key = el.getAttribute('data-triage-count');
      const value = body.counts?.[key];
      el.textContent = Number.isInteger(value) ? String(value) : '0';
    });
  } catch {
    target.dataset.boardLoaded = '';
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
    ${item.reassessmentCount ? `<dt>Reassessments</dt><dd>${esc(String(item.reassessmentCount))} versioned record(s) after the original decision.</dd>` : ''}
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
      screen.dataset.triagePage = '1';
      screen.dataset.loadKey = '';
      loadConnectedTriageScreen(screen, document);
    }
    if (af) {
      screen.dataset.approvalFilter = af.getAttribute('data-triage-approval-filter');
      screen.dataset.triagePage = '1';
      screen.dataset.loadKey = '';
      loadConnectedTriageScreen(screen, document);
    }
  });
}

function bindTriagePagination(screen) {
  if (screen.dataset.paginationBound === '1') return;
  screen.dataset.paginationBound = '1';
  const nav = screen.querySelector('[data-triage-pagination]');
  if (!nav) return;
  let searchTimer = null;
  nav.addEventListener('click', (event) => {
    const prev = event.target.closest('[data-triage-prev]');
    const next = event.target.closest('[data-triage-next]');
    if (prev && !prev.disabled) {
      screen.dataset.triagePage = String(Math.max(1, Number(screen.dataset.triagePage || '1') - 1));
      screen.dataset.loadKey = '';
      loadConnectedTriageScreen(screen, document);
    }
    if (next && !next.disabled) {
      screen.dataset.triagePage = String(Number(screen.dataset.triagePage || '1') + 1);
      screen.dataset.loadKey = '';
      loadConnectedTriageScreen(screen, document);
    }
  });
  nav.addEventListener('change', (event) => {
    if (event.target.matches('[data-triage-page-size]')) {
      screen.dataset.triagePageSize = event.target.value;
      screen.dataset.triagePage = '1';
      screen.dataset.loadKey = '';
      loadConnectedTriageScreen(screen, document);
    }
  });
  const searchInput = nav.querySelector('[data-triage-search]');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        screen.dataset.triageSearch = searchInput.value.trim();
        screen.dataset.triagePage = '1';
        screen.dataset.loadKey = '';
        loadConnectedTriageScreen(screen, document);
      }, 350);
    });
  }
}

function applyTriageReviewMode(host, findingId, mode) {
  const card = host.querySelector(`[data-finding-review-item="${CSS.escape(findingId)}"]`);
  if (!card) return;
  const accepted = () => card.querySelector('[data-finding-decision][value="ACCEPTED"]')?.click();
  const disposition = (value) => {
    const disp = card.querySelector('[data-finding-disposition]');
    if (disp) disp.value = value;
  };
  if (mode === 'verify' || mode === 'verify-obligation') {
    accepted();
  } else if (mode === 'reject') {
    card.querySelector('[data-finding-decision][value="REJECTED"]')?.click();
  } else if (mode === 'non-obligation') {
    accepted();
    disposition('SUPPORTING_INFORMATION');
    const code = card.querySelector('[data-finding-classification]');
    if (code && !code.value) code.value = 'G';
  } else if (mode === 'exception' || mode === 'needs-review') {
    accepted();
    disposition('RECLASSIFICATION_REQUESTED');
    const reclass = card.querySelector('[data-finding-reclassification]');
    if (reclass && !reclass.value) {
      reclass.value = 'Exception — further investigation required before routing.';
    }
  } else if (mode === 'not-applicable') {
    accepted();
    disposition('ORGANISATION_NOT_APPLICABLE');
    const comment = card.querySelector('[data-finding-comment]');
    if (comment && !comment.value.trim()) {
      comment.value = 'Binding requirement assessed as not applicable to this organisation.';
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
    const intent = button.getAttribute('data-triage-review-intent') || 'first-review';
    host.innerHTML = '<p class="ri-muted">Loading finding review…</p>';
    try {
      const body = await fetchConnectedAiFindingReview(getState(), runId);
      const useReassessment =
        intent === 'reassess' || (intent === 'history' && body.decisions?.length) || (body.runReviewCompleted && body.decisions?.length);
      if (useReassessment && findingId) {
        host.innerHTML = renderFindingReassessmentPanel(body, findingId, mode === 'history' ? 'history' : mode);
        bindFindingReassessment(host.querySelector('[data-connected-finding-reassessment]'), {
          onSubmitted: () => {
            const screen = document.querySelector('[data-triage-screen]');
            if (screen) {
              screen.dataset.loadKey = '';
              screen.dataset.triagePage = '1';
            }
            hydrateConnectedTriage(document);
          },
          onError: (err) => {
            host.querySelector('[data-connected-finding-reassessment]')?.insertAdjacentHTML(
              'beforeend',
              `<p class="ri-callout">${esc(err?.message || 'Reassessment failed')}</p>`,
            );
          },
        });
        if (mode !== 'history') applyTriageReviewMode(host, findingId, mode);
      } else {
        host.innerHTML = renderConnectedAiFindingReviewPanel(body);
        const panel = host.querySelector('[data-connected-ai-finding-review]');
        if (panel) {
          bindConnectedAiFindingReview(panel, {
            onSubmitted: () => {
              const screen = document.querySelector('[data-triage-screen]');
              if (screen) {
                screen.dataset.loadKey = '';
                screen.dataset.triagePage = '1';
              }
              hydrateConnectedTriage(document);
            },
          });
          if (findingId) applyTriageReviewMode(host, findingId, mode);
        }
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