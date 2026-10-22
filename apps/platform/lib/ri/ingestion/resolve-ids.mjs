/**
 * Resolve stable catalogue keys to database UUIDs.
 * @param {import('pg').Client} client
 */
export async function resolveCatalogueIds(client, regulatorKey, sourceKey) {
  const reg = await client.query(
    `select id from regulators where external_key = $1`,
    [regulatorKey],
  );
  if (!reg.rows[0]?.id) {
    throw new Error(`unknown_regulator_${regulatorKey}`);
  }
  const src = await client.query(
    `select id, production_status, ingestion_mode::text as ingestion_mode
     from regulatory_sources where external_key = $1`,
    [sourceKey],
  );
  if (!src.rows[0]?.id) {
    throw new Error(`unknown_source_${sourceKey}`);
  }
  return {
    regulatorUuid: reg.rows[0].id,
    sourceUuid: src.rows[0].id,
    productionStatus: src.rows[0].production_status,
    ingestionMode: src.rows[0].ingestion_mode,
  };
}
