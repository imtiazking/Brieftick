import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { isPlatformOperator } from '@/lib/auth/platform-operator';
import {
  aggregateMonitoringConfigurationCounts,
  buildSourceMonitoringInventory,
} from '@/lib/ri/ingestion/source-monitoring/inventory.mjs';
import {
  buildMonitoringConfigurationRow,
  validateMonitoringConfiguration,
} from '@/lib/ri/ingestion/source-monitoring/config-validation.mjs';
import { deriveMonitoringStatus } from '@/lib/ri/ingestion/source-monitoring/monitoring-status.mjs';
import { listConnectorReadinessMatrix } from '@/lib/ri/ingestion/source-monitoring/connector-index.mjs';
import { listSourcesForIngestionAdmin } from '@/lib/ri/services/ingestion-admin';
import { callApplyMonitoringConfigurationRpc } from '@/lib/ri/ingestion/source-monitoring/apply-monitoring-config-rpc.mjs';

export type SourceMonitoringSummaryView = {
  catalogueSourceCount: number;
  withCompatibleConnector: number;
  readyForConfiguration: number;
  requiresConnectorWork: number;
  requiresValidation: number;
  unsupported: number;
  configuredCount: number | null;
  activeMonitoredCount: number | null;
  disabledCount: number | null;
  failedOrDegradedCount: number | null;
  scheduledCount: number | null;
  unconfiguredCount: number | null;
  operationsVisibility: 'platform_operator' | 'restricted';
  configurationWritesEnabled: boolean;
  _connected: true;
};

export function isSourceMonitoringConfigWriteEnabled(): boolean {
  return process.env.RI_SOURCE_MONITORING_CONFIG_WRITE_ENABLED === 'true';
}

/** Reference catalogue + connector registry inventory (no DB writes, no ingestion). */
export function getReferenceSourceMonitoringInventory() {
  return buildSourceMonitoringInventory();
}

export async function getSourceMonitoringSummary(
  supabase: SupabaseClient,
  options: { includeOperatorOperations?: boolean } = {},
): Promise<{
  summary: SourceMonitoringSummaryView;
  inventory: ReturnType<typeof buildSourceMonitoringInventory>;
  connectors: ReturnType<typeof listConnectorReadinessMatrix>;
}> {
  const base = buildSourceMonitoringInventory();
  const operator =
    options.includeOperatorOperations === true ? true : await isPlatformOperator();

  let inventory = base;
  if (operator) {
    const rows = await listSourcesForIngestionAdmin(supabase);
    const opsByKey = Object.fromEntries(
      rows
        .filter((r) => r.operations)
        .map((r) => [
          r.external_key,
          {
            enabled: r.operations?.enabled,
            health_status: r.operations?.health_status,
            last_success_at: r.operations?.last_success_at,
            last_failure_at: r.operations?.last_failure_at,
            next_run_at: r.operations?.next_run_at,
            schedule_type: r.operations?.schedule_type,
            interval_minutes: r.operations?.interval_minutes,
          },
        ]),
    );
    inventory = buildSourceMonitoringInventory({ operationsByExternalKey: opsByKey });
  }

  const opsCounts = operator
    ? aggregateMonitoringConfigurationCounts(inventory.sources)
    : null;

  const summary: SourceMonitoringSummaryView = {
    catalogueSourceCount: inventory.summary.total,
    withCompatibleConnector: inventory.summary.withConnector,
    readyForConfiguration: inventory.summary.readyForConfiguration,
    requiresConnectorWork: inventory.summary.requiresConnectorWork,
    requiresValidation: inventory.summary.requiresValidation,
    unsupported: inventory.summary.unsupported,
    configuredCount: opsCounts?.configured ?? null,
    activeMonitoredCount: opsCounts?.active ?? null,
    disabledCount: opsCounts?.disabled ?? null,
    failedOrDegradedCount: opsCounts?.failed ?? null,
    scheduledCount: opsCounts?.scheduled ?? null,
    unconfiguredCount: opsCounts?.unconfigured ?? null,
    operationsVisibility: operator ? 'platform_operator' : 'restricted',
    configurationWritesEnabled: isSourceMonitoringConfigWriteEnabled(),
    _connected: true,
  };

  return {
    summary,
    inventory,
    connectors: listConnectorReadinessMatrix(),
  };
}

