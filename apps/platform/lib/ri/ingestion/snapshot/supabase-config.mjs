import {
  DEFAULT_SNAPSHOT_BUCKET,
  FORGENIQ_RI_STAGING_PROJECT_REF,
} from './staging-constants.mjs';
import {
  evaluateSnapshotBucketIngestReadiness,
  loadSnapshotBucketConfig,
  requiredSnapshotBucketMimeTypes,
  STORAGE_BUCKET_NOT_READY,
} from './snapshot-storage-bucket-contract.mjs';

/**
 * @param {string} url
 * @returns {string | null}
 */
export function extractProjectRefFromSupabaseUrl(url) {
  if (!url) return null;
  try {
    const host = new URL(url).hostname;
    const m = host.match(/^([a-z0-9]+)\.supabase\.co$/i);
    return m?.[1] ?? null;
  } catch {
    return null;
  }
}

/**
 * Validate env for Supabase snapshot storage (no secrets returned).
 * @param {{ requireApprovedStagingProject?: boolean, environment?: string }} [options]
 */
export function validateSupabaseSnapshotConfig(options = {}) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url) {
    throw new Error('snapshot_storage_config_missing: NEXT_PUBLIC_SUPABASE_URL');
  }
  if (!serviceKey) {
    throw new Error('snapshot_storage_config_missing: SUPABASE_SERVICE_ROLE_KEY');
  }

  const ref = extractProjectRefFromSupabaseUrl(url);
  if (!ref) {
    throw new Error('snapshot_storage_config_invalid: NEXT_PUBLIC_SUPABASE_URL');
  }

  const env = options.environment || process.env.FORGENIQ_ENV || 'local';
  const requireStaging =
    options.requireApprovedStagingProject === true ||
    env === 'staging' ||
    process.env.FORGENIQ_ENV === 'staging';

  const expectedRef =
    process.env.SUPABASE_PROJECT_REF?.trim() ||
    (requireStaging ? FORGENIQ_RI_STAGING_PROJECT_REF : null);

  if (expectedRef && ref !== expectedRef) {
    throw new Error(`snapshot_storage_project_mismatch: expected ${expectedRef}`);
  }

  const bucket = process.env.RI_SNAPSHOT_STORAGE_BUCKET?.trim() || DEFAULT_SNAPSHOT_BUCKET;
  return { url, serviceKey, projectRef: ref, bucket };
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} bucketName
 */
export async function assertSnapshotBucketReady(supabase, bucketName) {
  const { data, error } = await supabase.storage.listBuckets();
  if (error) {
    throw new Error(`snapshot_storage_bucket_list_failed: ${error.message}`);
  }
  const bucket = (data ?? []).find((b) => b.name === bucketName || b.id === bucketName);
  if (!bucket) {
    throw new Error(`snapshot_storage_bucket_missing: ${bucketName}`);
  }
  if (bucket.public) {
    throw new Error(`snapshot_storage_bucket_not_private: ${bucketName}`);
  }
}

/**
 * Mandatory ingest preflight: bucket privacy, MIME allowlist, size limit (no uploads).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} bucketName
 * @param {{ requirePrimaryPdf?: boolean, minObjectBytes?: number }} [options]
 * @returns {Promise<import('./snapshot-storage-bucket-contract.mjs').evaluateSnapshotBucketIngestReadiness>}
 */
export async function assertSnapshotBucketIngestReady(supabase, bucketName, options = {}) {
  await assertSnapshotBucketReady(supabase, bucketName);
  const row = await loadSnapshotBucketConfig(supabase, bucketName);
  const requirePrimaryPdf = options.requirePrimaryPdf === true;
  const evaluation = evaluateSnapshotBucketIngestReadiness(row, {
    expectedBucketName: bucketName,
    requiredMimeTypes: requiredSnapshotBucketMimeTypes({ includePdf: requirePrimaryPdf }),
    minObjectBytes: options.minObjectBytes,
  });
  if (!evaluation.ok) {
    const err = new Error(
      `${STORAGE_BUCKET_NOT_READY}: ${evaluation.reason} (bucket=${bucketName})`,
    );
    err.code = STORAGE_BUCKET_NOT_READY;
    err.bucketEvaluation = evaluation;
    throw err;
  }
  return evaluation;
}

export { STORAGE_BUCKET_NOT_READY };
