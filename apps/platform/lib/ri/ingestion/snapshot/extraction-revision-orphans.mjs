/**
 * Orphan detection for upload-before-commit extraction revisions.
 * Content-addressed objects may exist in Storage without a committed DB row after rollback.
 */

/**
 * @param {object} params
 * @param {import('./memory-storage.mjs').SnapshotStorage} params.storage
 * @param {import('pg').Client} params.client
 * @param {{ html: string, text: string, metadata: string }} params.storagePaths
 * @param {string} params.sourceSnapshotId
 * @param {string} params.extractionProfile
 */
export async function identifyOrphanedExtractionRevisionArtefacts(params) {
  const { storage, client, storagePaths, sourceSnapshotId, extractionProfile } = params;
  const keys = [storagePaths.html, storagePaths.text, storagePaths.metadata].filter(Boolean);

  const res = await client.query(
    `select normalised_html_storage_path, normalised_text_storage_path, derived_metadata_storage_path
     from regulatory_source_extraction_revisions
     where source_snapshot_id = $1 and extraction_profile = $2`,
    [sourceSnapshotId, extractionProfile],
  );

  const linked = new Set();
  if (res.rows[0]) {
    linked.add(res.rows[0].normalised_html_storage_path);
    linked.add(res.rows[0].normalised_text_storage_path);
    linked.add(res.rows[0].derived_metadata_storage_path);
  }

  const orphans = [];
  for (const key of keys) {
    const head = await storage.headObject({ key });
    if (!head.exists) continue;
    if (!linked.has(key)) {
      orphans.push({ key, sha256: head.sha256, byteLength: head.byteLength });
    }
  }

  return {
    orphans,
    linkedRevision: Boolean(res.rows[0]),
    revisionStoragePaths: res.rows[0] || null,
  };
}
