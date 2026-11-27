import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { assertHostedSchedulerRequestAuth, assertHostedSchedulerEnvironment } from './hosted-scheduler-run.mjs';
import { stagingPgClientOptions } from '../snapshot/staging-database-config.mjs';
import { recordOperationalAudit } from './audit.mjs';
import { runCorpusSnapshotBackfillBatch } from '../corpus/publication-snapshot-backfill.mjs';

function resolveCorpusBatchSize() {
  return Math.min(
    5,
    Math.max(1, Number(process.env.FORGENIQ_CORPUS_BACKFILL_BATCH || process.env.FORGENIQ_RI_CORPUS_BATCH || 2)),
  );
}

/**
 * @param {object} params
 * @param {'VERCEL_CRON' | 'MANUAL_HOSTED'} params.invocationKind
 * @param {string} [params.cronSecretFromRequest]
 */
export async function runHostedCorpusBackfillInvocation(params) {
  assertHostedSchedulerRequestAuth(params);
  if (process.env.FORGENIQ_CORPUS_BACKFILL_ENABLED === 'false') {
    throw new Error('corpus_backfill_disabled');
  }
  const { databaseUrl } = assertHostedSchedulerEnvironment({ requireEnabled: false });

  process.env.FORGENIQ_ENV = 'staging';
  process.env.FORGENIQ_INGEST_ENV = 'staging';

  const invocationId = randomUUID();
  const maxPublications = resolveCorpusBatchSize();
  const maxReDerives = Math.min(3, maxPublications);

  const client = new pg.Client(stagingPgClientOptions(databaseUrl));
  await client.connect();

  try {
    await recordOperationalAudit(client, {
      eventType: 'HOSTED_CORPUS_BACKFILL_INVOCATION',
      actorUserId: 'system:corpus-backfill',
      metadata: {
        invocationId,
        invocationKind: params.invocationKind,
        maxPublications,
        maxReDerives,
        at: new Date().toISOString(),
      },
    });

    const batch = await runCorpusSnapshotBackfillBatch(client, { maxPublications, maxReDerives });

    await recordOperationalAudit(client, {
      eventType: 'HOSTED_CORPUS_BACKFILL_COMPLETED',
      actorUserId: 'system:corpus-backfill',
      metadata: {
        invocationId,
        invocationKind: params.invocationKind,
        attempted: batch.attempted,
        remainingWithoutSnapshot: batch.remainingWithoutSnapshot,
        coverage: batch.coverage,
        outcomes: batch.outcomes,
      },
    });

    return {
      ok: true,
      invocationId,
      invocationKind: params.invocationKind,
      ...batch,
    };
  } catch (err) {
    await recordOperationalAudit(client, {
      eventType: 'HOSTED_CORPUS_BACKFILL_FAILED',
      actorUserId: 'system:corpus-backfill',
      metadata: {
        invocationId,
        error: err instanceof Error ? err.message : String(err),
      },
    }).catch(() => {});
    throw err;
  } finally {
    await client.end();
  }
}

export async function planHostedCorpusBackfillInvocation(params) {
  assertHostedSchedulerRequestAuth(params);
  const { databaseUrl } = assertHostedSchedulerEnvironment({ requireEnabled: false });
  const client = new pg.Client(stagingPgClientOptions(databaseUrl));
  await client.connect();
  try {
    const { selectCorpusBackfillCandidates, selectSnapshotsNeedingHtmlExtraction } = await import(
      '../corpus/select-backfill-candidates.mjs'
    );
    const maxPubs = resolveCorpusBatchSize();
    const candidates = await selectCorpusBackfillCandidates(client, maxPubs);
    const rederive = await selectSnapshotsNeedingHtmlExtraction(client, 3);
    const missing = await client.query(
      `select count(*)::int as n from regulatory_publications p
       where not exists (select 1 from regulatory_source_snapshots s where s.publication_id = p.id)`,
    );
    return {
      ok: true,
      dryRun: true,
      remainingWithoutSnapshot: missing.rows[0]?.n ?? null,
      wouldProcess: { snapshots: candidates.length, rederive: rederive.length },
      nextPublications: candidates.map((r) => ({
        id: r.id,
        title: r.title,
        regulator: r.regulator_key,
        url: r.canonical_url,
      })),
      nextRederiveSnapshotIds: rederive.map((r) => r.snapshot_id),
    };
  } finally {
    await client.end();
  }
}