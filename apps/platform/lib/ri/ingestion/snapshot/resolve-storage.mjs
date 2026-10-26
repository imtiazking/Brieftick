import { createClient } from '@supabase/supabase-js';
import { createSupabaseSnapshotStorage } from './supabase-storage.mjs';
import { assertSnapshotBucketReady, validateSupabaseSnapshotConfig } from './supabase-config.mjs';
import { createMemorySnapshotStorage } from './memory-storage.mjs';

let storage = null;
let explicitOverride = false;

export function hasExplicitStorageOverride() {
  return explicitOverride;
}

/**
 * @param {object} impl
 * @param {{ override?: boolean }} [opts] override=true for tests injecting memory/fakes
 */
export function setSnapshotStorage(impl, opts = {}) {
  storage = impl;
  explicitOverride = opts.override !== false;
}

export function resetSnapshotStorage() {
  storage = null;
  explicitOverride = false;
}

function requiresRemoteSnapshotStorage(environment) {
  const env = environment || process.env.FORGENIQ_ENV || 'local';
  if (env === 'staging' || process.env.FORGENIQ_ENV === 'staging') return true;
  if (process.env.RI_SNAPSHOT_STORAGE_MODE === 'supabase') return true;
  return false;
}

/**
 * Initialise Supabase snapshot storage for staging / explicit supabase mode.
 * No-op when tests inject storage via setSnapshotStorage({ override: true }).
 *
 * @param {{ environment?: string }} [params]
 */
export async function ensureSnapshotStorageReady(params = {}) {
  if (explicitOverride) return;

  const environment = params.environment || process.env.FORGENIQ_ENV || 'local';
  if (!requiresRemoteSnapshotStorage(environment)) return;

  const config = validateSupabaseSnapshotConfig({
    environment,
    requireApprovedStagingProject: environment === 'staging' || process.env.FORGENIQ_ENV === 'staging',
  });

  const supabase = createClient(config.url, config.serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  await assertSnapshotBucketReady(supabase, config.bucket);

  storage = createSupabaseSnapshotStorage(supabase, { bucket: config.bucket });
  explicitOverride = false;
}

/**
 * @param {{ environment?: string }} [params]
 */
export function getSnapshotStorage(params = {}) {
  if (storage) return storage;

  const environment = params.environment || process.env.FORGENIQ_ENV || 'local';
  if (requiresRemoteSnapshotStorage(environment)) {
    throw new Error(
      'snapshot_storage_not_initialized: ensureSnapshotStorageReady must run before ingestion when FORGENIQ_ENV=staging',
    );
  }

  storage = createMemorySnapshotStorage();
  return storage;
}
