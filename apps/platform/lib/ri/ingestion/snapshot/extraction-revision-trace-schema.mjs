/**
 * Column allow-lists for Step 79 trace SQL (sourced from migrations + staging introspection).
 * Project: forgeniq-ri-staging (lhgzdicffkhaaykzthep).
 */
export const STAGING_TRACE_TABLE_COLUMNS = {
  r: new Set([
    'id',
    'source_snapshot_id',
    'publication_id',
    'publication_version_id',
    'raw_content_sha256',
    'extraction_profile',
    'extraction_algorithm',
    'derived_content_fingerprint',
    'normalised_html_sha256',
    'normalised_text_sha256',
    'normalised_html_storage_path',
    'normalised_text_storage_path',
    'derived_metadata_storage_path',
    'extraction_quality',
    'publication_metadata',
    'pdf_attachments',
    'provenance',
    'created_at',
    'created_by',
  ]),
  s: new Set([
    'id',
    'publication_id',
    'publication_version_id',
    'ingestion_run_id',
    'ingestion_item_id',
    'canonical_url',
    'retrieved_at',
    'source_fingerprint',
    'fingerprint_algorithm',
    'fingerprint_normalisation',
    'raw_content_sha256',
    'normalised_html_sha256',
    'normalised_text_sha256',
    'raw_storage_path',
    'normalised_html_storage_path',
    'normalised_text_storage_path',
    'metadata_storage_path',
    'content_type',
    'byte_size_raw',
    'byte_size_normalised_html',
    'byte_size_normalised_text',
    'licence_notice',
    'provenance',
    'created_at',
  ]),
  v: new Set([
    'id',
    'publication_id',
    'version_number',
    'source_hash',
    'canonical_url',
    'retrieved_at',
    'ingestion_run_id',
    'provenance',
    'created_at',
  ]),
  p: new Set([
    'id',
    'source_id',
    'regulator_id',
    'external_document_id',
    'title',
    'publication_type',
    'summary',
    'canonical_url',
    'publication_date',
    'effective_date',
    'consultation_deadline',
    'retrieved_at',
    'source_hash',
    'source_version',
    'data_origin',
    'provenance',
    'created_at',
    'updated_at',
  ]),
  reg: new Set([
    'id',
    'external_key',
    'name',
    'acronym',
    'jurisdiction',
    'country',
    'region',
    'regulator_type',
    'official_base_url',
    'lifecycle_status',
    'created_at',
    'updated_at',
  ]),
  rs: new Set([
    'id',
    'external_key',
    'regulator_id',
    'name',
    'source_type',
    'canonical_url',
    'jurisdiction',
    'catalogue_status',
    'verification_status',
    'coverage_verification_status',
    'production_status',
    'production_strategy',
    'content_classes',
    'ri_uses',
    'created_at',
    'updated_at',
    'ingestion_mode',
  ]),
};

/** Known-invalid column names that must never appear in trace SQL. */
export const INVALID_TRACE_COLUMN_REFERENCES = [
  { pattern: /s\.storage_path_raw\b/i, reason: 'use_s_raw_storage_path' },
  { pattern: /p\.regulatory_source_id\b/i, reason: 'use_p_source_id' },
  { pattern: /s\.storage_path\b/i, reason: 'snapshot_uses_raw_storage_path' },
  { pattern: /s\.source_hash\b/i, reason: 'use_s_source_fingerprint' },
];

/**
 * @param {string} sql
 */
export function listTraceSqlQualifiedColumnRefs(sql) {
  const refs = [];
  const re = /\b(rs|[rsvp])\.([a-z_][a-z0-9_]*)\b/gi;
  let m;
  while ((m = re.exec(sql)) !== null) {
    refs.push({ alias: m[1].toLowerCase(), column: m[2].toLowerCase() });
  }
  return refs;
}

/**
 * @param {string} sql
 */
export function assertTraceSqlColumnsMatchStagingSchema(sql) {
  for (const inv of INVALID_TRACE_COLUMN_REFERENCES) {
    if (inv.pattern.test(sql)) {
      return { pass: false, reason: inv.reason };
    }
  }
  const refs = listTraceSqlQualifiedColumnRefs(sql);
  for (const { alias, column } of refs) {
    const allowed = STAGING_TRACE_TABLE_COLUMNS[alias];
    if (!allowed) {
      return { pass: false, reason: `unknown_alias:${alias}` };
    }
    if (!allowed.has(column)) {
      return { pass: false, reason: `invalid_column:${alias}.${column}` };
    }
  }
  return { pass: true, columnRefCount: refs.length };
}
