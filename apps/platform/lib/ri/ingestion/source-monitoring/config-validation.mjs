import { classifySourceMonitoringReadiness } from './readiness-classification.mjs';
import { getProductionConnectorForSource } from './connector-index.mjs';
import {
  DEFAULT_MONITORING_INTERVAL_MINUTES,
  PERMITTED_MONITORING_INTERVALS_MINUTES,
  SOURCE_READINESS_CLASS,
} from './constants.mjs';

/**
 * Validate proposed monitoring configuration. Does not execute ingestion or touch connectors.
 * @param {object} input
 * @param {string} input.sourceExternalKey
 * @param {boolean} input.enabled
 * @param {'MANUAL_ONLY'|'INTERVAL'|'CRON'} input.scheduleType
 * @param {number | null | undefined} input.intervalMinutes
 * @param {string | null | undefined} input.cronExpression
 * @param {string | null | undefined} [input.ingestionMode]
 */
export function validateMonitoringConfiguration(input) {
  const errors = [];
  const warnings = [];

  const { bucket, reason } = classifySourceMonitoringReadiness(input.sourceExternalKey);
  if (bucket === SOURCE_READINESS_CLASS.UNSUPPORTED) {
    errors.push(`source_unsupported:${reason}`);
  }
  if (bucket === SOURCE_READINESS_CLASS.REQUIRES_CONNECTOR_WORK) {
    errors.push(`missing_connector:${reason}`);
  }
  if (bucket === SOURCE_READINESS_CLASS.REQUIRES_VALIDATION) {
    errors.push(`requires_validation:${reason}`);
  }

  const connector = getProductionConnectorForSource(input.sourceExternalKey);
  if (input.enabled && !connector) {
    errors.push('cannot_enable_without_connector');
  }

  const scheduleType = input.scheduleType || 'MANUAL_ONLY';
  if (!['MANUAL_ONLY', 'INTERVAL', 'CRON'].includes(scheduleType)) {
    errors.push('invalid_schedule_type');
  }

  if (scheduleType === 'INTERVAL') {
    const interval = input.intervalMinutes ?? DEFAULT_MONITORING_INTERVAL_MINUTES;
    if (!PERMITTED_MONITORING_INTERVALS_MINUTES.includes(interval)) {
      errors.push('interval_not_permitted');
    }
  }

  if (scheduleType === 'CRON') {
    if (!input.cronExpression || !input.cronExpression.trim()) {
      errors.push('cron_expression_required');
    } else {
      warnings.push('cron_activation_requires_separate_scheduler_approval');
    }
  }

  if (scheduleType === 'MANUAL_ONLY' && input.enabled) {
    warnings.push('enabled_manual_only_requires_explicit_executor_invocation');
  }

  const mode = input.ingestionMode || 'DISABLED';
  if (input.enabled && mode === 'DISABLED') {
    errors.push('enabled_requires_non_disabled_ingestion_mode');
  }
  if (mode !== 'DISABLED' && mode !== 'TEST_ONLY' && mode !== 'ENABLED') {
    errors.push('invalid_ingestion_mode');
  }
  if (mode === 'ENABLED') {
    warnings.push('production_ingestion_mode_requires_separate_production_enablement');
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    readinessBucket: bucket,
    connectorId: connector?.connectorId ?? null,
  };
}

/**
 * Normalised upsert payload for regulatory_source_operations (idempotent on source_id).
 * @param {{ sourceUuid: string, config: object }} params
 */
export function buildMonitoringConfigurationRow(params) {
  const { sourceUuid, config } = params;
  const scheduleType = config.scheduleType || 'MANUAL_ONLY';
  const intervalMinutes =
    scheduleType === 'INTERVAL'
      ? config.intervalMinutes ?? DEFAULT_MONITORING_INTERVAL_MINUTES
      : null;

  return {
    source_id: sourceUuid,
    enabled: Boolean(config.enabled),
    ingestion_mode: config.ingestionMode || 'TEST_ONLY',
    schedule_type: scheduleType,
    interval_minutes: intervalMinutes,
    cron_expression: scheduleType === 'CRON' ? config.cronExpression ?? null : null,
    timezone: config.timezone || 'UTC',
    max_items_per_run: config.maxItemsPerRun ?? 3,
    timeout_seconds: config.timeoutSeconds ?? 120,
    max_retries: config.maxRetries ?? 3,
    retry_backoff_seconds: config.retryBackoffSeconds ?? 60,
    consecutive_failure_threshold: config.consecutiveFailureThreshold ?? 3,
    stale_after_minutes: config.staleAfterMinutes ?? 10080,
    next_run_at: config.nextRunAt ?? null,
    health_status: 'UNKNOWN',
  };
}
