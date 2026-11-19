import { executeIngestionForSource } from './executor.mjs';
import { markStaleSources } from './health.mjs';
import { recordOperationalAudit } from './audit.mjs';

/** Longer than the hosted route maxDuration (300s): a RUNNING row this old was killed mid-run. */
export const STALE_RUNNING_RUN_MINUTES = 30;

/**
 * Runs left RUNNING by a killed invocation would block their source forever (ALREADY_RUNNING).
 * @param {import('pg').Client} client
 */
export async function recoverStaleRunningRuns(client, options = {}) {
  const minutes = options.olderThanMinutes ?? STALE_RUNNING_RUN_MINUTES;
  const { rows } = await client.query(
    `update ingestion_runs
     set status = 'FAILED'::ingestion_run_status,
         completed_at = now(),
         error_summary = 'stale_running_recovered',
         failure_class = 'TRANSIENT'
     where status = 'RUNNING'::ingestion_run_status
       and started_at < now() - ($1 || ' minutes')::interval
     returning id, source_id`,
    [String(minutes)],
  );
  if (rows.length > 0) {
    await recordOperationalAudit(client, {
      eventType: 'SCHEDULER_STALE_RUNS_RECOVERED',
      actorUserId: 'system:scheduler',
      metadata: { olderThanMinutes: minutes, runIds: rows.map((r) => r.id) },
    });
  }
  return rows.length;
}

/**
 * Sources due for a scheduled run (read-only).
 * @param {import('pg').Client} client
 */
export async function selectDueSources(client, options = {}) {
  const now = options.now ?? new Date();
  const { rows } = await client.query(
    `select o.*, s.external_key
     from regulatory_source_operations o
     join regulatory_sources s on s.id = o.source_id
     where o.enabled = true
       and s.ingestion_mode = 'ENABLED'::source_ingestion_mode
       and o.ingestion_mode in ('TEST_ONLY'::source_ingestion_mode, 'ENABLED'::source_ingestion_mode)
       and (o.next_run_at is null or o.next_run_at <= $1::timestamptz)
     order by o.last_success_at nulls first, o.next_run_at nulls first, s.external_key asc
     limit $2`,
    [now.toISOString(), options.maxSourcesPerTick ?? 500],
  );
  return rows;
}

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

  const staleRunsRecovered = await recoverStaleRunningRuns(client);
  const dueRows = await selectDueSources(client, { now, maxSourcesPerTick: options.maxSourcesPerTick });

  const outcomes = [];
  for (const row of dueRows) {
    if (typeof options.allowSource === 'function' && !options.allowSource(row.external_key)) {
      outcomes.push({
        source: row.external_key,
        status: 'SKIPPED',
        errorSummary: 'hosted_scheduler_source_not_allowlisted',
      });
      continue;
    }
    const outcome = await executeIngestionForSource(client, {
      sourceId: row.external_key,
      triggerType: 'SCHEDULED',
      runType: 'SCHEDULED',
      initiatedBy: 'system:scheduler',
      environment: options.environment ?? 'local',
      liveAllowed: options.liveAllowed === true,
      fixture: fixtureBySource[row.external_key],
      simulateError: options.simulateErrorBySource?.[row.external_key] ?? null,
    });
    outcomes.push({ source: row.external_key, ...outcome });
  }

  const stale = await markStaleSources(client, now);
  return { dueCount: dueRows.length, outcomes, staleMarked: stale, staleRunsRecovered };
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
