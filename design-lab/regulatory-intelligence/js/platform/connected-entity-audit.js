/**
 * Entity-scoped workflow audit (includes UAT provenance events excluded from operational governance feed).
 */
import { notify } from '../store.js';
import { savePersistedJson, STORAGE_KEY_V2 } from './platform-persistence.js';
import { persistableLabState } from './ask-ri-session.mjs';
import { initConnectedCatalogueState } from './connected-catalogue.js';
import { coerceInflightPromise } from './schedule-async.js';

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

export function getEntityWorkflowEventsLoadError(state, entityType, entityId) {
  const cat = state.connectedCatalogue;
  if (!cat?.entityWorkflowEventsLoadErrorByKey) return null;
  return cat.entityWorkflowEventsLoadErrorByKey[entityKey(entityType, entityId)] || null;
}

export function isEntityWorkflowEventsLoading(state, entityType, entityId) {
  const cat = state.connectedCatalogue;
  const key = entityKey(entityType, entityId);
  if (cat?._entityAuditInflight?.[key]) return true;
  return cat?.entityWorkflowEventsLoadStateByKey?.[key] === 'loading';
}

export function recordEntityWorkflowEventsLoadFailure(state, entityType, entityId, message) {
  const cat = initConnectedCatalogueState(state);
  const key = entityKey(entityType, entityId);
  cat.entityWorkflowEventsLoadStateByKey = cat.entityWorkflowEventsLoadStateByKey || {};
  cat.entityWorkflowEventsLoadErrorByKey = cat.entityWorkflowEventsLoadErrorByKey || {};
  cat.entityWorkflowEventsLoadStateByKey[key] = 'error';
  cat.entityWorkflowEventsLoadErrorByKey[key] = message || 'entity_workflow_events_failed';
  savePersistedJson(STORAGE_KEY_V2, persistableLabState(state));
  notify();
}

/**
 * @returns {Promise<unknown[]>} resolves when events are cached or freshly loaded
 */
export function scheduleConnectedEntityWorkflowEventsFetch(state, entityType, entityId) {
  const cat = initConnectedCatalogueState(state);
  const key = entityKey(entityType, entityId);
  cat.entityWorkflowEventsByKey = cat.entityWorkflowEventsByKey || {};
  cat.entityWorkflowEventsLoadStateByKey = cat.entityWorkflowEventsLoadStateByKey || {};
  const loadState = cat.entityWorkflowEventsLoadStateByKey[key];
  if (loadState === 'loaded') {
    return Promise.resolve(cat.entityWorkflowEventsByKey[key] || []);
  }
  cat._entityAuditInflight = cat._entityAuditInflight || {};
  const inflight = coerceInflightPromise(cat._entityAuditInflight[key]);
  if (inflight) return inflight;
  if (cat._entityAuditInflight[key]) delete cat._entityAuditInflight[key];
  if (loadState === 'loading') {
    delete cat.entityWorkflowEventsLoadStateByKey[key];
  }
  cat.entityWorkflowEventsLoadStateByKey[key] = 'loading';
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
  const key = entityKey(entityType, entityId);
  cat.entityWorkflowEventsLoadStateByKey = cat.entityWorkflowEventsLoadStateByKey || {};
  cat.entityWorkflowEventsLoadErrorByKey = cat.entityWorkflowEventsLoadErrorByKey || {};
  if (!res.ok || !body.ok) {
    const err = new Error(body.error || 'entity_workflow_events_failed');
    err.status = res.status;
    cat.entityWorkflowEventsLoadStateByKey[key] = 'error';
    cat.entityWorkflowEventsLoadErrorByKey[key] = err.message;
    savePersistedJson(STORAGE_KEY_V2, persistableLabState(state));
    notify();
    throw err;
  }
  cat.entityWorkflowEventsByKey = cat.entityWorkflowEventsByKey || {};
  cat.entityWorkflowEventsByKey[key] = Array.isArray(body.events) ? body.events : [];
  cat.entityWorkflowEventsLoadStateByKey[key] = 'loaded';
  delete cat.entityWorkflowEventsLoadErrorByKey[key];
  savePersistedJson(STORAGE_KEY_V2, persistableLabState(state));
  notify();
  return cat.entityWorkflowEventsByKey[key];
}

/** After a local write, refetch entity audit for the given record. */
export async function refreshConnectedEntityWorkflowEvents(state, entityType, entityId) {
  const cat = initConnectedCatalogueState(state);
  const key = entityKey(entityType, entityId);
  if (cat.entityWorkflowEventsByKey) delete cat.entityWorkflowEventsByKey[key];
  if (cat.entityWorkflowEventsLoadStateByKey) delete cat.entityWorkflowEventsLoadStateByKey[key];
  if (cat.entityWorkflowEventsLoadErrorByKey) delete cat.entityWorkflowEventsLoadErrorByKey[key];
  return fetchConnectedEntityWorkflowEvents(state, entityType, entityId);
}
