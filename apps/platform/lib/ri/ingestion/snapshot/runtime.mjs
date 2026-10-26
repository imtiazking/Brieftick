/**
 * Snapshot storage runtime — re-exports resolve-storage (Supabase + memory).
 * @deprecated Import from ./resolve-storage.mjs directly.
 */
export {
  ensureSnapshotStorageReady,
  getSnapshotStorage,
  setSnapshotStorage,
  resetSnapshotStorage,
  hasExplicitStorageOverride,
} from './resolve-storage.mjs';
