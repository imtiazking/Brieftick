/**
 * Mark catalogue rows discovered without snapshots for hosted corpus backfill priority.
 * @param {import('pg').Client} client
 * @param {string} publicationId
 */
export async function queueCorpusBackfillIfNeeded(client, publicationId) {
  const r = await client.query(
    `select id, provenance, canonical_url from regulatory_publications where id = $1`,
    [publicationId],
  );
  const row = r.rows[0];
  if (!row?.canonical_url) return;
  const snap = await client.query(
    `select 1 from regulatory_source_snapshots where publication_id = $1 limit 1`,
    [publicationId],
  );
  if (snap.rows[0]) return;
  const prev = row.provenance || {};
  if (prev.corpusBackfill?.queuedAt) return;
  const next = {
    ...prev,
    corpusBackfill: {
      ...(prev.corpusBackfill && typeof prev.corpusBackfill === 'object' ? prev.corpusBackfill : {}),
      queuedAt: new Date().toISOString(),
      source: 'horizon_ingest',
    },
  };
  await client.query(`update regulatory_publications set provenance = $2::jsonb, updated_at = now() where id = $1`, [
    publicationId,
    JSON.stringify(next),
  ]);
}