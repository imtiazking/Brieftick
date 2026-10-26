/**
 * Insert snapshot metadata row (inside open transaction).
 * @param {import('pg').Client} client
 */
export async function insertRegulatorySourceSnapshotRow(client, row) {
  const res = await client.query(
    `insert into regulatory_source_snapshots (
      publication_id, publication_version_id, ingestion_run_id, ingestion_item_id,
      canonical_url, retrieved_at,
      source_fingerprint, fingerprint_algorithm, fingerprint_normalisation,
      raw_content_sha256, normalised_html_sha256, normalised_text_sha256,
      raw_storage_path, normalised_html_storage_path, normalised_text_storage_path, metadata_storage_path,
      content_type, byte_size_raw, byte_size_normalised_html, byte_size_normalised_text,
      licence_notice, provenance
    ) values (
      $1,$2,$3,$4,$5,$6::timestamptz,
      $7,$8,$9,$10,$11,$12,$13,$14,$15,$16,
      $17,$18,$19,$20,$21,$22::jsonb
    ) returning id`,
    [
      row.publicationId,
      row.publicationVersionId,
      row.ingestionRunId,
      row.ingestionItemId ?? null,
      row.canonicalUrl,
      row.retrievedAt,
      row.sourceFingerprint,
      row.fingerprintAlgorithm,
      row.fingerprintNormalisation,
      row.rawContentSha256,
      row.normalisedHtmlSha256,
      row.normalisedTextSha256,
      row.rawStoragePath,
      row.normalisedHtmlStoragePath,
      row.normalisedTextStoragePath,
      row.metadataStoragePath,
      row.contentType,
      row.byteSizeRaw,
      row.byteSizeNormalisedHtml,
      row.byteSizeNormalisedText,
      row.licenceNotice,
      JSON.stringify(row.provenance),
    ],
  );
  return res.rows[0].id;
}
