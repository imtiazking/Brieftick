import { DEFAULT_SNAPSHOT_BUCKET } from './staging-constants.mjs';
import { downloadPrivateStorageObject } from './readonly-storage-download.mjs';
import { validateSupabaseSnapshotConfig } from './supabase-config.mjs';

/**
 * @param {import('pg').Client} client
 * @param {string} snapshotId
 */
export async function downloadSnapshotRawBody(client, snapshotId) {
  const snap = await client.query(
    `select raw_storage_path, raw_content_sha256 from regulatory_source_snapshots where id = $1`,
    [snapshotId],
  );
  if (!snap.rows[0]) throw new Error('snapshot_not_found');
  const config = validateSupabaseSnapshotConfig({ requireApprovedStagingProject: true, environment: 'staging' });
  const body = await downloadPrivateStorageObject({
    projectUrl: config.url,
    serviceRoleKey: config.serviceKey,
    bucket: config.bucket || DEFAULT_SNAPSHOT_BUCKET,
    objectPath: snap.rows[0].raw_storage_path,
  });
  const { createHash } = await import('node:crypto');
  const sha = createHash('sha256').update(body).digest('hex');
  if (sha !== snap.rows[0].raw_content_sha256) {
    throw new Error('snapshot_raw_sha_mismatch');
  }
  return body;
}