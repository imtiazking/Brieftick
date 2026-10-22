/**
 * Operational alert upsert with deduplication.
 * @param {import('pg').Client} client
 */
export async function upsertOperationalAlert(client, params) {
  const {
    category,
    severity,
    sourceId,
    ingestionRunId,
    dedupeKey,
    title,
    message,
  } = params;

  const existing = await client.query(
    `select id, status from operational_alerts
     where dedupe_key = $1 and status in ('OPEN', 'ACKNOWLEDGED')`,
    [dedupeKey],
  );

  if (existing.rows[0]) {
    await client.query(
      `update operational_alerts set
        last_seen_at = now(),
        message = $2,
        severity = $3::operational_alert_severity,
        ingestion_run_id = coalesce($4, ingestion_run_id),
        updated_at = now()
       where id = $1`,
      [existing.rows[0].id, message, severity, ingestionRunId],
    );
    return existing.rows[0].id;
  }

  const ins = await client.query(
    `insert into operational_alerts (
      category, severity, source_id, ingestion_run_id, dedupe_key, title, message
    ) values ($1, $2::operational_alert_severity, $3, $4, $5, $6, $7)
    returning id`,
    [category, severity, sourceId, ingestionRunId, dedupeKey, title, message],
  );
  return ins.rows[0].id;
}

export async function resolveAlertsForSource(client, sourceId, categoryPrefix) {
  await client.query(
    `update operational_alerts set status = 'RESOLVED'::operational_alert_status,
      resolved_at = now(), updated_at = now()
     where source_id = $1 and status in ('OPEN', 'ACKNOWLEDGED')
       and category like $2`,
    [sourceId, `${categoryPrefix}%`],
  );
}
