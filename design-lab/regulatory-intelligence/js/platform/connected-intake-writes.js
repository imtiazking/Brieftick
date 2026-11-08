/**
 * Connected intake triage mutations.
 */
import { notify, getState } from '../store.js';
import { initConnectedCatalogueState } from './connected-catalogue.js';
import { isConnectedChangeWritesEnabled } from './connected-mode.js';

function apiBase(state) {
  return (state.platformConfig?.apiBaseUrl || '/api/ri-lab').replace(/\/$/, '');
}

function mergePublication(cat, labPublication, detail) {
  if (!labPublication?.id) return;
  cat.detailsById = cat.detailsById || {};
  cat.detailsById[labPublication.id] = detail;
  const idx = (cat.publications || []).findIndex((p) => p.id === labPublication.id);
  if (idx >= 0) {
    cat.publications[idx] = { ...cat.publications[idx], ...labPublication, display: labPublication.display };
  }
}

export async function patchConnectedIntakeTriage(state, publicationId, payload) {
  if (!isConnectedChangeWritesEnabled(state)) {
    throw new Error('connected_writes_disabled');
  }
  const base = apiBase(state);
  const res = await fetch(`${base}/publications/${encodeURIComponent(publicationId)}/triage`, {
    method: 'PATCH',
    credentials: 'same-origin',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) throw new Error(body.error || 'triage_failed');
  const cat = initConnectedCatalogueState(state);
  if (body.labPublication) mergePublication(cat, body.labPublication, body.detail);
  notify();
  return body;
}

export function connectedIntakeTriageEnabled(state = getState()) {
  const caps = state.platformConfig?.backendSession?.writeCapabilities || {};
  return Boolean(caps.triage);
}
