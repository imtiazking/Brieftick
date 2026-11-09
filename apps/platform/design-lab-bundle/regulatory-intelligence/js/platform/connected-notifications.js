/**
 * Connected Attention Centre — tenant notifications API.
 */
import { notify } from '../store.js';
import { initConnectedCatalogueState } from './connected-catalogue.js';
import { buildNotificationsQueryString, defaultAttentionCentreQuery } from './notification-attention.js';

function apiBase(state) {
  return (state.platformConfig?.apiBaseUrl || '/api/ri-lab').replace(/\/$/, '');
}

function formatNotificationLoadError(body, qs) {
  if (!body || typeof body !== 'object') {
    return qs.includes('q=') ? 'Unable to search notifications. Please try again.' : 'notifications_load_failed';
  }
  if (body.error === 'notification_search_failed') {
    return body.message || 'Unable to search notifications. Please try again.';
  }
  if (body.error === 'unauthorized') return 'Session expired — refresh and sign in again.';
  if (body.error === 'forbidden') return 'Insufficient permission to view notifications.';
  if (qs.includes('q=') && (body.error === 'internal_error' || !body.ok)) {
    return 'Unable to search notifications. Please try again.';
  }
  return body.message || body.error || 'notifications_load_failed';
}

export async function loadConnectedNotifications(state, query = null) {
  const base = apiBase(state);
  const qs = buildNotificationsQueryString(query || state.attentionCentreQuery || defaultAttentionCentreQuery());
  const res = await fetch(`${base}/notifications${qs}`, {
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) {
  const err = new Error(formatNotificationLoadError(body, qs));
    err.code = body?.error;
    throw err;
  }
  const cat = initConnectedCatalogueState(state);
  cat.notifications = body.notifications || [];
  cat.notificationsUnreadCount = body.unreadCount ?? 0;
  cat.notificationsMeta = {
    filteredCount: body.filteredCount ?? (body.notifications || []).length,
    totalMatching: body.totalMatching ?? (body.notifications || []).length,
    query: body.query || null,
  };
  cat.notificationsNote = body.externalDeliveryDisabled
    ? 'In-app notifications only — external email/SMS disabled.'
    : null;
  notify();
  return body;
}

export async function markConnectedNotificationRead(state, notificationId) {
  const base = apiBase(state);
  const res = await fetch(`${base}/notifications`, {
    method: 'PATCH',
    credentials: 'same-origin',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'mark_read', notificationId }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) throw new Error(body.error || 'mark_read_failed');
  await loadConnectedNotifications(state);
  return body;
}

export function getConnectedNotifications(state) {
  const cat = state.connectedCatalogue || {};
  return cat.notifications || [];
}

export function getConnectedNotificationsUnreadCount(state) {
  const cat = state.connectedCatalogue || {};
  return cat.notificationsUnreadCount ?? 0;
}

export async function loadConnectedDashboardMetrics(state) {
  const base = apiBase(state);
  const res = await fetch(`${base}/dashboard?dataScope=operational`, {
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) throw new Error(body.error || 'dashboard_load_failed');
  const cat = initConnectedCatalogueState(state);
  cat.dashboardMetrics = body;
  notify();
  return body;
}

export function getConnectedDashboardMetrics(state) {
  return state.connectedCatalogue?.dashboardMetrics || null;
}
