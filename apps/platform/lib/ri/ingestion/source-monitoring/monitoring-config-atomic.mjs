import {
  MONITORING_CONFIG_AUDIT_EVENT_TYPE,
  buildMonitoringConfigurationAuditMetadata,
  snapshotOpsRowForAudit,
} from './monitoring-config-audit.mjs';

export const ATOMIC_MONITORING_RPC_NAME = 'apply_source_monitoring_configuration_with_audit';

/**
 * In-memory transactional runner for acceptance tests (simulates PostgreSQL atomicity).
 * @param {Record<string, unknown>} store mutable { opsBySourceId, audits }
 */
export function createInMemoryAtomicMonitoringStore() {
  return {
    opsBySourceId: {},
    audits: [],
  };
}

/**
 * @param {ReturnType<typeof createInMemoryAtomicMonitoringStore>} store
 * @param {object} params
 */
export async function persistMonitoringConfigurationInTransaction(store, params) {
  const {
    sourceUuid,
    sourceExternalKey,
    operatorUserId,
    correlationId,
    nextRow,
    simulateAuditFailure = false,
    simulateConfigFailure = false,
  } = params;

  const snapshot = {
    ops: structuredClone(store.opsBySourceId),
    audits: structuredClone(store.audits),
  };

  try {
    if (simulateConfigFailure) {
      throw new Error('config_persist_failed');
    }

    const previous = store.opsBySourceId[sourceUuid] ?? null;
    const action = previous ? 'UPDATE' : 'INSERT';
    const merged = previous
      ? {
          ...previous,
          ...nextRow,
          last_success_at: previous.last_success_at,
          last_failure_at: previous.last_failure_at,
          consecutive_failures: previous.consecutive_failures,
          health_status: previous.health_status,
        }
      : { ...nextRow };

    store.opsBySourceId[sourceUuid] = merged;

    if (simulateAuditFailure) {
      throw new Error('audit_insert_failed');
    }

    const metadata = buildMonitoringConfigurationAuditMetadata({
      sourceExternalKey,
      sourceUuid,
      action,
      previousConfiguration: snapshotOpsRowForAudit(previous),
      newConfiguration: snapshotOpsRowForAudit(merged),
      operatorUserId,
      correlationId,
      outcome: 'SUCCESS',
    });

    store.audits.push({
      event_type: MONITORING_CONFIG_AUDIT_EVENT_TYPE,
      source_id: sourceUuid,
      actor_user_id: operatorUserId,
      metadata,
    });

    return { ok: true, action, row: merged };
  } catch (e) {
    store.opsBySourceId = snapshot.ops;
    store.audits = snapshot.audits;
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      rolledBack: true,
    };
  }
}

/**
 * @param {ReturnType<typeof createInMemoryAtomicMonitoringStore>} store
 * @param {string} sourceUuid
 */
export function countOpsRows(store, sourceUuid) {
  return store.opsBySourceId[sourceUuid] ? 1 : 0;
}
