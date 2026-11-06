/**
 * Entity-scoped workflow audit (includes UAT provenance events excluded from operational governance feed).
 */
import { notify } from '../store.js';
import { savePersistedJson, STORAGE_KEY_V2 } from './platform-persistence.js';
import { persistableLabState } from './ask-ri-session.mjs';
import { initConnectedCatalogueState } from './connected-catalogue.js';

function apiBase(state) {
  return (state.platformConfig?.apiBaseUrl || '/api/ri-lab').replace(/\/$/, '');
}

function entityKey(entityType, entityId) {
  return `${entityType}:${entityId}`;
}

export function getConnectedEntityWorkflowEvents(state, entityType, entityId) {
  const cat = state.connectedCatalogue;
  if (!cat?.entityWorkflowEventsByKey) return [];
  return cat.entityWorkflowEventsByKey[entityKey(entityType, entityId)] || [];
}

/**
 * @returns {Promise<unknown[]>|null} null when cached or in flight
 */
export function scheduleConnectedEntityWorkflowEventsFetch(state, entityType, entityId) {
  const cat = initConnectedCatalogueState(state);
  const key = entityKey(entityType, entityId);
  cat.entityWorkflowEventsByKey = cat.entityWorkflowEventsByKey || {};
  if (cat.entityWorkflowEventsByKey[key]) return null;
  cat._entityAuditInflight = cat._entityAuditInflight || {};
  if (cat._entityAuditInflight[key]) return cat._entityAuditInflight[key];
  cat._entityAuditInflight[key] = fetchConnectedEntityWorkflowEvents(state, entityType, entityId).finally(
    () => {
      delete cat._entityAuditInflight[key];
    },
  );
  return cat._entityAuditInflight[key];
}

export async function fetchConnectedEntityWorkflowEvents(state, entityType, entityId) {
  const cat = initConnectedCatalogueState(state);
  const base = apiBase(state);
  const params = new URLSearchParams({
    entityType,
    entityId,
    limit: '50',
  });
  const res = await fetch(`${base}/workflow-events?${params}`, {
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) {
    const err = new Error(body.error || 'entity_workflow_events_failed');
    err.status = res.status;
    throw err;
  }
  const key = entityKey(entityType, entityId);
  cat.entityWorkflowEventsByKey = cat.entityWorkflowEventsByKey || {};
  cat.entityWorkflowEventsByKey[key] = Array.isArray(body.events) ? body.events : [];
  savePersistedJson(STORAGE_KEY_V2, persistableLabState(state));
  notify();
  return cat.entityWorkflowEventsByKey[key];
}

/** After a local write, refetch entity audit for the given record. */
export async function refreshConnectedEntityWorkflowEvents(state, entityType, entityId) {
  const cat = initConnectedCatalogueState(state);
  const key = entityKey(entityType, entityId);
  if (cat.entityWorkflowEventsByKey) delete cat.entityWorkflowEventsByKey[key];
  return fetchConnectedEntityWorkflowEvents(state, entityType, entityId);
}
