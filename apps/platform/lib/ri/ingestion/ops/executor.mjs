import { getSourceById } from '../../../../../../packages/reference-data/index.mjs';
import { runSourceIngestion } from '../ingest-engine.mjs';
import { resolveCatalogueIds } from '../resolve-ids.mjs';
import { classifyFailure, computeNextRetryAt } from './retry-policy.mjs';
import { upsertOperationalAlert, resolveAlertsForSource } from './alerts.mjs';
import { recordNotificationEvent } from './notifications.mjs';
import { updateOperationsAfterRun } from './health.mjs';

export async function tryStartRun(client, params) {
  const { sourceUuid, triggerType, runType, attemptNumber, initiatedBy, environment } = params;

  const running = await client.query(
    `select id from ingestion_runs where source_id = $1 and status = 'RUNNING'::ingestion_run_status limit 1`,
    [sourceUuid],
  );
  if (running.rows[0]) {
    const skip = await client.query(
      `insert into ingestion_runs (
        source_id, run_type, status, trigger_type, attempt_number, queued_at, started_at, completed_at,
        initiated_by, environment, error_summary
      ) values ($1, $2::ingestion_run_type, 'SKIPPED'::ingestion_run_status, $3::ingestion_trigger_type,
        $4, now(), now(), now(), $5, $6, 'ALREADY_RUNNING')
      returning id`,
      [sourceUuid, runType, triggerType, attemptNumber, initiatedBy, environment],
    );
    return { started: false, reason: 'ALREADY_RUNNING', runId: skip.rows[0].id };
  }

  const ins = await client.query(
    `insert into ingestion_runs (
      source_id, run_type, status, trigger_type, attempt_number, queued_at, started_at, initiated_by, environment
    ) values ($1, $2::ingestion_run_type, 'RUNNING'::ingestion_run_status, $3::ingestion_trigger_type,
      $4, now(), now(), $5, $6)
    returning id`,
    [sourceUuid, runType, triggerType, attemptNumber, initiatedBy, environment],
  );
  return { started: true, runId: ins.rows[0].id };
}

export async function executeIngestionForSource(client, params) {
  const {
    sourceId,
    triggerType = 'TEST',
    runType = 'TEST',
    attemptNumber = 1,
    initiatedBy = 'system:executor',
    environment = 'local',
    fixture,
    liveAllowed = false,
    simulateError = null,
  } = params;

  const catalogue = getSourceById(sourceId);
  if (!catalogue) {
    return { status: 'FAILED', errorSummary: `unknown_source_${sourceId}` };
  }
  const ids = await resolveCatalogueIds(client, catalogue.regulatorId, sourceId);

  const opsRes = await client.query(`select * from regulatory_source_operations where source_id = $1`, [
    ids.sourceUuid,
  ]);
  const op = opsRes.rows[0];
  const maxItems = op?.max_items_per_run ?? 3;

  const lock = await tryStartRun(client, {
    sourceUuid: ids.sourceUuid,
    triggerType,
    runType,
    attemptNumber,
    initiatedBy,
    environment,
  });
  if (!lock.started) {
    return { status: 'SKIPPED', runId: lock.runId, reason: lock.reason };
  }
  const runId = lock.runId;

  let result;
  if (simulateError) {
    result = {
      runId,
      status: 'FAILED',
      metrics: { discovered: 0, new: 0, updated: 0, unchanged: 0, failed: 0 },
      errorSummary: simulateError,
    };
    await client.query(
      `update ingestion_runs set status = 'FAILED'::ingestion_run_status, completed_at = now(), error_summary = $2 where id = $1`,
      [runId, simulateError],
    );
  } else {
    result = await runSourceIngestion(client, {
      sourceId,
      initiatedBy,
      environment,
      runType,
      fixture,
      liveAllowed,
      maxItems,
      existingRunId: runId,
      triggerType,
      attemptNumber,
    });
  }

  const failure = classifyFailure(result.errorSummary);
  const succeeded = result.status === 'COMPLETED' || result.status === 'PARTIAL';

  if (op) {
    const failures = succeeded ? 0 : (op.consecutive_failures || 0) + 1;
    await updateOperationsAfterRun(client, ids.sourceUuid, {
      succeeded,
      consecutiveFailures: failures,
      threshold: op.consecutive_failure_threshold,
      staleAfterMinutes: op.stale_after_minutes,
    });

    const interval = op.interval_minutes || 60;
    await client.query(
      `update regulatory_source_operations set next_run_at = now() + ($2 || ' minutes')::interval, updated_at = now()
       where source_id = $1`,
      [ids.sourceUuid, String(interval)],
    );

    if (!succeeded) {
      await upsertOperationalAlert(client, {
        category: 'INGESTION_FAILURE',
        severity: failures >= op.consecutive_failure_threshold ? 'HIGH' : 'WARNING',
        sourceId: ids.sourceUuid,
        ingestionRunId: runId,
        dedupeKey: `ingestion_failure:${ids.sourceUuid}`,
        title: `Ingestion failure: ${sourceId}`,
        message: result.errorSummary || 'unknown',
      });
      await recordNotificationEvent(client, {
        eventType: failures >= 2 ? 'INGESTION_REPEATED_FAILURE' : 'SOURCE_FAILURE',
        sourceId: ids.sourceUuid,
        ingestionRunId: runId,
        payload: { sourceId, error: result.errorSummary, attemptNumber },
      });

      if (failure.retryable && attemptNumber < (op.max_retries || 3)) {
        const nextRetry = computeNextRetryAt(attemptNumber, op.retry_backoff_seconds || 60);
        await client.query(
          `update ingestion_runs set next_retry_at = $2::timestamptz, failure_class = $3 where id = $1`,
          [runId, nextRetry, failure.class],
        );
      }
    } else {
      await resolveAlertsForSource(client, ids.sourceUuid, 'INGESTION_FAILURE');
      await recordNotificationEvent(client, {
        eventType: 'SOURCE_RECOVERY',
        sourceId: ids.sourceUuid,
        ingestionRunId: runId,
        payload: { sourceId },
      });
      if (result.metrics?.new > 0) {
        await recordNotificationEvent(client, {
          eventType: 'NEW_REGULATORY_PUBLICATION',
          sourceId: ids.sourceUuid,
          ingestionRunId: runId,
          payload: { sourceId, newCount: result.metrics.new },
        });
      }
    }
  }

  await client.query(`update ingestion_runs set failure_class = $2 where id = $1`, [runId, failure.class]);

  return { ...result, runId, failureClass: failure.class, retryable: failure.retryable };
}
