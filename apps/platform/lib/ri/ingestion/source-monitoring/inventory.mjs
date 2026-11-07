import { REGULATORY_SOURCES } from '../../../../../../packages/reference-data/index.mjs';
import { classifySourceMonitoringReadiness } from './readiness-classification.mjs';
import { getProductionConnectorForSource } from './connector-index.mjs';
import { deriveMonitoringStatus } from './monitoring-status.mjs';
import { SOURCE_READINESS_CLASS } from './constants.mjs';

/**
 * @param {object} [options]
 * @param {Map<string, object> | Record<string, object>} [options.operationsByExternalKey]
 * @param {Map<string, { status?: string, completed_at?: string }>} [options.latestRunByExternalKey]
 */
export function buildSourceMonitoringInventory(options = {}) {
  const opsMap =
    options.operationsByExternalKey instanceof Map
      ? options.operationsByExternalKey
      : new Map(Object.entries(options.operationsByExternalKey || {}));

  const runMap =
    options.latestRunByExternalKey instanceof Map
      ? options.latestRunByExternalKey
      : new Map(Object.entries(options.latestRunByExternalKey || {}));

  const summary = {
    total: 0,
    readyForConfiguration: 0,
    requiresConnectorWork: 0,
    requiresValidation: 0,
    unsupported: 0,
    withConnector: 0,
  };

  const sources = REGULATORY_SOURCES.map((record) => {
    const sourceId = record.sourceId;
    const { bucket, reason } = classifySourceMonitoringReadiness(sourceId);
    summary.total += 1;
    if (bucket === SOURCE_READINESS_CLASS.READY_FOR_CONFIGURATION) summary.readyForConfiguration += 1;
    else if (bucket === SOURCE_READINESS_CLASS.REQUIRES_CONNECTOR_WORK) summary.requiresConnectorWork += 1;
    else if (bucket === SOURCE_READINESS_CLASS.REQUIRES_VALIDATION) summary.requiresValidation += 1;
    else summary.unsupported += 1;

    const connector = getProductionConnectorForSource(sourceId);
    if (connector) summary.withConnector += 1;

    const ops = opsMap.get(sourceId) ?? null;
    const latestRun = runMap.get(sourceId);
    const monitoring = deriveMonitoringStatus({
      sourceExternalKey: sourceId,
      operations: ops,
      latestRunStatus: latestRun?.status,
    });

    return {
      sourceId,
      regulatorId: record.regulatorId,
      regulatorName: record.regulatorName,
      acronym: record.acronym,
      jurisdiction: record.jurisdiction,
      sourceType: record.sourceType,
      officialUrl:
        record.integration?.canonicalRegulatoryContentUrl ||
        record.officialBaseUrl ||
        null,
      authenticationRequirement: record.authenticationRequirement || 'none',
      connectorId: connector?.connectorId ?? null,
      retrievalMethod: connector?.retrievalMethod ?? record.integration?.verifiedRetrievalMethod ?? null,
      readinessBucket: bucket,
      readinessReason: reason,
      verificationStatus: record.integration?.verificationStatus ?? 'NOT_TESTED',
      coverageVerificationStatus: record.integration?.coverageVerificationStatus ?? 'NOT_TESTED',
      monitoringStatus: monitoring.status,
      monitoringLabel: monitoring.label,
      operationsPresent: Boolean(ops),
      lastSuccessAt: ops?.last_success_at ?? null,
      lastFailureAt: ops?.last_failure_at ?? null,
      latestIngestionRunStatus: latestRun?.status ?? null,
      accessNotes: record.integration?.accessNotes ?? record.notes ?? null,
    };
  });

  return { summary, sources };
}

export function aggregateMonitoringConfigurationCounts(inventorySources) {
  let configured = 0;
  let active = 0;
  let disabled = 0;
  let failed = 0;
  let scheduled = 0;
  let unconfigured = 0;

  for (const s of inventorySources) {
    switch (s.monitoringStatus) {
      case 'active':
        active += 1;
        configured += 1;
        break;
      case 'configured':
      case 'scheduled':
        configured += 1;
        if (s.monitoringStatus === 'scheduled') scheduled += 1;
        break;
      case 'disabled':
        disabled += 1;
        configured += 1;
        break;
      case 'failed':
      case 'degraded':
        failed += 1;
        configured += 1;
        break;
      case 'unconfigured':
        unconfigured += 1;
        break;
      default:
        break;
    }
  }

  return { configured, active, disabled, failed, scheduled, unconfigured };
}
