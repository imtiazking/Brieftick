/** @typedef {'INSERT' | 'UPDATE'} MonitoringConfigAuditAction */

export const MONITORING_CONFIG_AUDIT_EVENT_TYPE = 'SOURCE_MONITORING_CONFIGURATION';

const AUDIT_OPS_FIELDS = [
  'enabled',
  'ingestion_mode',
  'schedule_type',
  'interval_minutes',
  'cron_expression',
  'timezone',
  'max_items_per_run',
  'timeout_seconds',
  'max_retries',
  'retry_backoff_seconds',
  'consecutive_failure_threshold',
  'stale_after_minutes',
  'next_run_at',
  'health_status',
];

/**
 * @param {Record<string, unknown> | null | undefined} row
 */
export function snapshotOpsRowForAudit(row) {
  if (!row) return null;
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const key of AUDIT_OPS_FIELDS) {
    if (row[key] !== undefined) out[key] = row[key];
  }
  return out;
}

/**
 * @param {object} params
 * @param {string} params.sourceExternalKey
 * @param {string} params.sourceUuid
 * @param {MonitoringConfigAuditAction} params.action
 * @param {Record<string, unknown> | null} params.previousConfiguration
 * @param {Record<string, unknown>} params.newConfiguration
 * @param {string} params.operatorUserId
 * @param {string} params.correlationId
 * @param {'SUCCESS' | 'FAILED'} params.outcome
 * @param {string | null} [params.errorDetail]
 */
export function buildMonitoringConfigurationAuditMetadata(params) {
  return {
    sourceExternalKey: params.sourceExternalKey,
    sourceUuid: params.sourceUuid,
    action: params.action,
    previousConfiguration: params.previousConfiguration,
    newConfiguration: params.newConfiguration,
    operatorUserId: params.operatorUserId,
    correlationId: params.correlationId,
    outcome: params.outcome,
    errorDetail: params.errorDetail ?? null,
    recordedAt: new Date().toISOString(),
  };
}

/**
 * Legacy non-atomic persist (Step 83C.1). Superseded by RPC in Step 83C.2.
 * Retained for unit tests demonstrating split-transaction failure modes.
 * Production must use apply_source_monitoring_configuration_with_audit RPC.
 */
export async function persistMonitoringConfigurationWithAudit(deps, params) {
  const {
    sourceUuid,
    sourceExternalKey,
    operatorUserId,
    correlationId,
    nextRow,
  } = params;

  const previous = await deps.loadPreviousOpsBySourceUuid(sourceUuid);
  const action = previous ? 'UPDATE' : 'INSERT';
  const previousSnapshot = snapshotOpsRowForAudit(previous);
  const newSnapshot = snapshotOpsRowForAudit(nextRow);

  const upsert = await deps.upsertOpsRow(nextRow);
  if (upsert.error || !upsert.data) {
    await deps.insertAuditEvent({
      sourceUuid,
      operatorUserId,
      metadata: buildMonitoringConfigurationAuditMetadata({
        sourceExternalKey,
        sourceUuid,
        action,
        previousConfiguration: previousSnapshot,
        newConfiguration: newSnapshot,
        operatorUserId,
        correlationId,
        outcome: 'FAILED',
        errorDetail: upsert.error || 'upsert_failed',
      }),
    }).catch(() => {});
    return { ok: false, error: 'persist_failed', detail: upsert.error };
  }

  const audit = await deps.insertAuditEvent({
    sourceUuid,
    operatorUserId,
    metadata: buildMonitoringConfigurationAuditMetadata({
      sourceExternalKey,
      sourceUuid,
      action,
      previousConfiguration: previousSnapshot,
      newConfiguration: snapshotOpsRowForAudit(upsert.data),
      operatorUserId,
      correlationId,
      outcome: 'SUCCESS',
    }),
  });

  if (!audit.ok) {
    const rollback = await deps.rollbackOps(sourceUuid, previous);
    return {
      ok: false,
      error: 'audit_failed',
      detail: audit.error,
      rolledBack: rollback.ok,
    };
  }

  return {
    ok: true,
    action,
    row: upsert.data,
    previousConfiguration: previousSnapshot,
    newConfiguration: snapshotOpsRowForAudit(upsert.data),
  };
}
