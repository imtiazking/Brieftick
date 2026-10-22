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
 * @param {{ ingestionMode?: string, productionStatus?: string }} [dbSource]
 */
export function assessSourceIngestionEligibility(sourceId, dbSource = {}) {
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

  if (coverage.coverageVerificationStatus !== 'COVERAGE_VERIFIED') {
    return {
      eligible: false,
      reason: `coverage_status_${coverage.coverageVerificationStatus}`,
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

  const mode = dbSource.ingestionMode || 'DISABLED';
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
