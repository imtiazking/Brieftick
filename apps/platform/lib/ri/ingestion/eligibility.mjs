import { getSourceById } from '../../../../../packages/reference-data/index.mjs';
import { SOURCE_COVERAGE_BY_ID } from '../../../../../packages/reference-data/catalogue/source-coverage.mjs';
import { validateRiUseGating } from '../../../../../packages/reference-data/catalogue/source-content-gating.mjs';

const OBLIGATION_GRADE_CLASSES = new Set([
  'RULEBOOK',
  'PRIMARY_LEGISLATION',
  'SECONDARY_LEGISLATION',
  'CONSULTATION',
  'POLICY_STATEMENT',
  'SUPERVISORY_GUIDANCE',
  'REGULATORY_NOTICE',
  'GENERAL_LICENCE',
  'SANCTIONS_POLICY',
  'STANDARD',
  'FRAMEWORK',
  'CIRCULAR',
]);

const HORIZON_ONLY_CLASSES = new Set(['NEWS', 'PRESS_RELEASE', 'ENFORCEMENT']);

/**
 * @param {string} sourceId SRC-*
 * @param {{ ingestionMode?: string, productionStatus?: string, monitoringEnabled?: boolean, lastSuccessAt?: string | null }} [dbSource]
 * @param {{ triggerType?: string, allowPhase84ManualCoverageBypass?: boolean }} [context]
 */
export function assessSourceIngestionEligibility(sourceId, dbSource = {}, context = {}) {
  const catalogue = getSourceById(sourceId);
  if (!catalogue) {
    return { eligible: false, reason: 'unknown_source_id', obligationGrade: false };
  }

  const coverage = SOURCE_COVERAGE_BY_ID[sourceId];
  if (!coverage) {
    return { eligible: false, reason: 'missing_coverage_metadata', obligationGrade: false };
  }

  const classes = coverage.contentClasses || [];
  if (classes.includes('SANCTIONS_DATA')) {
    return { eligible: false, reason: 'sanctions_data_fc_only', obligationGrade: false };
  }

  const mode = dbSource.ingestionMode || 'DISABLED';
  const triggerType = context.triggerType || 'MANUAL';
  const stagingEnv =
    process.env.FORGENIQ_INGEST_ENV === 'staging' || process.env.FORGENIQ_ENV === 'staging';

  /** Supervised Phase 84 validation only — never set on hosted cron. */
  const phase84ManualBypass =
    context.allowPhase84ManualCoverageBypass === true &&
    process.env.FORGENIQ_PHASE84_LIVE_VALIDATION === 'true' &&
    stagingEnv &&
    triggerType === 'MANUAL' &&
    (mode === 'TEST_ONLY' || mode === 'ENABLED');

  /**
   * Staging scheduled monitoring: requires prior successful live ingest (last_success_at).
   * Does not apply FORGENIQ_PHASE84_LIVE_VALIDATION bypass to unattended ticks.
   */
  const stagingScheduledMonitored =
    stagingEnv &&
    triggerType === 'SCHEDULED' &&
    mode === 'ENABLED' &&
    dbSource.monitoringEnabled === true &&
    Boolean(dbSource.lastSuccessAt);

  if (
    !phase84ManualBypass &&
    !stagingScheduledMonitored &&
    coverage.coverageVerificationStatus !== 'COVERAGE_VERIFIED'
  ) {
    return {
      eligible: false,
      reason: `coverage_status_${coverage.coverageVerificationStatus}`,
      obligationGrade: false,
    };
  }

  if (
    stagingEnv &&
    triggerType === 'SCHEDULED' &&
    mode === 'ENABLED' &&
    dbSource.monitoringEnabled === true &&
    !dbSource.lastSuccessAt
  ) {
    return {
      eligible: false,
      reason: 'scheduled_requires_prior_successful_ingest',
      obligationGrade: false,
    };
  }

  const gating = validateRiUseGating(classes, coverage.riUseCases || []);
  if (!gating.ok) {
    return { eligible: false, reason: gating.violations.join('; '), obligationGrade: false };
  }

  const onlyHorizon =
    classes.length > 0 && classes.every((c) => HORIZON_ONLY_CLASSES.has(c));
  const obligationGrade = classes.some((c) => OBLIGATION_GRADE_CLASSES.has(c));

  if (mode === 'DISABLED') {
    return {
      eligible: false,
      reason: 'ingestion_mode_disabled',
      obligationGrade,
      horizonOnly: onlyHorizon,
    };
  }

  const prod = dbSource.productionStatus || catalogue.integration?.productionStatus;
  if (prod === 'ENABLED' && mode !== 'ENABLED') {
    return { eligible: false, reason: 'production_status_mismatch', obligationGrade };
  }

  return {
    eligible: true,
    reason: null,
    obligationGrade,
    horizonOnly: onlyHorizon,
    contentClasses: classes,
    riUseCases: coverage.riUseCases || [],
  };
}
