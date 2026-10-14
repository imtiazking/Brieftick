import { APP_ERRORS, appError } from './app-errors.js';
import { getTenantContext } from './platform-tenant.js';

export function requireEntity(state, collectionName, id, label = collectionName) {
  const list = state[collectionName];
  if (!Array.isArray(list)) return appError(APP_ERRORS.DATA_INTEGRITY_ERROR, `${label} store unavailable`);
  const row = list.find((x) => x.id === id);
  if (!row) return appError(APP_ERRORS.NOT_FOUND, `${label} not found`);
  return { ok: true, entity: row };
}

export function assertTenantScope(entity, state, label = 'Record') {
  const tid = getTenantContext(state).tenantId;
  if (!entity) return appError(APP_ERRORS.NOT_FOUND, `${label} not found`);
  if (entity.tenantId && entity.tenantId !== tid) {
    return appError(APP_ERRORS.FORBIDDEN, `${label} is not available in this tenant`);
  }
  return { ok: true };
}

export function assertRelatedExists(state, checks) {
  for (const { collection, id, label } of checks) {
    const r = requireEntity(state, collection, id, label);
    if (!r.ok) return r;
  }
  return { ok: true };
}

export function detectDuplicateIds(state, collectionName) {
  const list = state[collectionName] || [];
  const seen = new Set();
  const dups = [];
  list.forEach((row) => {
    if (!row?.id) return;
    if (seen.has(row.id)) dups.push(row.id);
    seen.add(row.id);
  });
  return dups;
}
