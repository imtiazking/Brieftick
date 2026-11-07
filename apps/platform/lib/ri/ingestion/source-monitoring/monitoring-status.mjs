import { classifySourceMonitoringReadiness } from './readiness-classification.mjs';
import { MONITORING_STATUS, SOURCE_READINESS_CLASS } from './constants.mjs';
import { isMonitoringSuccessRecent } from './monitoring-active-recency.mjs';

/**
 * Authoritative monitoring status from configuration + execution evidence only.
 * @param {object} params
 * @param {string} params.sourceExternalKey SRC-*
 * @param {object | null | undefined} params.operations regulatory_source_operations row (subset)
 * @param {string | null | undefined} [params.latestRunStatus] latest ingestion_runs.status if known
 * @param {string | null | undefined} [params.lastAttemptAt] latest ingestion run started/completed timestamp if known
 * @param {Date} [params.now] evaluation time
 */
export function deriveMonitoringStatus(params) {
  const now = params.now ?? new Date();
  const { bucket } = classifySourceMonitoringReadiness(params.sourceExternalKey);
  if (bucket === SOURCE_READINESS_CLASS.UNSUPPORTED) {
    return {
      status: MONITORING_STATUS.UNSUPPORTED,
      label: 'Unsupported — no compatible monitoring path',
    };
  }

  const ops = params.operations;
  if (!ops) {
    return {
      status: MONITORING_STATUS.UNCONFIGURED,
      label: 'Registered — no monitoring configuration row',
    };
  }

  const explicitlyDisabled = ops.enabled === false;
  if (explicitlyDisabled) {
    return { status: MONITORING_STATUS.DISABLED, label: 'Monitoring disabled' };
  }

  const monitoringEnabled = ops.enabled === true;
  const health = String(ops.health_status ?? 'UNKNOWN').toUpperCase();
  const successRecent = isMonitoringSuccessRecent(
    ops.last_success_at,
    ops.stale_after_minutes,
    now,
  );

  if (monitoringEnabled && ops.last_success_at && !successRecent) {
    return {
      status: MONITORING_STATUS.DEGRADED,
      label: 'Monitoring success evidence is stale — not actively monitored',
    };
  }

  if (monitoringEnabled && (health === 'DEGRADED' || health === 'STALE')) {
    return { status: MONITORING_STATUS.DEGRADED, label: `Operational issue (${health})` };
  }
  if (monitoringEnabled && health === 'FAILING') {
    return { status: MONITORING_STATUS.FAILED, label: 'Latest monitoring health: failing' };
  }

  if (
    monitoringEnabled &&
    params.latestRunStatus === 'FAILED' &&
    ops.last_failure_at &&
    !ops.last_success_at
  ) {
    return { status: MONITORING_STATUS.FAILED, label: 'Latest execution failed' };
  }

  if (
    monitoringEnabled &&
    ops.last_success_at &&
    successRecent &&
    health === 'HEALTHY'
  ) {
    return {
      status: MONITORING_STATUS.ACTIVE,
      label: 'Monitoring enabled with recent verified successful retrieval',
    };
  }

  if (monitoringEnabled && ops.last_success_at && successRecent && health === 'UNKNOWN') {
    return {
      status: MONITORING_STATUS.CONFIGURED,
      label: 'Recent success recorded — health confirmation pending (not active)',
    };
  }

  if (
    monitoringEnabled &&
    ops.schedule_type &&
    ops.schedule_type !== 'MANUAL_ONLY' &&
    (ops.next_run_at || ops.interval_minutes)
  ) {
    return {
      status: MONITORING_STATUS.SCHEDULED,
      label: 'Schedule configured — no successful execution recorded',
    };
  }

  if (monitoringEnabled) {
    return {
      status: MONITORING_STATUS.CONFIGURED,
      label: 'Configured — awaiting first successful execution',
    };
  }

  if (ops.last_success_at || ops.last_failure_at || params.lastAttemptAt) {
    return {
      status: MONITORING_STATUS.REGISTERED,
      label: 'Registered — historical execution without active monitoring config',
    };
  }

  return { status: MONITORING_STATUS.REGISTERED, label: 'Registered' };
}
