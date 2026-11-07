/**
 * Phase 84 — explicit ingest / connector health labels for validation and ops reporting.
 */

export const PHASE84_HEALTH = {
  HEALTHY_NEW: 'HEALTHY_NEW',
  HEALTHY_UPDATED: 'HEALTHY_UPDATED',
  HEALTHY_UNCHANGED: 'HEALTHY_UNCHANGED',
  HEALTHY_EMPTY_CONFIRMED: 'HEALTHY_EMPTY_CONFIRMED',
  CONNECTOR_FAILURE: 'CONNECTOR_FAILURE',
  ACCESS_RESTRICTED: 'ACCESS_RESTRICTED',
  PARSER_FAILURE: 'PARSER_FAILURE',
  CONFIGURATION_ERROR: 'CONFIGURATION_ERROR',
  UNSUPPORTED: 'UNSUPPORTED',
};

const HEALTHY = new Set([
  PHASE84_HEALTH.HEALTHY_NEW,
  PHASE84_HEALTH.HEALTHY_UPDATED,
  PHASE84_HEALTH.HEALTHY_UNCHANGED,
  PHASE84_HEALTH.HEALTHY_EMPTY_CONFIRMED,
]);

/**
 * @param {object} input
 * @param {object} [input.run] ingest run result
 * @param {object} [input.probe] connector.verify summary fields
 * @param {string} [input.preflightError]
 */
export function classifyPhase84Health(input = {}) {
  const { run, probe, preflightError } = input;
  const summaryStatus = probe?.summaryStatus || probe?.verificationStatus || null;
  const summaryError = probe?.summaryError || probe?.error || null;

  if (preflightError) {
    if (String(preflightError).includes('unexpected_mode')) {
      return { health: PHASE84_HEALTH.CONFIGURATION_ERROR, validationPass: false, reason: preflightError };
    }
    return { health: PHASE84_HEALTH.CONFIGURATION_ERROR, validationPass: false, reason: preflightError };
  }

  if (summaryStatus === 'ACCESS_RESTRICTED' || String(summaryError).includes('403')) {
    return { health: PHASE84_HEALTH.ACCESS_RESTRICTED, validationPass: false, reason: summaryError || 'HTTP 403' };
  }

  if (summaryStatus === 'UNSUPPORTED_SOURCE_FORMAT' || summaryStatus === 'UNSUPPORTED') {
    return {
      health: PHASE84_HEALTH.PARSER_FAILURE,
      validationPass: false,
      reason: summaryError || 'parse_or_format_failure',
    };
  }

  if (!run) {
    return { health: PHASE84_HEALTH.CONNECTOR_FAILURE, validationPass: false, reason: 'no_run' };
  }

  if (run.status === 'FAILED' || run.errorSummary) {
    const reason = run.errorSummary || 'run_failed';
    if (String(reason).includes('ineligible') || String(reason).includes('coverage_status')) {
      return { health: PHASE84_HEALTH.CONFIGURATION_ERROR, validationPass: false, reason };
    }
    if (String(reason).includes('403') || String(reason).includes('ACCESS')) {
      return { health: PHASE84_HEALTH.ACCESS_RESTRICTED, validationPass: false, reason };
    }
    return { health: PHASE84_HEALTH.CONNECTOR_FAILURE, validationPass: false, reason };
  }

  const m = run.metrics || {};
  const discovered = m.discovered ?? 0;
  const n = m.new ?? 0;
  const u = m.updated ?? 0;
  const unch = m.unchanged ?? 0;
  const failed = m.failed ?? 0;

  if (failed > 0) {
    return { health: PHASE84_HEALTH.CONNECTOR_FAILURE, validationPass: false, reason: 'item_failures' };
  }

  if (n > 0) {
    return { health: PHASE84_HEALTH.HEALTHY_NEW, validationPass: true, reason: null };
  }
  if (u > 0) {
    return { health: PHASE84_HEALTH.HEALTHY_UPDATED, validationPass: true, reason: null };
  }
  if (unch > 0) {
    return { health: PHASE84_HEALTH.HEALTHY_UNCHANGED, validationPass: true, reason: null };
  }

  if (discovered === 0) {
    const feedOk =
      summaryStatus === 'LIVE_VERIFIED' ||
      (probe?.pubCount === 0 && probe?.summaryError?.includes('empty feed'));
    if (feedOk && probe?.httpStatus === 200) {
      return {
        health: PHASE84_HEALTH.HEALTHY_EMPTY_CONFIRMED,
        validationPass: true,
        reason: 'feed_or_listing_reachable_no_new_items',
      };
    }
    return { health: PHASE84_HEALTH.CONNECTOR_FAILURE, validationPass: false, reason: 'zero_discovered_no_parse_proof' };
  }

  return { health: PHASE84_HEALTH.CONNECTOR_FAILURE, validationPass: false, reason: 'unexpected_metrics' };
}

export function isHealthyPhase84Health(health) {
  return HEALTHY.has(health);
}
