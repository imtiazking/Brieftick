/**
 * Source health transitions (operational, not Integration Lab verification).
 * @param {import('pg').Client} client
 */

const HEALTH_EVENTS = {
  HEALTHY: 'SOURCE_HEALTHY',
  DEGRADED: 'SOURCE_DEGRADED',
  FAILING: 'SOURCE_FAILING',
  STALE: 'SOURCE_STALE',
  RECOVERED: 'SOURCE_RECOVERED',
};

export async function applyHealthTransition(client, sourceId, nextHealth, reason) {
  const row = await client.query(
    `select health_status, last_health_event from regulatory_source_operations where source_id = $1`,
    [sourceId],
  );
  const prev = row.rows[0]?.health_status || 'UNKNOWN';
  if (prev === nextHealth) return { changed: false, prev, next: nextHealth };

  await client.query(
    `update regulatory_source_operations set
      health_status = $2::source_health_status,
      last_health_event = $3,
      updated_at = now()
     where source_id = $1`,
    [sourceId, nextHealth, reason],
  );

  const eventType = mapHealthEvent(prev, nextHealth);
  if (eventType) {
    await client.query(
      `insert into ingestion_operational_events (event_type, source_id, actor_user_id, metadata)
       values ($1, $2, 'system:health', $3::jsonb)`,
      [eventType, sourceId, JSON.stringify({ from: prev, to: nextHealth, reason })],
    );
  }
  return { changed: true, prev, next: nextHealth, eventType };
}

function mapHealthEvent(from, to) {
  if (to === 'HEALTHY' && from !== 'HEALTHY') return HEALTH_EVENTS.RECOVERED;
  if (to === 'HEALTHY') return HEALTH_EVENTS.HEALTHY;
  if (to === 'DEGRADED') return HEALTH_EVENTS.DEGRADED;
  if (to === 'FAILING') return HEALTH_EVENTS.FAILING;
  if (to === 'STALE') return HEALTH_EVENTS.STALE;
  return null;
}

export async function updateOperationsAfterRun(client, sourceId, outcome) {
  const {
    succeeded,
    consecutiveFailures,
    threshold,
    staleAfterMinutes,
  } = outcome;

  if (succeeded) {
    await client.query(
      `update regulatory_source_operations set
        last_success_at = now(),
        consecutive_failures = 0,
        last_failure_at = null,
        updated_at = now()
       where source_id = $1`,
      [sourceId],
    );
    await applyHealthTransition(client, sourceId, 'HEALTHY', 'run_succeeded');
    return;
  }

  await client.query(
    `update regulatory_source_operations set
      last_failure_at = now(),
      consecutive_failures = $2,
      updated_at = now()
     where source_id = $1`,
    [sourceId, consecutiveFailures],
  );

  let health = 'DEGRADED';
  if (consecutiveFailures >= threshold) health = 'FAILING';
  await applyHealthTransition(client, sourceId, health, 'run_failed');
}

export async function markStaleSources(client, now = new Date()) {
  const { rows } = await client.query(
    `select o.source_id, o.stale_after_minutes, o.last_success_at, s.external_key
     from regulatory_source_operations o
     join regulatory_sources s on s.id = o.source_id
     where o.enabled = true and o.ingestion_mode = 'TEST_ONLY'`,
  );
  const stale = [];
  for (const r of rows) {
    if (!r.last_success_at) continue;
    const ageMin = (now.getTime() - new Date(r.last_success_at).getTime()) / 60000;
    if (ageMin > r.stale_after_minutes) {
      await applyHealthTransition(client, r.source_id, 'STALE', 'no_recent_success');
      stale.push(r.external_key);
    }
  }
  return stale;
}
