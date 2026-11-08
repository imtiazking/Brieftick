/**
 * Connected audit trail — paginated workflow_events from ri-lab API.
 */
import { getState } from '../store.js';
import { esc, badge, dataTable, formatDateTime, emptyState } from '../components.js';

function apiBase(state) {
  return (state.platformConfig?.apiBaseUrl || '/api/ri-lab').replace(/\/$/, '');
}

export async function fetchConnectedWorkflowEvents(state = getState(), query = {}) {
  const base = apiBase(state);
  const params = new URLSearchParams();
  params.set('limit', String(query.limit ?? 200));
  if (query.entityType) params.set('entityType', query.entityType);
  if (query.entityId) params.set('entityId', query.entityId);
  const res = await fetch(`${base}/workflow-events?${params}`, {
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) throw new Error(body.error || 'workflow_events_unavailable');
  return body;
}

export function renderConnectedWorkflowEventsApiTable(events, emptyLabel) {
  if (!events?.length) return emptyState(emptyLabel);
  const rows = events.map((e) => {
    const transition = `${esc(e.fromStatus || '—')} → ${esc(e.toStatus || '—')}`;
    return `<tr>
      <td>${formatDateTime(e.occurredAt || e.occurred_at)}</td>
      <td class="ri-mono">${esc(String(e.actorUserId || e.actor_user_id || '—').slice(0, 12))}…</td>
      <td>${esc(e.eventType || e.event_type)}</td>
      <td>${esc(e.entityType || e.entity_type)}</td>
      <td class="ri-mono">${esc(String(e.entityId || e.entity_id || '').slice(0, 8))}…</td>
      <td>${transition}</td>
    </tr>`;
  });
  return dataTable(['When', 'Actor', 'Event', 'Entity type', 'Entity', 'Transition'], rows);
}

export function renderConnectedAuditLoadPanel() {
  return `<div data-connected-audit-load class="ri-muted">Loading workflow audit events…</div>`;
}
