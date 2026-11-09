/**
 * Attention Centre search and filters (connected: server-side query params; demo: client filter).
 */
import { getState } from '../store.js';

export function defaultAttentionCentreQuery() {
  return {
    q: '',
    type: 'all',
    status: 'all',
    severity: 'all',
    from: '',
    to: '',
    sort: 'newest',
  };
}

export function getAttentionCentreQuery(state = getState()) {
  return { ...defaultAttentionCentreQuery(), ...(state.attentionCentreQuery || {}) };
}

export function setAttentionCentreQuery(patch, state = getState()) {
  state.attentionCentreQuery = { ...getAttentionCentreQuery(state), ...patch };
}

export function clearAttentionCentreQuery(state = getState()) {
  state.attentionCentreQuery = defaultAttentionCentreQuery();
}

export function attentionFiltersActive(query = getAttentionCentreQuery()) {
  return Boolean(
    query.q?.trim() ||
      (query.type && query.type !== 'all') ||
      (query.status && query.status !== 'all') ||
      (query.severity && query.severity !== 'all') ||
      query.from ||
      query.to ||
      query.sort === 'oldest',
  );
}

export function buildNotificationsQueryString(query = getAttentionCentreQuery()) {
  const params = new URLSearchParams();
  const q = query.q?.trim();
  if (q) params.set('q', q);
  if (query.type && query.type !== 'all') params.set('type', query.type);
  if (query.status && query.status !== 'all') params.set('status', query.status);
  if (query.severity && query.severity !== 'all') params.set('severity', query.severity);
  if (query.from) params.set('from', query.from);
  if (query.to) params.set('to', query.to);
  if (query.sort === 'oldest') params.set('sort', 'oldest');
  params.set('limit', '100');
  const s = params.toString();
  return s ? `?${s}` : '';
}

function norm(s) {
  return String(s ?? '')
    .trim()
    .toLowerCase();
}

export function filterNotificationsClient(notifications, query = getAttentionCentreQuery()) {
  let rows = Array.isArray(notifications) ? [...notifications] : [];
  const needle = norm(query.q);
  if (needle) {
    rows = rows.filter((n) => {
      const hay = [n.message, n.title, n.type, n.entityType, n.entityId, n.id].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(needle);
    });
  }
  if (query.type && query.type !== 'all') {
    const typeKey = query.type.replace(/_/g, ' ');
    rows = rows.filter((n) => {
      const t = norm(n.type);
      return t.includes(typeKey) || norm(n.type).replace(/\s+/g, '_') === query.type;
    });
  }
  if (query.severity && query.severity !== 'all') {
    rows = rows.filter((n) => norm(n.severity) === norm(query.severity));
  }
  if (query.status === 'unread') rows = rows.filter((n) => !n.read);
  if (query.status === 'read') rows = rows.filter((n) => n.read);
  if (query.from) {
    const from = `${query.from}T00:00:00.000Z`;
    rows = rows.filter((n) => String(n.at) >= from);
  }
  if (query.to) {
    const to = `${query.to}T23:59:59.999Z`;
    rows = rows.filter((n) => String(n.at) <= to);
  }
  rows.sort((a, b) => {
    const cmp = String(a.at).localeCompare(String(b.at));
    return query.sort === 'oldest' ? cmp : -cmp;
  });
  return { notifications: rows, totalMatching: rows.length };
}

export function renderAttentionCentreControls(query, meta = {}) {
  const q = query || defaultAttentionCentreQuery();
  const total = meta.totalMatching;
  const countLabel =
    total != null ? `<p class="ri-muted" data-attention-match-count>${total} matching notification(s)</p>` : '';
  return `<section class="ri-panel" data-attention-centre-filters>
    <label class="ri-field ri-field--search">
      <span class="ri-sr-only">Search notifications</span>
      <input type="search" class="ri-search-full" data-attention-search placeholder="Search notifications by keyword, message or reference ID..." value="${escapeAttr(q.q)}" autocomplete="off" />
    </label>
  <div class="ri-filter-bar">
    <label>Type
      <select class="ri-select" data-attention-type>
        <option value="all" ${q.type === 'all' ? 'selected' : ''}>All types</option>
        <option value="approval_request" ${q.type === 'approval_request' ? 'selected' : ''}>Approval request</option>
        <option value="ai_review" ${q.type === 'ai_review' ? 'selected' : ''}>AI review</option>
        <option value="triage" ${q.type === 'triage' ? 'selected' : ''}>Triage</option>
        <option value="assignment" ${q.type === 'assignment' ? 'selected' : ''}>Assignment</option>
        <option value="deadline" ${q.type === 'deadline' ? 'selected' : ''}>Deadline</option>
        <option value="workflow" ${q.type === 'workflow' ? 'selected' : ''}>Workflow</option>
        <option value="operational" ${q.type === 'operational' ? 'selected' : ''}>Operational</option>
      </select>
    </label>
    <label>Status
      <select class="ri-select" data-attention-status>
        <option value="all" ${q.status === 'all' ? 'selected' : ''}>All statuses</option>
        <option value="unread" ${q.status === 'unread' ? 'selected' : ''}>Unread</option>
        <option value="read" ${q.status === 'read' ? 'selected' : ''}>Read</option>
      </select>
    </label>
    <label>Severity
      <select class="ri-select" data-attention-severity>
        <option value="all" ${q.severity === 'all' ? 'selected' : ''}>All severities</option>
        <option value="low" ${q.severity === 'low' ? 'selected' : ''}>Low</option>
        <option value="medium" ${q.severity === 'medium' ? 'selected' : ''}>Medium</option>
        <option value="high" ${q.severity === 'high' ? 'selected' : ''}>High</option>
        <option value="critical" ${q.severity === 'critical' ? 'selected' : ''}>Critical</option>
      </select>
    </label>
    <label>From
      <input type="date" class="ri-select" data-attention-from value="${escapeAttr(q.from)}" />
    </label>
    <label>To
      <input type="date" class="ri-select" data-attention-to value="${escapeAttr(q.to)}" />
    </label>
    <label>Sort
      <select class="ri-select" data-attention-sort>
        <option value="newest" ${q.sort !== 'oldest' ? 'selected' : ''}>Newest first</option>
        <option value="oldest" ${q.sort === 'oldest' ? 'selected' : ''}>Oldest first</option>
      </select>
    </label>
    <button type="button" class="ri-btn ri-btn--ghost" data-attention-clear>Clear filters</button>
    <button type="button" class="ri-btn ri-btn--primary" data-attention-apply>Apply</button>
  </div>
  ${countLabel}
  </section>`;
}

function escapeAttr(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');
}

export function readAttentionCentreQueryFromDom() {
  const panel = document.querySelector('[data-attention-centre-filters]');
  if (!panel) return defaultAttentionCentreQuery();
  return {
    q: panel.querySelector('[data-attention-search]')?.value ?? '',
    type: panel.querySelector('[data-attention-type]')?.value ?? 'all',
    status: panel.querySelector('[data-attention-status]')?.value ?? 'all',
    severity: panel.querySelector('[data-attention-severity]')?.value ?? 'all',
    from: panel.querySelector('[data-attention-from]')?.value ?? '',
    to: panel.querySelector('[data-attention-to]')?.value ?? '',
    sort: panel.querySelector('[data-attention-sort]')?.value ?? 'newest',
  };
}
