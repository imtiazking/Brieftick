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
    `select rs.id, rs.production_status, rs.ingestion_mode::text as ingestion_mode,
            coalesce(o.enabled, false) as monitoring_enabled,
            o.last_success_at
     from regulatory_sources rs
     left join regulatory_source_operations o on o.source_id = rs.id
     where rs.external_key = $1`,
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
    monitoringEnabled: src.rows[0].monitoring_enabled === true,
    lastSuccessAt: src.rows[0].last_success_at ?? null,
  };
}
