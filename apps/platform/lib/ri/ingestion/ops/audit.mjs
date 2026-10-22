/** @param {import('pg').Client} client */
export async function recordOperationalAudit(client, params) {
  const { eventType, sourceId, ingestionRunId, actorUserId, metadata } = params;
  await client.query(
    `insert into ingestion_operational_events (event_type, source_id, ingestion_run_id, actor_user_id, metadata)
     values ($1, $2, $3, $4, $5::jsonb)`,
    [
      eventType,
      sourceId ?? null,
      ingestionRunId ?? null,
      actorUserId ?? 'system:scheduler',
      JSON.stringify(metadata ?? {}),
    ],
  );
}
