import { createFreshState, migratePersistedState, STORAGE_KEY_V2, STORAGE_KEY_V1 } from '../js/migrate.js';

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => mem.get(k) ?? null,
  setItem: (k, v) => mem.set(k, v),
  removeItem: (k) => mem.delete(k),
};

// Fresh v2
mem.delete(STORAGE_KEY_V2);
const fresh = migratePersistedState();
if (!fresh.changes?.some((c) => c.id === 'CHG-001') || fresh.schemaVersion !== 16) {
  console.error('Fresh v16 FAIL', fresh.schemaVersion);
  process.exit(1);
}

// v1 migration stub
mem.delete(STORAGE_KEY_V2);
mem.set(STORAGE_KEY_V1, JSON.stringify({ publications: fresh.publications, scenarioId: 'consumer-duty' }));
const migrated = migratePersistedState();
if (!mem.get(STORAGE_KEY_V2) || !migrated.changes?.length) {
  console.error('v1 migration FAIL');
  process.exit(1);
}

console.log('Migration OK — changes:', migrated.changes.length);
