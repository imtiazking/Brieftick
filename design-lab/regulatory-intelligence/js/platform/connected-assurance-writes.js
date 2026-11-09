/**
 * Connected assurance create + PATCH (outcome / notes).
 */
import { notify } from '../store.js';
import {
  initConnectedCatalogueState,
  mergeAssuranceCatalogueRow,
  fetchConnectedAssuranceDetail,
} from './connected-catalogue.js';
import { savePersistedJson, STORAGE_KEY_V2 } from './platform-persistence.js';
import { persistableLabState } from './ask-ri-session.mjs';
import { refreshConnectedEntityWorkflowEvents } from './connected-entity-audit.js';
import { isConnectedAssuranceWritesEnabled } from './connected-mode.js';
import { formatConnectedPatchError } from './connected-work-writes.js';

function apiBase(state) {
  return (state.platformConfig?.apiBaseUrl || '/api/ri-lab').replace(/\/$/, '');
}

export async function createConnectedAssuranceReview(state, payload) {
  if (!isConnectedAssuranceWritesEnabled(state)) throw new Error('connected_writes_disabled');
  const base = apiBase(state);
  const res = await fetch(`${base}/assurance-reviews`, {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      review_type: payload.review_type,
      result: payload.result,
      notes: payload.notes || null,
      creationMode: payload.creationMode,
      ...(payload.controlId ? { controlId: payload.controlId } : {}),
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) {
    throw new Error(formatConnectedPatchError(body, body.error || 'assurance_create_failed'));
  }
  const cat = initConnectedCatalogueState(state);
  if (body.assuranceReview) mergeAssuranceCatalogueRow(cat, { ...body.assuranceReview, _connected: true });
  try {
    await fetchConnectedAssuranceDetail(state, body.assuranceReview.id);
  } catch {
    /* create must not fail when detail refresh fails */
  }
  savePersistedJson(STORAGE_KEY_V2, persistableLabState(state));
  notify();
  return body;
}

export async function patchConnectedAssuranceReview(state, assuranceId, fields) {
  if (!isConnectedAssuranceWritesEnabled(state)) throw new Error('connected_writes_disabled');
  const base = apiBase(state);
  const sessionRes = await fetch(`${base}/session`, {
    method: 'GET',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });
  const sessionBody = await sessionRes.json().catch(() => ({}));
  if (!sessionRes.ok || sessionBody?.ok !== true) {
    throw new Error(formatConnectedPatchError(sessionBody, 'Session not available — sign in and retry'));
  }
  const res = await fetch(`${base}/assurance-reviews/${encodeURIComponent(assuranceId)}`, {
    method: 'PATCH',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) {
    throw new Error(formatConnectedPatchError(body, body.error || 'assurance_update_failed'));
  }
  const cat = initConnectedCatalogueState(state);
  if (body.assuranceReview) mergeAssuranceCatalogueRow(cat, { ...body.assuranceReview, _connected: true });
  try {
    await fetchConnectedAssuranceDetail(state, assuranceId);
  } catch {
    /* PATCH must not fail when detail refresh fails */
  }
  try {
    await refreshConnectedEntityWorkflowEvents(state, 'assurance_review', assuranceId);
  } catch {
    /* audit refresh optional */
  }
  savePersistedJson(STORAGE_KEY_V2, persistableLabState(state));
  notify();
  return body;
}
