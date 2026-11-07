import { SOURCE_INTEGRATION_BY_ID } from '../../../../../../packages/reference-data/catalogue/source-integration.mjs';
import { SOURCE_COVERAGE_BY_ID } from '../../../../../../packages/reference-data/catalogue/source-coverage.mjs';
import { getSourceById } from '../../../../../../packages/reference-data/index.mjs';
import { assessSourceIngestionEligibility } from '../eligibility.mjs';
import { getProductionConnectorForSource } from './connector-index.mjs';
import { SOURCE_READINESS_CLASS } from './constants.mjs';

const VALIDATION_STATUSES = new Set([
  'RESEARCH_REQUIRED',
  'ACCESS_RESTRICTED',
  'RETRIEVAL_FAILED',
  'NOT_TESTED',
]);

/**
 * @param {string} sourceId
 * @returns {{ bucket: string, reason: string }}
 */
export function classifySourceMonitoringReadiness(sourceId) {
  const catalogue = getSourceById(sourceId);
  if (!catalogue) {
    return { bucket: SOURCE_READINESS_CLASS.UNSUPPORTED, reason: 'unknown_source_id' };
  }

  const coverage = SOURCE_COVERAGE_BY_ID[sourceId];
  if (!coverage) {
    return { bucket: SOURCE_READINESS_CLASS.UNSUPPORTED, reason: 'missing_coverage_metadata' };
  }

  if ((coverage.contentClasses || []).includes('SANCTIONS_DATA')) {
    return { bucket: SOURCE_READINESS_CLASS.UNSUPPORTED, reason: 'sanctions_data_not_ri_monitoring' };
  }

  const eligibility = assessSourceIngestionEligibility(sourceId, {
    ingestionMode: 'TEST_ONLY',
    productionStatus: catalogue.integration?.productionStatus,
  });
  if (eligibility.reason === 'sanctions_data_fc_only') {
    return { bucket: SOURCE_READINESS_CLASS.UNSUPPORTED, reason: eligibility.reason };
  }

  const integration = SOURCE_INTEGRATION_BY_ID[sourceId] ?? catalogue.integration;
  const verificationStatus = integration?.verificationStatus ?? 'NOT_TESTED';
  const connector = getProductionConnectorForSource(sourceId);

  if (!connector) {
    if (verificationStatus === 'RETRIEVAL_FAILED') {
      return { bucket: SOURCE_READINESS_CLASS.UNSUPPORTED, reason: 'retrieval_failed_no_connector' };
    }
    return { bucket: SOURCE_READINESS_CLASS.REQUIRES_CONNECTOR_WORK, reason: 'no_production_connector' };
  }

  if (VALIDATION_STATUSES.has(verificationStatus)) {
    return { bucket: SOURCE_READINESS_CLASS.REQUIRES_VALIDATION, reason: `verification_${verificationStatus}` };
  }

  if (coverage.coverageVerificationStatus !== 'COVERAGE_VERIFIED') {
    return {
      bucket: SOURCE_READINESS_CLASS.REQUIRES_VALIDATION,
      reason: `coverage_${coverage.coverageVerificationStatus}`,
    };
  }

  if (verificationStatus !== 'LIVE_VERIFIED') {
    return {
      bucket: SOURCE_READINESS_CLASS.REQUIRES_VALIDATION,
      reason: `verification_${verificationStatus}`,
    };
  }

  return { bucket: SOURCE_READINESS_CLASS.READY_FOR_CONFIGURATION, reason: 'connector_and_coverage_verified' };
}