export type ProposedMonitoringConfiguration = {
  sourceExternalKey: string;
  enabled: boolean;
  scheduleType: 'MANUAL_ONLY' | 'INTERVAL' | 'CRON';
  intervalMinutes?: number | null;
  cronExpression?: string | null;
  ingestionMode?: 'DISABLED' | 'TEST_ONLY' | 'ENABLED';
  timezone?: string;
  maxItemsPerRun?: number;
  maxRetries?: number;
};

export type ApplyMonitoringConfigurationParams = {
  input: ProposedMonitoringConfiguration;
  operatorUserId: string;
  correlationId: string;
};

export function validateProposedSourceMonitoringConfiguration(input: ProposedMonitoringConfiguration) {
  return validateMonitoringConfiguration({
    sourceExternalKey: input.sourceExternalKey,
    enabled: input.enabled,
    scheduleType: input.scheduleType,
    intervalMinutes: input.intervalMinutes,
    cronExpression: input.cronExpression,
    ingestionMode: input.ingestionMode,
  });
}

/**
 * Persist monitoring configuration atomically via PostgreSQL RPC (Step 83C.2).
 * Requires platform operator JWT, write feature flag, and applied migration
 * `apply_source_monitoring_configuration_with_audit`. Does not execute ingestion.
 */
export async function applyProposedSourceMonitoringConfiguration(
  supabase: SupabaseClient,
  input: ProposedMonitoringConfiguration,
  context: { operatorUserId: string; correlationId: string },
) {
  if (!isSourceMonitoringConfigWriteEnabled()) {
    return { ok: false as const, error: 'configuration_writes_disabled' };
  }

  const validation = validateProposedSourceMonitoringConfiguration(input);
  if (!validation.ok) {
    return { ok: false as const, error: 'validation_failed', validation };
  }

  const { data: sourceRow, error: sourceErr } = await supabase
    .from('regulatory_sources')
    .select('id, external_key')
    .eq('external_key', input.sourceExternalKey)
    .maybeSingle();

  if (sourceErr || !sourceRow) {
    return { ok: false as const, error: 'source_not_found' };
  }

  const row = buildMonitoringConfigurationRow({
    sourceUuid: sourceRow.id,
    config: {
      enabled: input.enabled,
      scheduleType: input.scheduleType,
      intervalMinutes: input.intervalMinutes,
      cronExpression: input.cronExpression,
      ingestionMode: input.ingestionMode ?? 'TEST_ONLY',
      timezone: input.timezone,
      maxItemsPerRun: input.maxItemsPerRun,
      maxRetries: input.maxRetries,
      nextRunAt: null,
    },
  });

  const outcome = await callApplyMonitoringConfigurationRpc(supabase, {
    sourceExternalKey: input.sourceExternalKey,
    sourceUuid: sourceRow.id,
    operatorUserId: context.operatorUserId,
    correlationId: context.correlationId,
    configRow: row,
  });

  if (!outcome.ok) {
    return outcome;
  }

  const status = deriveMonitoringStatus({
    sourceExternalKey: input.sourceExternalKey,
    operations: outcome.row ?? null,
  });

  return {
    ok: true as const,
    row: outcome.row,
    monitoringStatus: status,
    auditAction: outcome.action,
    correlationId: context.correlationId,
    atomic: true as const,
  };
}

export function resolveSourceToConnector(sourceExternalKey: string) {
  const validation = validateMonitoringConfiguration({
    sourceExternalKey,
    enabled: false,
    scheduleType: 'MANUAL_ONLY',
    intervalMinutes: null,
    cronExpression: null,
    ingestionMode: 'DISABLED',
  });
  return {
    connectorId: validation.connectorId,
    readinessBucket: validation.readinessBucket,
  };
}
