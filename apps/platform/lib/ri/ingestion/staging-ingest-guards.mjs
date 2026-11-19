import { FORGENIQ_RI_STAGING_PROJECT_REF } from './snapshot/staging-constants.mjs';
import { validateSupabaseSnapshotConfig } from './snapshot/supabase-config.mjs';

/**
 * Confirm Postgres connection string targets approved RI staging (not MI or other projects).
 * Does not log or return the connection string.
 * @param {string} databaseUrl
 * @param {string} [environment]
 */
export function assertStagingDatabaseUrlTarget(databaseUrl, environment) {
  const env = environment || process.env.FORGENIQ_ENV || 'local';
  if (env !== 'staging' && process.env.FORGENIQ_INGEST_ENV !== 'staging') {
    return;
  }
  const ref = FORGENIQ_RI_STAGING_PROJECT_REF;
  const url = typeof databaseUrl === 'string' ? databaseUrl : '';
  if (!url) {
    throw new Error('staging_database_target_missing');
  }
  const lower = url.toLowerCase();
  const directHost = `db.${ref}.supabase.co`;
  const apiHost = `${ref}.supabase.co`;
  const poolerUser = `postgres.${ref}`;
  if (
    lower.includes(directHost) ||
    lower.includes(apiHost) ||
    lower.includes(poolerUser) ||
    lower.includes(`@${ref}.`) ||
    lower.includes(`/${ref}`)
  ) {
    return;
  }
  throw new Error(`staging_database_project_mismatch: expected ${ref}`);
}

/**
 * Staging ingest must align DB target and Supabase Storage project independently.
 * @param {{ environment?: string, databaseUrl?: string }} params
 */
export function assertStagingIngestIsolation(params = {}) {
  const environment = params.environment || process.env.FORGENIQ_INGEST_ENV || process.env.FORGENIQ_ENV || 'local';
  if (environment !== 'staging') {
    return { storageProjectRef: null };
  }
  assertStagingDatabaseUrlTarget(params.databaseUrl ?? process.env.FORGENIQ_LOCAL_PG_URL ?? '', environment);
  const storage = validateSupabaseSnapshotConfig({
    environment: 'staging',
    requireApprovedStagingProject: true,
  });
  return { storageProjectRef: storage.projectRef };
}
