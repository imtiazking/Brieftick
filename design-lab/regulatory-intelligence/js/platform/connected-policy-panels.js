/**
 * Connected policy register writes.
 */
import { notify } from '../store.js';
import { savePersistedJson, STORAGE_KEY_V2 } from './platform-persistence.js';
import { persistableLabState } from './ask-ri-session.mjs';
import { initConnectedCatalogueState, mergeFindingCatalogueRow } from './connected-catalogue.js';
import { isConnectedFindingWritesEnabled, isConnectedPolicyWritesEnabled } from './connected-mode.js';

function apiBase(state) {
  return (state.platformConfig?.apiBaseUrl || '/api/ri-lab').replace(/\/$/, '');
}

function mergePolicy(cat, policy) {
  if (!policy?.id) return;
  const idx = (cat.policies || []).findIndex((p) => p.id === policy.id);
  if (idx >= 0) cat.policies[idx] = { ...cat.policies[idx], ...policy, _connected: true };
  else {
    cat.policies = cat.policies || [];
    cat.policies.unshift({ ...policy, _connected: true });
  }
}

export async function createConnectedPolicy(state, fields) {
  if (!isConnectedPolicyWritesEnabled(state)) throw new Error('connected_writes_disabled');
  const base = apiBase(state);
  const res = await fetch(`${base}/policies`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) throw new Error(body.error || 'policy_create_failed');
  const cat = initConnectedCatalogueState(state);
  mergePolicy(cat, body.policy);
  notify();
  return body;
}

export async function patchConnectedPolicy(state, policyId, fields) {
  if (!isConnectedPolicyWritesEnabled(state)) throw new Error('connected_writes_disabled');
  const base = apiBase(state);
  const res = await fetch(`${base}/policies/${encodeURIComponent(policyId)}`, {
    method: 'PATCH',
    credentials: 'same-origin',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) throw new Error(body.error || 'policy_update_failed');
  const cat = initConnectedCatalogueState(state);
  mergePolicy(cat, body.policy);
  notify();
  return body;
}

export function renderConnectedPolicyCreatePanel() {
  return `<section class="ri-panel" data-connected-policy-create="true">
    <h3>Create policy (connected)</h3>
    <div class="ri-form ri-form--inline">
      <label>Name <input data-connected-policy-name type="text" placeholder="Policy name" /></label>
      <label>Version <input data-connected-policy-version type="text" value="1.0" /></label>
      <button type="button" class="ri-btn ri-btn--primary" data-connected-policy-submit>Create policy</button>
    </div>
  </section>`;
}

export function renderConnectedPolicyEditPanel(policy) {
  if (!policy?.id) return '';
  return `<section class="ri-panel" data-connected-policy-edit="${policy.id}">
    <h3>Edit policy</h3>
    <div class="ri-form ri-form--inline">
      <label>Name <input data-connected-policy-edit-name type="text" value="${policy.name || ''}" /></label>
      <label>Status <input data-connected-policy-edit-status type="text" value="${policy.status || 'DRAFT'}" /></label>
      <label>Next review <input data-connected-policy-edit-review type="date" value="${(policy.nextReviewDate || '').slice(0, 10)}" /></label>
      <button type="button" class="ri-btn ri-btn--primary" data-connected-policy-save>Save</button>
    </div>
  </section>`;
}

export async function createConnectedFinding(state, fields) {
  if (!isConnectedFindingWritesEnabled(state)) throw new Error('connected_writes_disabled');
  const base = apiBase(state);
  const res = await fetch(`${base}/findings`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) throw new Error(body.error || 'finding_create_failed');
  const cat = initConnectedCatalogueState(state);
  mergeFindingCatalogueRow(cat, { ...body.finding, _connected: true });
  savePersistedJson(STORAGE_KEY_V2, persistableLabState(state));
  notify();
  return body;
}
