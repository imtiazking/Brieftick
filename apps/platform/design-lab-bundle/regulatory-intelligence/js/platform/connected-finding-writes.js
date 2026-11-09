/**
 * Connected finding PATCH (status, remediation lifecycle).
 */
import { notify } from '../store.js';
import { initConnectedCatalogueState, mergeFindingCatalogueRow, fetchConnectedFindingDetail } from './connected-catalogue.js';
import { savePersistedJson, STORAGE_KEY_V2 } from './platform-persistence.js';
import { persistableLabState } from './ask-ri-session.mjs';
import { refreshConnectedEntityWorkflowEvents } from './connected-entity-audit.js';
import { isConnectedFindingWritesEnabled } from './connected-mode.js';

function apiBase(state) {
  return (state.platformConfig?.apiBaseUrl || '/api/ri-lab').replace(/\/$/, '');
}

export async function patchConnectedFinding(state, findingId, fields) {
  if (!isConnectedFindingWritesEnabled(state)) throw new Error('connected_writes_disabled');
  const base = apiBase(state);
  const res = await fetch(`${base}/findings/${encodeURIComponent(findingId)}`, {
    method: 'PATCH',
    credentials: 'same-origin',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) throw new Error(body.error || 'finding_update_failed');
  const cat = initConnectedCatalogueState(state);
  if (body.finding) mergeFindingCatalogueRow(cat, { ...body.finding, _connected: true });
  try {
    await fetchConnectedFindingDetail(state, findingId);
  } catch {
    /* detail refresh must not fail PATCH */
  }
  try {
    await refreshConnectedEntityWorkflowEvents(state, 'finding', findingId);
  } catch {
    /* audit refresh optional */
  }
  savePersistedJson(STORAGE_KEY_V2, persistableLabState(state));
  notify();
  return body;
}
