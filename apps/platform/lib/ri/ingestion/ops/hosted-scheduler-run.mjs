import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { runSchedulerTick, selectDueSources, STALE_RUNNING_RUN_MINUTES } from './scheduler.mjs';
import { recordOperationalAudit } from './audit.mjs';
import {
  stagingPgClientOptions,
  validateStagingDatabaseUrl,
} from '../snapshot/staging-database-config.mjs';
import { FORGENIQ_RI_STAGING_PROJECT_REF } from '../snapshot/staging-constants.mjs';
import {
  isSourceAllowedForHostedScheduler,
  HOSTED_SCHEDULER_EXCLUDED_SOURCE_IDS,
} from './hosted-scheduler-allowlist.mjs';
import { getProductionConnectorForSource } from '../source-monitoring/connector-index.mjs';

const DEFAULT_BATCH = 5;

/**
 * Resolve staging ingest DB URL for hosted scheduler (server-side only).
 */
export function resolveHostedSchedulerDatabaseUrl() {
  for (const key of ['STAGING_DATABASE_URL', 'FORGENIQ_LOCAL_PG_URL', 'DATABASE_URL']) {
    const v = process.env[key]?.trim();
    if (v) return v;
  }
  throw new Error('hosted_scheduler_database_url_missing');
}

/**
 * Hard gates before any hosted tick (no Phase 84 manual bypass env).
 */
export function isHostedSchedulerEnabled() {
  return process.env.FORGENIQ_RI_SCHEDULER_CRON_ENABLED === 'true';
}

/**
 * @param {{ requireEnabled?: boolean }} [options] — requireEnabled=false only for the read-only plan.
 */
export function assertHostedSchedulerEnvironment(options = {}) {
  if (options.requireEnabled !== false && !isHostedSchedulerEnabled()) {
    throw new Error('hosted_scheduler_disabled');
  }
  const ingestEnv = process.env.FORGENIQ_INGEST_ENV?.trim() || process.env.FORGENIQ_ENV?.trim();
  if (ingestEnv !== 'staging') {
    throw new Error('hosted_scheduler_requires_staging_env');
  }
  if (process.env.FORGENIQ_PHASE84_LIVE_VALIDATION === 'true') {
    throw new Error('hosted_scheduler_phase84_bypass_forbidden');
  }
  const url = resolveHostedSchedulerDatabaseUrl();
  const validated = validateStagingDatabaseUrl(url);
  if (validated.projectRef !== FORGENIQ_RI_STAGING_PROJECT_REF) {
    throw new Error('hosted_scheduler_wrong_supabase_project');
  }
  return { databaseUrl: url, projectRef: validated.projectRef };
}

/**
 * Scheduler auth: CRON_SECRET Bearer only for every invocation (including audit label VERCEL_CRON).
 * Platform User-Agent / x-vercel-cron-schedule are audit signals only — never credentials.
 *
 * @param {object} params
 * @param {'VERCEL_CRON' | 'MANUAL_HOSTED'} params.invocationKind — audit label only
 * @param {string} [params.cronSecretFromRequest]
 * @param {object} [params.platformSignals] — Vercel platform headers (audit evidence, not auth)
 */
export function assertHostedSchedulerRequestAuth(params) {
  const expectedSecret = process.env.CRON_SECRET?.trim();
  if (!expectedSecret || expectedSecret.length < 16) {
    throw new Error('hosted_scheduler_cron_secret_missing_or_weak');
  }

  const bearer = params.cronSecretFromRequest?.trim();
  if (!bearer || bearer !== expectedSecret) {
    throw new Error('hosted_scheduler_unauthorized');
  }
}

/**
 * @param {object} params
 * @param {'VERCEL_CRON' | 'MANUAL_HOSTED'} params.invocationKind
 * @param {string} [params.cronSecretFromRequest]
 * @param {object} [params.platformSignals]
 */
