/**
 * Provider-neutral in-app notification events (no external email/SMS).
 * @param {import('pg').Client} client
 */
export async function recordNotificationEvent(client, params) {
  const { eventType, sourceId, publicationId, ingestionRunId, payload } = params;
  await client.query(
    `insert into notification_events (event_type, source_id, publication_id, ingestion_run_id, payload)
     values ($1::notification_event_type, $2, $3, $4, $5::jsonb)`,
    [eventType, sourceId ?? null, publicationId ?? null, ingestionRunId ?? null, JSON.stringify(payload ?? {})],
  );
}
