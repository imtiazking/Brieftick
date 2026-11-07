/**
 * Step 83C — proposed FCA/PRA pilot monitoring configuration (pre-activation; not persisted).
 * Manual execution only; scheduling disabled; retries disabled at ops layer.
 */

export const PILOT_SOURCE_KEYS = ['SRC-FCA-PUBLICATIONS-RSS', 'SRC-PRA-PUBLICATIONS'];

/** @type {Record<string, import('../services/source-monitoring-config.ts').ProposedMonitoringConfiguration & { notes: string[] }>} */
export const PILOT_MONITORING_PROPOSALS = {
  'SRC-FCA-PUBLICATIONS-RSS': {
    sourceExternalKey: 'SRC-FCA-PUBLICATIONS-RSS',
    enabled: false,
    scheduleType: 'MANUAL_ONLY',
    intervalMinutes: null,
    cronExpression: null,
    ingestionMode: 'TEST_ONLY',
    timezone: 'UTC',
    maxItemsPerRun: 3,
    notes: [
      'Connector CONN-LEGACY-FCA — official RSS https://www.fca.org.uk/publications/rss.xml',
      'Live HTTP requires executor/CLI liveAllowed=true (TEST_ONLY does not imply offline-only when live is enabled).',
      'Set regulatory_sources.ingestion_mode to TEST_ONLY before first manual run (separate approval).',
    ],
  },
  'SRC-PRA-PUBLICATIONS': {
    sourceExternalKey: 'SRC-PRA-PUBLICATIONS',
    enabled: false,
    scheduleType: 'MANUAL_ONLY',
    intervalMinutes: null,
    cronExpression: null,
    ingestionMode: 'TEST_ONLY',
    timezone: 'UTC',
    maxItemsPerRun: 3,
    notes: [
      'Connector CONN-LEGACY-PRA — BoE publications listing HTML',
      'PRA maxItems connector default 5; pilot caps via max_items_per_run=3 on ops row.',
      'Live HTTP requires liveAllowed=true on execution path.',
    ],
  },
};

/**
 * Ops row extensions stored via buildMonitoringConfigurationRow (activation step).
 * @type {Record<string, { maxRetries: number, retryBackoffSeconds: number, timeoutSeconds: number }>}
 */
export const PILOT_OPS_EXECUTION_BOUNDARIES = {
  'SRC-FCA-PUBLICATIONS-RSS': {
    maxRetries: 0,
    retryBackoffSeconds: 60,
    timeoutSeconds: 120,
  },
  'SRC-PRA-PUBLICATIONS': {
    maxRetries: 0,
    retryBackoffSeconds: 60,
    timeoutSeconds: 120,
  },
};

/**
 * TEST_ONLY semantics (from code audit — not inferred):
 * - regulatory_sources.ingestion_mode TEST_ONLY: passes assessSourceIngestionEligibility (not DISABLED).
 * - Does NOT block DB writes: ingest-engine persists publications, versions, snapshots when policy requires.
 * - Does NOT enable HTTP: connectors require liveAllowed===true (executor default false; ri-ingest --live).
 * - Scheduler tick only selects ops where ingestion_mode TEST_ONLY AND enabled=true (pilot starts disabled).
 */
export const TEST_ONLY_EXECUTION_BOUNDARIES = {
  allowsDatabaseWrites: true,
  allowsExternalHttpByDefault: false,
  requiresLiveAllowedFlag: true,
  schedulerSelectsWhenEnabled: true,
};

/**
 * Pilot constraint checks (pre-activation documentation + acceptance).
 * @param {string} sourceExternalKey
 * @param {object} proposal
 */
export function assertPilotMonitoringProposalConstraints(sourceExternalKey, proposal) {
  const errors = [];
  if (!PILOT_SOURCE_KEYS.includes(sourceExternalKey)) {
    errors.push('not_pilot_source');
  }
  if (proposal.enabled !== false) errors.push('pilot_must_start_disabled');
  if (proposal.scheduleType !== 'MANUAL_ONLY') errors.push('pilot_must_be_manual_only');
  if (proposal.ingestionMode !== 'TEST_ONLY') errors.push('pilot_must_be_test_only');
  if (proposal.maxItemsPerRun != null && proposal.maxItemsPerRun > 3) errors.push('pilot_max_three_items');
  const bounds = PILOT_OPS_EXECUTION_BOUNDARIES[sourceExternalKey];
  if (!bounds || bounds.maxRetries !== 0) errors.push('pilot_max_retries_zero');
  return { ok: errors.length === 0, errors };
}
