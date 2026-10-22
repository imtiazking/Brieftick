import { executeIngestionForSource } from './executor.mjs';
import { markStaleSources } from './health.mjs';
import { recordOperationalAudit } from './audit.mjs';

/**
 * Provider-neutral scheduler tick (one invocation = one tick, no infinite loop).
 * @param {import('pg').Client} client
 */
export async function runSchedulerTick(client, options = {}) {
  const now = options.now ?? new Date();
  const fixtureBySource = options.fixtureBySource ?? {};

  await recordOperationalAudit(client, {
    eventType: 'SCHEDULER_TICK',
    actorUserId: 'system:scheduler',
    metadata: { at: now.toISOString() },
  });

  const due = await client.query(
    `select o.*, s.external_key
     from regulatory_source_operations o
     join regulatory_sources s on s.id = o.source_id
     where o.enabled = true
       and o.ingestion_mode = 'TEST_ONLY'
       and (o.next_run_at is null or o.next_run_at <= $1::timestamptz)
     order by o.next_run_at nulls first`,
    [now.toISOString()],
  );

  const outcomes = [];
  for (const row of due.rows) {
    const outcome = await executeIngestionForSource(client, {
      sourceId: row.external_key,
      triggerType: 'SCHEDULED',
      runType: 'SCHEDULED',
      initiatedBy: 'system:scheduler',
      fixture: fixtureBySource[row.external_key],
      simulateError: options.simulateErrorBySource?.[row.external_key] ?? null,
    });
    outcomes.push({ source: row.external_key, ...outcome });
  }

  const stale = await markStaleSources(client, now);
  return { dueCount: due.rows.length, outcomes, staleMarked: stale };
}

export async function processDueRetries(client, options = {}) {
  const { rows } = await client.query(
    `select r.id, r.source_id, r.attempt_number, s.external_key
     from ingestion_runs r
     join regulatory_sources s on s.id = r.source_id
     where r.status = 'FAILED'::ingestion_run_status
       and r.next_retry_at is not null
       and r.next_retry_at <= now()
       and r.failure_class in ('TRANSIENT', 'RATE_LIMIT', 'SERVER_ERROR')
     limit 10`,
  );

  const results = [];
  for (const row of rows) {
    const op = await client.query(`select max_retries from regulatory_source_operations where source_id = $1`, [
      row.source_id,
    ]);
    const maxRetries = op.rows[0]?.max_retries ?? 3;
    const nextAttempt = row.attempt_number + 1;
    if (nextAttempt > maxRetries) continue;

    const outcome = await executeIngestionForSource(client, {
      sourceId: row.external_key,
      triggerType: 'RETRY',
      runType: 'RETRY',
      attemptNumber: nextAttempt,
      initiatedBy: 'system:retry',
      fixture: options.fixtureBySource?.[row.external_key],
      simulateError: options.simulateErrorBySource?.[row.external_key] ?? null,
    });
    results.push({ source: row.external_key, ...outcome });
  }
  return results;
}
