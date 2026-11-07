import 'server-only';

import type { GlobalRegulatorySourceRow } from '@/lib/ri/services/reference-catalogue';
import { deriveMonitoringStatus } from '@/lib/ri/ingestion/source-monitoring/monitoring-status.mjs';
import { classifySourceMonitoringReadiness } from '@/lib/ri/ingestion/source-monitoring/readiness-classification.mjs';
import { getProductionConnectorForSource } from '@/lib/ri/ingestion/source-monitoring/connector-index.mjs';

export type LabSourceMonitoringState =
  | 'registered'
  | 'unconfigured'
  | 'configured'
  | 'disabled'
  | 'scheduled'
  | 'active'
  | 'degraded'
  | 'failed'
  | 'unsupported'
  | 'not_yet_monitored';

export type LabRegulatorySourceView = {
  id: string;
  externalKey: string;
  name: string;
  regulatorAcronym: string | null;
  regulatorName: string | null;
  productionStatus: string;
  ingestionMode: string | null;
  monitoringState: LabSourceMonitoringState;
  monitoringLabel: string;
  connectorEnabled: boolean | null;
  healthStatus: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  nextRunAt: string | null;
  scheduleType: string | null;
  ingestionEligible: boolean;
  eligibilityReason: string | null;
  readinessBucket: string | null;
  connectorId: string | null;
  _connected: true;
};

export type LabIngestionRunView = {
  id: string;
  sourceKey: string | null;
  sourceName: string | null;
  runType: string;
  status: string;
  triggerType: string | null;
  startedAt: string | null;
  completedAt: string | null;
  recordsDiscovered: number | null;
  recordsNew: number | null;
  recordsFailed: number | null;
  errorSummary: string | null;
  failureClass: string | null;
  _connected: true;
};

export type LabOperationalAlertView = {
  id: string;
  category: string;
  severity: string;
  status: string;
  title: string;
  message: string | null;
  lastSeenAt: string;
  sourceKey: string | null;
  _connected: true;
};

export type LabOperationsMetricsView = {
  regulatorCount: number;
  sourceCount: number;
  catalogueSourceCount: number | null;
  sourcesWithOperationsRow: number | null;
  sourcesEnabled: number | null;
  ingestionRunCountVisible: number | null;
  operationalAlertCount: number;
  ingestionRestricted: boolean;
  operationsVisibility: 'platform_operator' | 'restricted';
  snapshotsRestricted: boolean;
  notificationsRestricted: boolean;
  monitoringSummary: import('@/lib/ri/services/source-monitoring-config').SourceMonitoringSummaryView | null;
  _connected: true;
};

function deriveMonitoringState(params: {
  operations: {
    enabled?: boolean;
    health_status?: string;
    last_success_at?: string | null;
    last_failure_at?: string | null;
    schedule_type?: string | null;
    next_run_at?: string | null;
    interval_minutes?: number | null;
  } | null;
  sourceExternalKey: string;
}): { state: LabSourceMonitoringState; label: string } {
  const { status, label } = deriveMonitoringStatus({
    sourceExternalKey: params.sourceExternalKey,
    operations: params.operations,
  });
  if (status === 'unconfigured') {
    return { state: 'not_yet_monitored', label };
  }
  return { state: status as LabSourceMonitoringState, label };
}

