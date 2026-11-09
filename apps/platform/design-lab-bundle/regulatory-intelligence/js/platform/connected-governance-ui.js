/**
 * Step 81G — connected governance UI helpers (read-only production data).
 */
import { esc, badge, dataTable, formatDateTime, emptyState } from '../components.js';
import { getState } from '../store.js';

export function connectedGovernanceUnavailableNote(title, detail) {
  return `<p class="ri-muted" data-connected-gov-unavailable="${esc(title)}">${esc(detail)}</p>`;
}

export function connectedReadOnlyGovernanceBanner(state = getState()) {
  const writes =
    state.platformConfig?.writesEnabled === true ||
    state.platformConfig?.backendSession?.writeCapabilities?.impactAssessments;
  if (writes) {
    return `<p class="ri-alert" data-connected-governance-writes="true">Connected governance workflows — submit and approve actions use production APIs when write capabilities are enabled.</p>`;
  }
  return `<p class="ri-alert ri-alert--readonly" data-connected-readonly-governance="true">Connected read-only — enable Lab connected writes and role capabilities to submit or approve governance items.</p>`;
}

/** Pre-BUS-UAT-016: control links incorrectly used ASSURANCE_COMPLETED. Append-only — label in UI only. */
function workflowEventTypeDisplay(e) {
  const type = e?.eventType || '';
  if (
    type === 'ASSURANCE_COMPLETED' &&
    e.metadata &&
    (e.metadata.control_id || e.metadata.linkedEntityType === 'control' || e.metadata.linkProvenance)
  ) {
    return `${type} (legacy link — not assessment completed)`;
  }
  return type;
}

export function renderConnectedWorkflowEventsTable(events, emptyLabel = 'No workflow events recorded for this organisation') {
  if (!events?.length) {
    return emptyState(emptyLabel);
  }
  const rows = events.map((e) => {
    const transition =
      e.eventType === 'CHANGE_OWNER_ASSIGNED' && e.metadata
        ? `${esc(String(e.metadata.from_owner_user_id || '—').slice(0, 8))}… → ${esc(String(e.metadata.to_owner_user_id || '—').slice(0, 8))}…`
        : `${esc(e.fromStatus || '—')} → ${esc(e.toStatus || '—')}`;
    const eventLabel = workflowEventTypeDisplay(e);
    return `<tr>
      <td>${formatDateTime(e.occurredAt)}</td>
      <td class="ri-mono" title="${esc(eventLabel)}">${esc(eventLabel)}</td>
      <td>${esc(e.entityType)}</td>
      <td class="ri-mono"><span title="${esc(e.entityId)}">${esc(String(e.entityId).slice(0, 8))}…</span></td>
      <td>${transition}</td>
      <td>${esc(e.actorUserId ? `${String(e.actorUserId).slice(0, 8)}…` : '—')}</td>
    </tr>`;
  });
  return dataTable(['When', 'Event', 'Entity type', 'Entity', 'Transition', 'Actor'], rows);
}

export function renderConnectedGovernanceMetrics(metrics) {
  if (!metrics) {
    return connectedGovernanceUnavailableNote('Metrics', 'Governance metrics unavailable.');
  }
  return `<p class="ri-metrics-inline">
    <span>Open changes <strong>${metrics.changesOpen ?? 0}</strong></span>
    <span>Impact assessments in progress <strong>${metrics.impactsInProgress ?? 0}</strong></span>
    <span>Awaiting review <strong>${metrics.impactsAwaitingReview ?? 0}</strong></span>
    <span>Open findings <strong>${metrics.findingsOpen ?? 0}</strong></span>
    <span>Assurance open <strong>${metrics.assuranceOpen ?? 0}</strong></span>
    <span>Risks open <strong>${metrics.risksOpen ?? 0}</strong></span>
    <span>Controls needing test <strong>${metrics.controlsRequiringTest ?? 0}</strong></span>
    <span>Workflow events (loaded) <strong>${metrics.workflowEventCount ?? 0}</strong></span>
  </p>`;
}

export function connectedRegisterEmpty(entityLabel) {
  return emptyState(`No tenant ${entityLabel} in the connected staging register (dataScope=operational).`);
}

export function connectedAssuranceResultBadge(result) {
  const r = String(result || '').toUpperCase();
  if (r === 'PASS' || r === 'PASSED') return badge('Passed');
  if (r === 'FAIL' || r === 'FAILED') return badge('Failed');
  if (r === 'PARTIAL') return badge('Partial');
  if (r === 'OPEN' || !r) return badge('Not assessed');
  return badge(result);
}
