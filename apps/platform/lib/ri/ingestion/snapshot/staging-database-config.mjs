import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FORGENIQ_RI_STAGING_PROJECT_REF } from './staging-constants.mjs';
import { CP26_38_STAGING } from './cp26-38-staging-identity.mjs';
import { assertStagingRegulatoryCountsAtLeastBaseline } from './staging-regulatory-count-invariants.mjs';

/**
 * Ensure DATABASE_URL targets FORGENIQ RI staging Postgres (not MI or production).
 * Does not log connection strings or credentials.
 *
 * @param {string} databaseUrl
 * @param {{ expectedProjectRef?: string }} [options]
 */
export function validateStagingDatabaseUrl(databaseUrl, options = {}) {
  const expectedRef = options.expectedProjectRef || FORGENIQ_RI_STAGING_PROJECT_REF;
  const raw = databaseUrl?.trim();
  if (!raw) {
    throw new Error('staging_database_url_missing');
  }

  let parsed;
  try {
    parsed = new URL(raw.replace(/^postgres:/, 'postgresql:'));
  } catch {
    throw new Error('staging_database_url_invalid');
  }

  const host = parsed.hostname.toLowerCase();
  const user = decodeURIComponent(parsed.username || '').toLowerCase();
  const port = parsed.port || '5432';

  const refInHost = host.includes(expectedRef);
  const refInUser = user.includes(expectedRef) || user === `postgres.${expectedRef}`;

  if (!refInHost && !refInUser) {
    throw new Error(`staging_database_project_mismatch: expected ref ${expectedRef}`);
  }

  const directHost = `db.${expectedRef}.supabase.co`;
  const poolerSuffix = '.pooler.supabase.com';
  const hostLooksValid =
    host === directHost ||
    host.endsWith(poolerSuffix) ||
    refInHost;

  if (!hostLooksValid) {
    throw new Error('staging_database_host_unexpected');
  }

  if (!['5432', '6543'].includes(port)) {
    throw new Error('staging_database_port_unexpected');
  }

  return { host, port, projectRef: expectedRef, connectionMode: port === '6543' ? 'pooler' : 'direct' };
}

const STAGING_CA_FILE = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  '..',
  'certs',
  'supabase-root-2021-ca.pem',
);

/**
 * Resolve Supabase Postgres root CA PEM (public trust anchor; not a secret).
 * Override with FORGENIQ_STAGING_PG_SSL_CA_PATH or SUPABASE_DB_SSL_CA_PATH.
 */
export function resolveSupabaseStagingDbCaPem() {
  const inline = process.env.FORGENIQ_STAGING_PG_SSL_CA_PEM?.trim();
  if (inline && inline.includes('BEGIN CERTIFICATE')) {
    return inline;
  }
  for (const key of ['FORGENIQ_STAGING_PG_SSL_CA_PATH', 'SUPABASE_DB_SSL_CA_PATH']) {
    const custom = process.env[key]?.trim();
    if (custom && existsSync(custom)) {
      return readFileSync(custom, 'utf8');
    }
  }
  if (!existsSync(STAGING_CA_FILE)) {
    throw new Error(
      'staging_pg_ssl_ca_missing: add apps/platform/certs/supabase-root-2021-ca.pem or set FORGENIQ_STAGING_PG_SSL_CA_PATH',
    );
  }
  return readFileSync(STAGING_CA_FILE, 'utf8');
}

/**
 * Strip libpq sslmode query params so node-postgres ssl options control verification.
 * @param {string} databaseUrl
 */
export function normalizeStagingPgConnectionString(databaseUrl) {
  const raw = databaseUrl?.trim();
  if (!raw) throw new Error('staging_database_url_missing');
  try {
    const parsed = new URL(raw.replace(/^postgres:/, 'postgresql:'));
    parsed.searchParams.delete('sslmode');
    parsed.searchParams.delete('ssl');
    parsed.searchParams.delete('sslrootcert');
    return parsed.toString().replace(/^postgresql:/, 'postgres:');
  } catch {
    return raw;
  }
}

/**
 * pg client options for Supabase staging with verified TLS (Supabase Root 2021 CA).
 * @param {string} databaseUrl
 */
export function stagingPgClientOptions(databaseUrl) {
  const connectionString = normalizeStagingPgConnectionString(databaseUrl);
  const ca = resolveSupabaseStagingDbCaPem();
  return {
    connectionString,
    ssl: {
      ca,
      rejectUnauthorized: true,
      servername: validateStagingDatabaseUrl(databaseUrl).host,
    },
  };
}

/**
 * Read-only staging DB preflight (no writes).
 * @param {import('pg').Client} client
 */
export async function verifyStagingDatabaseReadOnly(client) {
  const countsRes = await client.query(
    `select
      (select count(*)::int from regulatory_publications) as publications,
      (select count(*)::int from regulatory_publication_versions) as publication_versions,
      (select count(*)::int from regulatory_source_snapshots) as source_snapshots,
      (select count(*)::int from regulatory_source_extraction_revisions) as extraction_revisions`,
  );
  const counts = countsRes.rows[0];
  assertStagingRegulatoryCountsAtLeastBaseline(counts);

  const snap = await client.query(
    `select s.id, s.raw_content_sha256, s.source_fingerprint, p.source_hash, p.source_version, v.version_number
     from regulatory_source_snapshots s
     join regulatory_publications p on p.id = s.publication_id
     join regulatory_publication_versions v on v.id = s.publication_version_id
     where s.id = $1`,
    [CP26_38_STAGING.snapshotId],
  );
  if (!snap.rows[0]) {
    throw new Error('staging_cp26_snapshot_missing');
  }
  const row = snap.rows[0];
  if (row.source_fingerprint !== CP26_38_STAGING.sourceFingerprintV1) {
    throw new Error('staging_cp26_fingerprint_mismatch');
  }
  if (row.source_hash !== CP26_38_STAGING.sourceFingerprintV1) {
    throw new Error('staging_cp26_publication_hash_mismatch');
  }
  if (String(row.source_version) !== '1' || row.version_number !== 1) {
    throw new Error('staging_cp26_version_mismatch');
  }
  if (row.raw_content_sha256 !== CP26_38_STAGING.rawContentSha256) {
    throw new Error('staging_cp26_raw_sha_mismatch');
  }

  const fca = await client.query(
    `select ingestion_mode from regulatory_sources where external_key = 'SRC-FCA-PUBLICATIONS-RSS'`,
  );
  if (fca.rows[0]?.ingestion_mode !== 'DISABLED') {
    throw new Error('staging_fca_ingestion_not_disabled');
  }

  return { counts, snapshotId: row.id, connectionVerified: true };
}