export function mapAdminSourceRowToLabView(row: {
  id: string;
  external_key: string;
  name: string;
  production_status: string;
  ingestion_mode: string | null;
  regulator?: { acronym?: string; name?: string } | null;
  operations?: {
    enabled?: boolean;
    health_status?: string;
    last_success_at?: string | null;
    last_failure_at?: string | null;
    next_run_at?: string | null;
    schedule_type?: string | null;
  } | null;
  ingestionEligible?: boolean;
  eligibilityReason?: string | null;
}): LabRegulatorySourceView {
  const { state, label } = deriveMonitoringState({
    operations: row.operations ?? null,
    sourceExternalKey: row.external_key,
  });
  const readiness = classifySourceMonitoringReadiness(row.external_key);
  const connector = getProductionConnectorForSource(row.external_key);
  return {
    id: row.id,
    externalKey: row.external_key,
    name: row.name,
    regulatorAcronym: row.regulator?.acronym ?? null,
    regulatorName: row.regulator?.name ?? null,
    productionStatus: row.production_status,
    ingestionMode: row.ingestion_mode,
    monitoringState: state,
    monitoringLabel: label,
    connectorEnabled: row.operations?.enabled ?? null,
    healthStatus: row.operations?.health_status ?? null,
    lastSuccessAt: row.operations?.last_success_at ?? null,
    lastFailureAt: row.operations?.last_failure_at ?? null,
    nextRunAt: row.operations?.next_run_at ?? null,
    scheduleType: row.operations?.schedule_type ?? null,
    ingestionEligible: Boolean(row.ingestionEligible),
    eligibilityReason: row.eligibilityReason ?? null,
    readinessBucket: readiness.bucket,
    connectorId: connector?.connectorId ?? null,
    _connected: true,
  };
}

export function mapIngestionRunRowToLabView(row: Record<string, unknown>): LabIngestionRunView {
  const source = row.source as { external_key?: string; name?: string } | null;
  return {
    id: String(row.id),
    sourceKey: source?.external_key ?? null,
    sourceName: source?.name ?? null,
    runType: String(row.run_type ?? '—'),
    status: String(row.status ?? '—'),
    triggerType: (row.trigger_type as string) ?? null,
    startedAt: (row.started_at as string) ?? null,
    completedAt: (row.completed_at as string) ?? null,
    recordsDiscovered: (row.records_discovered as number) ?? null,
    recordsNew: (row.records_new as number) ?? null,
    recordsFailed: (row.records_failed as number) ?? null,
    errorSummary: (row.error_summary as string) ?? null,
    failureClass: (row.failure_class as string) ?? null,
    _connected: true,
  };
}

export function mapOperationalAlertToLabView(row: Record<string, unknown>): LabOperationalAlertView {
  const source = row.source as { external_key?: string } | null;
  return {
    id: String(row.id),
    category: String(row.category ?? '—'),
    severity: String(row.severity ?? '—'),
    status: String(row.status ?? '—'),
    title: String(row.title ?? ''),
    message: (row.message as string) ?? null,
    lastSeenAt: String(row.last_seen_at ?? row.first_seen_at ?? ''),
    sourceKey: source?.external_key ?? null,
    _connected: true,
  };
}

export function buildLabOperationsMetrics(params: {
  regulators: number;
  sources: GlobalRegulatorySourceRow[] | LabRegulatorySourceView[];
  runsVisible: number;
  alertsVisible: number;
  ingestionRestricted: boolean;
  monitoringSummary?: import('@/lib/ri/services/source-monitoring-config').SourceMonitoringSummaryView | null;
}): LabOperationsMetricsView {
  const sourceList = params.sources;
  const opsRestricted = params.monitoringSummary?.operationsVisibility === 'restricted';
  const withOps = sourceList.filter(
    (s) => 'monitoringState' in s && s.monitoringState !== 'not_yet_monitored',
  ).length;
  const enabled = sourceList.filter(
    (s) => 'connectorEnabled' in s && s.connectorEnabled === true,
  ).length;
  const catalogueCount = params.monitoringSummary?.catalogueSourceCount ?? null;
  return {
    regulatorCount: params.regulators,
    sourceCount: catalogueCount ?? sourceList.length,
    catalogueSourceCount: catalogueCount,
    sourcesWithOperationsRow: opsRestricted ? null : withOps,
    sourcesEnabled: opsRestricted ? null : enabled,
    ingestionRunCountVisible: opsRestricted ? null : params.runsVisible,
    operationalAlertCount: params.alertsVisible,
    ingestionRestricted: params.ingestionRestricted,
    operationsVisibility: opsRestricted ? 'restricted' : 'platform_operator',
    snapshotsRestricted: true,
    notificationsRestricted: true,
    monitoringSummary: params.monitoringSummary ?? null,
    _connected: true,
  };
}