export async function runHostedSchedulerInvocation(params) {
  const { invocationKind, platformSignals } = params;

  assertHostedSchedulerRequestAuth(params);

  const { databaseUrl } = assertHostedSchedulerEnvironment();

  process.env.FORGENIQ_ENV = 'staging';
  process.env.FORGENIQ_INGEST_ENV = 'staging';
  delete process.env.FORGENIQ_PHASE84_LIVE_VALIDATION;
  if (process.env.RI_INGEST_SUPPRESS_NOTIFICATION_EVENTS == null) {
    process.env.RI_INGEST_SUPPRESS_NOTIFICATION_EVENTS = 'false';
  }
  delete process.env.FORGENIQ_STAGING_UAT_INTAKE_NOTIFY;

  const invocationId = randomUUID();
  const maxSourcesPerTick = resolveHostedSchedulerBatchSize();

  const client = new pg.Client(stagingPgClientOptions(databaseUrl));
  await client.connect();

  try {
    await recordOperationalAudit(client, {
      eventType: 'HOSTED_SCHEDULER_INVOCATION',
      actorUserId: 'system:hosted-scheduler',
      metadata: {
        invocationId,
        invocationKind,
        maxSourcesPerTick,
        at: new Date().toISOString(),
        ...(platformSignals ? { platformSignals } : {}),
      },
    });

    const eligibleCount = await client.query(
      `select count(*)::int as n
       from regulatory_source_operations o
       join regulatory_sources s on s.id = o.source_id
       where o.enabled = true and s.ingestion_mode = 'ENABLED'::source_ingestion_mode`,
    );

    const tick = await runSchedulerTick(client, {
      environment: 'staging',
      liveAllowed: true,
      maxSourcesPerTick,
      allowSource: (sourceId) => {
        if (!isSourceAllowedForHostedScheduler(sourceId)) return false;
        if (!getProductionConnectorForSource(sourceId)) return false;
        return true;
      },
    });

    await recordOperationalAudit(client, {
      eventType: 'HOSTED_SCHEDULER_COMPLETED',
      actorUserId: 'system:hosted-scheduler',
      metadata: {
        invocationId,
        invocationKind,
        dueCount: tick.dueCount,
        processed: tick.outcomes.length,
        ...(platformSignals ? { platformSignals } : {}),
        outcomes: tick.outcomes.map((o) => ({
          source: o.source,
          status: o.status,
          runId: o.runId,
          errorSummary: o.errorSummary,
          metrics: o.metrics,
        })),
      },
    });

    return {
      ok: true,
      invocationId,
      invocationKind,
      stagingProjectRef: FORGENIQ_RI_STAGING_PROJECT_REF,
      eligibleMonitoringCount: eligibleCount.rows[0]?.n ?? 0,
      excludedSourceCount: HOSTED_SCHEDULER_EXCLUDED_SOURCE_IDS.size,
      maxSourcesPerTick,
      ...tick,
    };
  } catch (err) {
    await recordOperationalAudit(client, {
      eventType: 'HOSTED_SCHEDULER_FAILED',
      actorUserId: 'system:hosted-scheduler',
      metadata: {
        invocationId,
        invocationKind,
        error: err instanceof Error ? err.message : String(err),
      },
    }).catch(() => {});
    throw err;
  } finally {
    await client.end();
  }
}

function resolveHostedSchedulerBatchSize() {
  return Number(process.env.FORGENIQ_RI_SCHEDULER_BATCH_SIZE || '') || DEFAULT_BATCH;
}

/**
 * Read-only preview of the next tick: what would run, and why each source would or would not.
 * Works while the scheduler is disabled so readiness can be verified before activation.
 * Runs inside a READ ONLY transaction; writes nothing (not even audit rows).
 *
 * @param {object} params
 * @param {string} [params.cronSecretFromRequest]
 */
export async function planHostedSchedulerInvocation(params) {
  assertHostedSchedulerRequestAuth(params);
  const { databaseUrl } = assertHostedSchedulerEnvironment({ requireEnabled: false });
  const maxSourcesPerTick = resolveHostedSchedulerBatchSize();

  const client = new pg.Client(stagingPgClientOptions(databaseUrl));
  await client.connect();
  try {
    await client.query('begin transaction read only');
    const due = await selectDueSources(client, { maxSourcesPerTick });
    const staleRunning = await client.query(
      `select count(*)::int as n from ingestion_runs
       where status = 'RUNNING'::ingestion_run_status
         and started_at < now() - ($1 || ' minutes')::interval`,
      [String(STALE_RUNNING_RUN_MINUTES)],
    );
    await client.query('rollback');

    return {
      ok: true,
      dryRun: true,
      schedulerEnabled: isHostedSchedulerEnabled(),
      stagingProjectRef: FORGENIQ_RI_STAGING_PROJECT_REF,
      maxSourcesPerTick,
      staleRunningRuns: staleRunning.rows[0]?.n ?? 0,
      due: due.map((row) => {
        const allowlisted = isSourceAllowedForHostedScheduler(row.external_key);
        const hasConnector = Boolean(getProductionConnectorForSource(row.external_key));
        return {
          source: row.external_key,
          wouldRun: allowlisted && hasConnector,
          allowlisted,
          hasConnector,
          nextRunAt: row.next_run_at,
          lastSuccessAt: row.last_success_at,
          consecutiveFailures: row.consecutive_failures,
        };
      }),
    };
  } finally {
    await client.end();
  }
}
