/**
 * Connected change management mutations (Step 83E.1 / 83E.1A).
 */
import { notify } from '../store.js';
import { savePersistedJson, STORAGE_KEY_V2 } from './platform-persistence.js';
import { persistableLabState } from './ask-ri-session.mjs';
import { initConnectedCatalogueState } from './connected-catalogue.js';

function apiBase(state) {
  return (state.platformConfig?.apiBaseUrl || '/api/ri-lab').replace(/\/$/, '');
}

function bucketForChange(cat, change) {
  const cls = change.labClassification || change.lab_classification;
  if (cls === 'uat_authorised') return cat.authorisedUatChanges;
  if (cls === 'operational') return cat.changes;
  if (cls === 'synthetic_uat') return null;
  if (!cat.unverifiedAuditChanges) cat.unverifiedAuditChanges = [];
  return cat.unverifiedAuditChanges;
}

function mergeChangeIntoCatalogue(cat, change) {
  if (!change?.id) return;
  const merged = { ...change, _connected: true };
  cat.changeDetailsById[change.id] = { ...cat.changeDetailsById[change.id], ...merged };
  const bucket = bucketForChange(cat, merged);
  if (!bucket) return;
  const idx = bucket.findIndex((c) => c.id === change.id);
  if (idx >= 0) bucket[idx] = { ...bucket[idx], ...merged };
  else bucket.unshift(merged);
  cat.tenantWorkCounts = {
    ...(cat.tenantWorkCounts || {}),
    changes: cat.changes.length,
  };
}

async function refreshConnectedWorkflowEvents(state) {
  const base = apiBase(state);
  const res = await fetch(`${base}/tenant-governance`, {
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) return;
  const cat = initConnectedCatalogueState(state);
  cat.workflowEvents = Array.isArray(body.workflowEvents) ? body.workflowEvents : cat.workflowEvents;
  if (cat.tenantGovernanceCounts) {
    cat.tenantGovernanceCounts.workflowEvents =
      body.workflowEventCount ?? cat.workflowEvents.length;
  }
}

export async function patchConnectedChange(state, changeId, patch) {
  const payload = { expectedUpdatedAt: patch.expectedUpdatedAt ?? null };
  if (patch.status) payload.status = patch.status;
  if (patch.ownerUserId) payload.ownerUserId = patch.ownerUserId;
  if (patch.materiality !== undefined) payload.materiality = patch.materiality;
  if (patch.implementationDeadline !== undefined) payload.implementationDeadline = patch.implementationDeadline;
  if (patch.changeType) payload.changeType = patch.changeType;

  const base = apiBase(state);
  const res = await fetch(`${base}/changes/${encodeURIComponent(changeId)}`, {
    method: 'PATCH',
    credentials: 'same-origin',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) {
    const err = new Error(body.error || 'change_update_failed');
    err.status = res.status;
    err.detail = body.detail;
    throw err;
  }
  const cat = initConnectedCatalogueState(state);
  if (body.change) mergeChangeIntoCatalogue(cat, body.change);
  await refreshConnectedWorkflowEvents(state);
  savePersistedJson(STORAGE_KEY_V2, persistableLabState(state));
  notify();
  return body.change;
}

/** @deprecated use patchConnectedChange */
export async function patchConnectedChangeStatus(state, changeId, { status, expectedUpdatedAt }) {
  return patchConnectedChange(state, changeId, { status, expectedUpdatedAt });
}

export async function createConnectedRegulatoryChange(state, payload) {
  const base = apiBase(state);
  const res = await fetch(`${base}/changes`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) {
    const err = new Error(body.error || 'change_create_failed');
    err.status = res.status;
    err.detail = body.detail;
    throw err;
  }
  const cat = initConnectedCatalogueState(state);
  if (body.change) mergeChangeIntoCatalogue(cat, body.change);
  await refreshConnectedWorkflowEvents(state);
  savePersistedJson(STORAGE_KEY_V2, persistableLabState(state));
  notify();
  return body.change;
}
