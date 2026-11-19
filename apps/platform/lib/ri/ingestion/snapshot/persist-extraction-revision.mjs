import {
  buildExtractionRevisionConflictDetail,
  extractionRevisionPayloadMatches,
} from './extraction-revision-compare.mjs';

const REVISION_ROW_SELECT = `select id, raw_content_sha256, derived_content_fingerprint,
  normalised_html_sha256, normalised_text_sha256,
  normalised_html_storage_path, normalised_text_storage_path, derived_metadata_storage_path
  from regulatory_source_extraction_revisions
  where source_snapshot_id = $1 and extraction_profile = $2`;

/**
 * @param {import('pg').Client} client
 * @param {string} sourceSnapshotId
 * @param {string} extractionProfile
 */
export async function loadExtractionRevisionByProfile(client, sourceSnapshotId, extractionProfile) {
  const existing = await client.query(REVISION_ROW_SELECT, [sourceSnapshotId, extractionProfile]);
  return existing.rows[0] || null;
}

/**
 * @param {import('pg').Client} client
 * @param {object} row
 * @returns {Promise<{ id: string, created: boolean, outcome: 'created' | 'idempotent_hit' }>}
 */
export async function insertExtractionRevisionRow(client, row) {
  const prior = await loadExtractionRevisionByProfile(
    client,
    row.sourceSnapshotId,
    row.extractionProfile,
  );
  if (prior) {
    if (!extractionRevisionPayloadMatches(prior, row)) {
      const mismatches = buildExtractionRevisionConflictDetail(prior, row);
      const err = new Error('extraction_revision_profile_conflict');
      err.code = 'extraction_revision_profile_conflict';
      err.mismatches = mismatches;
      throw err;
    }
    return { id: prior.id, created: false, outcome: 'idempotent_hit' };
  }

  let res;
  try {
    res = await client.query(
    `insert into regulatory_source_extraction_revisions (
      source_snapshot_id, publication_id, publication_version_id,
      raw_content_sha256, extraction_profile, extraction_algorithm,
      derived_content_fingerprint, normalised_html_sha256, normalised_text_sha256,
      normalised_html_storage_path, normalised_text_storage_path, derived_metadata_storage_path,
      extraction_quality, publication_metadata, pdf_attachments, provenance, created_by
    ) values (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14::jsonb,$15::jsonb,$16::jsonb,$17
    )
    returning id`,
    [
      row.sourceSnapshotId,
      row.publicationId,
      row.publicationVersionId,
      row.rawContentSha256,
      row.extractionProfile,
      row.extractionAlgorithm || 'SHA-256',
      row.derivedContentFingerprint,
      row.normalisedHtmlSha256,
      row.normalisedTextSha256,
      row.normalisedHtmlStoragePath,
      row.normalisedTextStoragePath,
      row.derivedMetadataStoragePath,
      JSON.stringify(row.extractionQuality),
      JSON.stringify(row.publicationMetadata || {}),
      JSON.stringify(row.pdfAttachments || []),
      JSON.stringify(row.provenance),
      row.createdBy,
    ],
  );
  } catch (e) {
    if (e.code === '23505') {
      const raced = await loadExtractionRevisionByProfile(
        client,
        row.sourceSnapshotId,
        row.extractionProfile,
      );
      if (raced && extractionRevisionPayloadMatches(raced, row)) {
        return { id: raced.id, created: false, outcome: 'idempotent_hit' };
      }
      const err = new Error('extraction_revision_profile_conflict');
      err.code = 'extraction_revision_profile_conflict';
      throw err;
    }
    throw e;
  }
  if (!res.rows[0]?.id) {
    throw new Error('extraction_revision_insert_failed');
  }
  return { id: res.rows[0].id, created: true, outcome: 'created' };
}
