/**
 * Authoritative TEST_ONLY side-effect matrix (code-derived; Step 83C.1).
 * Does not change ingestion_mode enum semantics.
 */

export const TEST_ONLY_SIDE_EFFECT_MATRIX = {
  regulatorySourcesIngestionMode: {
    when: 'regulatory_sources.ingestion_mode = TEST_ONLY',
    effect: 'Passes assessSourceIngestionEligibility (not treated as DISABLED)',
  },
  opsIngestionMode: {
    when: 'regulatory_source_operations.ingestion_mode = TEST_ONLY',
    effect: 'Scheduler tick may select row when enabled=true (scheduler not activated in pilot)',
  },
  externalHttp: {
    when: 'runSourceIngestion / executeIngestionForSource with liveAllowed=false (default)',
    effect: 'Connectors return empty/live-not-enabled — no regulator HTTP',
  },
  externalHttpWhenLive: {
    when: 'liveAllowed=true (e.g. ri-ingest --live)',
    effect: 'Official connector HTTP may occur subject to URL safety and rate limits',
  },
  databaseWrites: {
    when: 'Eligible run completes processDocument path',
    effect: 'May INSERT/UPDATE regulatory_publications, versions, ingestion_runs/items, snapshots (policy), extraction revisions (pipeline)',
  },
  publicationCreation: {
    when: 'New canonical document discovered',
    effect: 'Yes — global catalogue rows when normalisation succeeds',
  },
  snapshotCreation: {
    when: 'isSnapshotPolicyEnabled(doc)',
    effect: 'Yes — storage upload + regulatory_source_snapshots when policy requires',
  },
  extractionCreation: {
    when: 'Primary PDF / extraction pipeline engaged',
    effect: 'Yes for supported publication profiles (separate from monitoring config)',
  },
  operationalEvents: {
    when: 'Runs and health transitions',
    effect: 'ingestion_operational_events via health/scheduler audit paths',
  },
  notificationEvents: {
    when: 'executeIngestionForSource success/failure (default)',
    effect: 'May INSERT notification_events (platform-operator RLS)',
    pilotNote:
      'Set RI_INGEST_SUPPRESS_NOTIFICATION_EVENTS=true on executor/CLI path to skip notification_events during pilot runs',
  },
  retryBehaviour: {
    when: 'Failed run with retryable failure_class',
    effect: 'next_retry_at when attempt_number < max_retries on ops row (pilot proposes max_retries=0)',
  },
};

export function assertTestOnlyMatrixComplete() {
  const required = [
    'externalHttp',
    'databaseWrites',
    'notificationEvents',
    'retryBehaviour',
  ];
  for (const key of required) {
    if (!TEST_ONLY_SIDE_EFFECT_MATRIX[key]) return false;
  }
  return true;
}
