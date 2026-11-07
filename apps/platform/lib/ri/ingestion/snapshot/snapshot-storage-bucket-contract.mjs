import { DEFAULT_SNAPSHOT_BUCKET } from './staging-constants.mjs';

/** Stable operator-facing code when mandatory storage checks fail before upload. */
export const STORAGE_BUCKET_NOT_READY = 'STORAGE_BUCKET_NOT_READY';

/** MIME types required for html_article_v2 evidence (Phase 8C.1). */
export const SNAPSHOT_STORAGE_HTML_EVIDENCE_MIME_TYPES = [
  'text/html',
  'text/plain',
  'application/json',
];

/** Additional MIME for Step 80 primary PDF bytes. */
export const SNAPSHOT_STORAGE_PDF_MIME_TYPE = 'application/pdf';

/**
 * Full allowlist after Step 80C.3A staging bucket update.
 * @param {{ includePdf?: boolean }} [options]
 */
export function requiredSnapshotBucketMimeTypes(options = {}) {
  const includePdf = options.includePdf !== false;
  const base = [...SNAPSHOT_STORAGE_HTML_EVIDENCE_MIME_TYPES];
  if (includePdf && !base.includes(SNAPSHOT_STORAGE_PDF_MIME_TYPE)) {
    base.push(SNAPSHOT_STORAGE_PDF_MIME_TYPE);
  }
  return base;
}

/** Observed FCA CP26/38 primary PDF size on staging (bytes). Used for preflight only. */
export const CP26_PRIMARY_PDF_REFERENCE_BYTE_LENGTH = 1_035_232;

/**
 * Normalise bucket row from Supabase `getBucket` or SQL `storage.buckets`.
 * @param {object} bucket
 */
export function normaliseBucketRow(bucket) {
  if (!bucket) return null;
  const allowed = bucket.allowed_mime_types ?? bucket.allowedMimeTypes ?? null;
  const fileSizeLimit = bucket.file_size_limit ?? bucket.fileSizeLimit ?? null;
  const isPublic = bucket.public === true;
  const name = bucket.name ?? bucket.id ?? null;
  return {
    name,
    public: isPublic,
    fileSizeLimit,
    allowedMimeTypes: Array.isArray(allowed) ? allowed : allowed == null ? null : [allowed],
  };
}

/**
 * @param {ReturnType<typeof normaliseBucketRow>} row
 * @param {{ expectedBucketName?: string, requiredMimeTypes?: string[], minObjectBytes?: number }} options
 */
export function evaluateSnapshotBucketIngestReadiness(row, options = {}) {
  const expectedBucketName = options.expectedBucketName || DEFAULT_SNAPSHOT_BUCKET;
  const requiredMime = options.requiredMimeTypes || requiredSnapshotBucketMimeTypes();
  const minObjectBytes =
    options.minObjectBytes ?? CP26_PRIMARY_PDF_REFERENCE_BYTE_LENGTH;

  const checks = {
    bucketName: false,
    private: false,
    mimeTypesPresent: false,
    mimeTypesIncludePdf: false,
    mimeTypesPreserveHtmlEvidence: false,
    fileSizeLimitSufficient: false,
  };

  if (!row) {
    return { ok: false, code: STORAGE_BUCKET_NOT_READY, reason: 'bucket_row_missing', checks };
  }

  checks.bucketName = row.name === expectedBucketName;
  checks.private = row.public !== true;

  const allowed = new Set((row.allowedMimeTypes || []).map((m) => String(m).toLowerCase()));
  const requiredLower = requiredMime.map((m) => m.toLowerCase());
  checks.mimeTypesPresent = requiredLower.every((m) => allowed.has(m));
  checks.mimeTypesIncludePdf = allowed.has(SNAPSHOT_STORAGE_PDF_MIME_TYPE);
  checks.mimeTypesPreserveHtmlEvidence = SNAPSHOT_STORAGE_HTML_EVIDENCE_MIME_TYPES.every((m) =>
    allowed.has(m.toLowerCase()),
  );

  if (row.fileSizeLimit == null || row.fileSizeLimit === 0) {
    checks.fileSizeLimitSufficient = true;
  } else {
    checks.fileSizeLimitSufficient = row.fileSizeLimit >= minObjectBytes;
  }

  const ok =
    checks.bucketName &&
    checks.private &&
    checks.mimeTypesPresent &&
    checks.mimeTypesPreserveHtmlEvidence &&
    checks.fileSizeLimitSufficient;

  let reason = 'ok';
  if (!checks.bucketName) reason = 'unexpected_bucket_name';
  else if (!checks.private) reason = 'bucket_not_private';
  else if (!checks.mimeTypesIncludePdf) reason = 'application_pdf_not_allowed';
  else if (!checks.mimeTypesPreserveHtmlEvidence) reason = 'html_evidence_mime_types_missing';
  else if (!checks.mimeTypesPresent) reason = 'required_mime_types_missing';
  else if (!checks.fileSizeLimitSufficient) reason = 'file_size_limit_too_small';

  return {
    ok,
    code: ok ? null : STORAGE_BUCKET_NOT_READY,
    reason,
    checks,
    allowedMimeTypes: [...allowed],
    fileSizeLimit: row.fileSizeLimit,
    minObjectBytes,
    requiredMimeTypes: requiredMime,
  };
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} bucketName
 * @param {{ requirePrimaryPdf?: boolean, minObjectBytes?: number }} [options]
 */
export async function loadSnapshotBucketConfig(supabase, bucketName) {
  const { data, error } = await supabase.storage.getBucket(bucketName);
  if (error) {
    const err = new Error(`${STORAGE_BUCKET_NOT_READY}: get_bucket_failed: ${error.message}`);
    err.code = STORAGE_BUCKET_NOT_READY;
    throw err;
  }
  return normaliseBucketRow(data);
}
