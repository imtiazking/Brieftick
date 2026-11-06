/**
 * Design Lab adapter — delegates to in-browser store/state (local persistence).
 */
import { getState, subscribe as storeSubscribe } from '../store.js';
import { loadPersistedJson, savePersistedJson, STORAGE_KEY_V2 } from '../platform/platform-persistence.js';
import { normalizePlatformConfig } from '../platform/platform-config.js';
import { getTenantContext, assertTenantAccess } from '../platform/platform-tenant.js';
import { assertPermission } from '../platform/platform-permissions.js';
import { beginCorrelation } from '../platform/platform-correlation.js';

export class LocalPlatformAdapter {
  constructor() {
    this.mode = 'local';
    this.active = true;
  }

  getConfig() {
    const s = getState();
    return normalizePlatformConfig(s.platformConfig);
  }

  getTenantContext() {
    return getTenantContext(getState());
  }

  loadStateSnapshot() {
    return loadPersistedJson(STORAGE_KEY_V2);
  }

  persistStateSnapshot(state) {
    savePersistedJson(STORAGE_KEY_V2, state);
  }

  subscribe(fn) {
    return storeSubscribe(fn);
  }

  // —— Queries ——
  getPublication(id) {
    const s = getState();
    const p = s.publications?.find((x) => x.id === id);
    const access = assertTenantAccess(s, p);
    return access.ok ? access.entity : null;
  }

  getChange(id) {
    const s = getState();
    const ch = s.changes?.find((x) => x.id === id);
    const access = assertTenantAccess(s, ch);
    return access.ok ? access.entity : null;
  }

  getAssessment(id) {
    const s = getState();
    const a = s.assessments?.find((x) => x.id === id);
    const access = assertTenantAccess(s, a);
    return access.ok ? access.entity : null;
  }

  getIsolationTestChange(id) {
    const s = getState();
    const rec = (s.tenantIsolationFixtures || []).find((x) => x.id === id);
    if (!rec) return null;
    const access = assertTenantAccess(s, rec);
    return access.ok ? rec : null;
  }

  listChanges() {
    const s = getState();
    const tid = getTenantContext(s).tenantId;
    return (s.changes || []).filter((c) => (c.tenantId || 'TEN-DEMO-001') === tid);
  }

  // —— Commands (validation layer; execution via store exports) ——
  authorize(permission, resource = null) {
    return assertPermission(getState(), permission, resource);
  }

  startCommand(correlationPrefix) {
    return beginCorrelation(correlationPrefix || 'CMD');
  }

  checkOptimisticVersion(entity, expectedVersion) {
    if (expectedVersion == null) return { ok: true };
    const current = entity?.rowVersion ?? 0;
    if (current !== expectedVersion) {
      return {
        ok: false,
        code: 'STALE_VERSION',
        message: 'Record was updated by another user. Refresh and retry.',
        status: 409,
      };
    }
    return { ok: true };
  }
}

let singleton = null;

export function getLocalPlatformAdapter() {
  if (!singleton) singleton = new LocalPlatformAdapter();
  return singleton;
}
