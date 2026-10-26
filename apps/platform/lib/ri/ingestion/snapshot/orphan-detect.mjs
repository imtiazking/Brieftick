/**
 * Read-only orphan detection: storage keys not referenced by any snapshot row.
 * Does not delete objects.
 *
 * @param {import('pg').Client} client
 * @param {{ listKeys: (opts: { prefix?: string }) => Promise<string[]> }} storage
 */
export async function detectOrphanedSnapshotObjects(client, storage, options = {}) {
  const prefix = options.prefix ?? '';
  const { rows } = await client.query(
    `select raw_storage_path, normalised_html_storage_path, normalised_text_storage_path, metadata_storage_path
     from regulatory_source_snapshots`,
  );
  const referenced = new Set();
  for (const r of rows) {
    referenced.add(r.raw_storage_path);
    referenced.add(r.normalised_html_storage_path);
    referenced.add(r.normalised_text_storage_path);
    referenced.add(r.metadata_storage_path);
  }
  const keys = await storage.listKeys({ prefix });
  const orphans = keys.filter((k) => !referenced.has(k));
  return { orphanCount: orphans.length, orphanKeys: orphans, referencedCount: referenced.size };
}
