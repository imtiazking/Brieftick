/**
 * Connected dashboard / work queue data from tenant-work API.
 */
import { getState } from '../store.js';
import { esc, badge, formatDate } from '../components.js';

function apiBase(state) {
  return (state.platformConfig?.apiBaseUrl || '/api/ri-lab').replace(/\/$/, '');
}

export async function fetchConnectedTenantWork(state = getState()) {
  const base = apiBase(state);
  const res = await fetch(`${base}/tenant-work`, {
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) throw new Error(body.error || 'tenant_work_unavailable');
  return body;
}

export function renderConnectedDashboardMyWork(body, userId) {
  const changes = (body.changes || []).filter(
    (c) => c.ownerUserId === userId || c.ownerId === userId,
  );
  const impacts = (body.impactAssessments || []).filter(
    (a) => a.ownerUserId === userId || a.ownerId === userId,
  );
  const items = [
    ...changes.slice(0, 5).map((c) => ({
      href: `#/change/${c.id}`,
      label: `Change · ${esc(c.title || c.id)}`,
      status: c.status,
    })),
    ...impacts.slice(0, 5).map((a) => ({
      href: `#/assessment/${a.id}`,
      label: `Impact · ${esc(a.title || a.id)}`,
      status: a.status,
    })),
  ].slice(0, 8);
  if (!items.length) {
    return '<p class="ri-muted">No tenant work items owned by the signed-in user in connected registers.</p>';
  }
  return `<ul class="ri-list-compact">${items
    .map((i) => `<li><a href="${i.href}">${i.label}</a> ${badge(i.status)}</li>`)
    .join('')}</ul>`;
}

export function renderConnectedDashboardWorkLoadPlaceholder() {
  return `<div data-connected-dashboard-work-load class="ri-muted">Loading tenant work…</div>`;
}
