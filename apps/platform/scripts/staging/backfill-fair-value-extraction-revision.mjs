#!/usr/bin/env node
/**
 * BUS-UAT-018 — Controlled Fair value html_article_v2 extraction revision backfill (staging only).
 *
 * Uses createExtractionRevision (same mechanism as Step 78 CP26/38).
 *
 *   FORGENIQ_ENV=staging
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   STAGING_DATABASE_URL | DATABASE_URL | FORGENIQ_LOCAL_PG_URL
 *
 * Flags:
 *   --dry-run   inspect + derive + SHA checks only (no DB insert)
 *   --execute   perform idempotent createExtractionRevision
 */
import pg from 'pg';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { FAIR_VALUE_STAGING } from '../../lib/ri/ingestion/snapshot/fair-value-staging-identity.mjs';
import { FORGENIQ_RI_STAGING_PROJECT_REF } from '../../lib/ri/ingestion/snapshot/staging-constants.mjs';
import {
  extractProjectRefFromSupabaseUrl,
  validateSupabaseSnapshotConfig,
} from '../../lib/ri/ingestion/snapshot/supabase-config.mjs';
import {
  stagingPgClientOptions,
  validateStagingDatabaseUrl,
} from '../../lib/ri/ingestion/snapshot/staging-database-config.mjs';
import { assertApprovedStagingGitBranch } from '../../lib/ri/ingestion/snapshot/staging-git-preflight.mjs';
import {
  downloadPrivateStorageObject,
  drainNetworkResources,
} from '../../lib/ri/ingestion/snapshot/readonly-storage-download.mjs';
import { ensureSnapshotStorageReady } from '../../lib/ri/ingestion/snapshot/resolve-storage.mjs';
import { createExtractionRevision } from '../../lib/ri/ingestion/snapshot/create-extraction-revision.mjs';
import { getSnapshotStorage } from '../../lib/ri/ingestion/snapshot/resolve-storage.mjs';
import { rederiveExtractionV2FromRaw } from '../../../../integrations/regulatory-sources/core/evidence-capture-v2.mjs';
import { buildHtmlArticleEvidenceBlocks, buildPublicationHtmlEvidenceIndex } from '../../lib/ri/ask-ri/publication-html-evidence.mjs';
import { loadPlatformEnv, resolvePlatformRoot } from './load-platform-env.mjs';

const BUCKET = 'regulatory-source-snapshots';
const dryRun = process.argv.includes('--dry-run');
const execute = process.argv.includes('--execute');

const report = {
  step: 'bus-uat-018-fair-value-extraction-revision-backfill',
  mode: dryRun ? 'dry-run' : execute ? 'execute' : 'blocked',
  preflight: {},
  inspection: {},
  backfill: {},
  askRiProbe: {},
  overall: 'BLOCKED',
};

function blocked(reason, detail) {
  report.overall = 'BLOCKED';
  report.blocked = { reason, detail };
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = 2;
}

function fail(reason, detail) {
  report.overall = 'FAIL';
  report.failure = { reason, detail };
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = 1;
}

function loadDatabaseUrl() {
  for (const key of ['STAGING_DATABASE_URL', 'DATABASE_URL', 'FORGENIQ_LOCAL_PG_URL']) {
    if (process.env[key]?.trim()) return process.env[key].trim();
  }
  throw new Error('staging_database_url_missing');
}

function sha256Buffer(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

async function main() {
  if (!dryRun && !execute) {
    blocked('missing_flag', 'Pass --dry-run or --execute');
    return;
  }

  loadPlatformEnv(resolvePlatformRoot(import.meta.url));
  process.env.FORGENIQ_ENV = process.env.FORGENIQ_ENV || 'staging';

  try {
    report.preflight.gitBranch = assertApprovedStagingGitBranch();
  } catch (e) {
    blocked('staging_git_branch_preflight_failed', e.message);
    return;
  }

  let config;
  try {
    config = validateSupabaseSnapshotConfig({
      environment: 'staging',
      requireApprovedStagingProject: true,
    });
  } catch (e) {
    blocked('missing_staging_supabase_config', e.message);
    return;
  }
  if (extractProjectRefFromSupabaseUrl(config.url) !== FORGENIQ_RI_STAGING_PROJECT_REF) {
    fail('wrong_supabase_project', extractProjectRefFromSupabaseUrl(config.url));
    return;
  }

  let dbUrl;
  try {
    dbUrl = loadDatabaseUrl();
    validateStagingDatabaseUrl(dbUrl);
  } catch (e) {
    blocked('staging_database_url', e.message);
    return;
  }

  const client = new pg.Client(stagingPgClientOptions(dbUrl));
  await client.connect();

  try {
    const snap = await client.query(
      `select s.*, p.title, p.canonical_url as pub_canonical_url, v.version_number
       from regulatory_source_snapshots s
       join regulatory_publications p on p.id = s.publication_id
       join regulatory_publication_versions v on v.id = s.publication_version_id
       where s.id = $1 and p.id = $2`,
      [FAIR_VALUE_STAGING.snapshotId, FAIR_VALUE_STAGING.publicationId],
    );
    if (!snap.rows[0]) {
      fail('snapshot_missing', FAIR_VALUE_STAGING.snapshotId);
      return;
    }
    const row = snap.rows[0];
    report.inspection.snapshot = {
      id: row.id,
      publicationId: row.publication_id,
      publicationVersionId: row.publication_version_id,
      versionNumber: row.version_number,
      canonicalUrl: row.canonical_url,
      rawContentSha256: row.raw_content_sha256,
      rawStoragePath: row.raw_storage_path,
    };

    if (row.raw_content_sha256 !== FAIR_VALUE_STAGING.rawContentSha256) {
      fail('raw_sha_preflight_mismatch', {
        expected: FAIR_VALUE_STAGING.rawContentSha256,
        actual: row.raw_content_sha256,
      });
      return;
    }

    const existing = await client.query(
      `select id, extraction_profile, created_at from regulatory_source_extraction_revisions
       where source_snapshot_id = $1`,
      [FAIR_VALUE_STAGING.snapshotId],
    );
    report.inspection.existingRevisions = existing.rows;

    const rawBody = await downloadPrivateStorageObject({
      projectUrl: config.url,
      serviceRoleKey: config.serviceKey,
      bucket: BUCKET,
      objectPath: row.raw_storage_path,
    });
    const rawSha = sha256Buffer(rawBody);
    if (rawSha !== row.raw_content_sha256) {
      fail('raw_storage_sha_mismatch', { db: row.raw_content_sha256, storage: rawSha });
      return;
    }
    report.inspection.rawBytes = rawBody.length;
    report.inspection.rawShaVerified = true;

    const snippet = rawBody.toString('utf8', 0, Math.min(rawBody.length, 4000));
    report.inspection.contentSignals = {
      hasFairValueTitle: /fair value in consumer finance/i.test(snippet),
      hasFcaHost: /fca\.org\.uk/i.test(snippet),
      hasConsumerDuty: /consumer duty/i.test(snippet),
    };
    if (!report.inspection.contentSignals.hasFairValueTitle && !report.inspection.contentSignals.hasConsumerDuty) {
      fail('content_does_not_look_like_fca_fair_value', report.inspection.contentSignals);
      return;
    }

    const derived = await rederiveExtractionV2FromRaw(rawBody, {
      contentType: row.content_type || 'text/html',
      finalUrl: row.canonical_url || FAIR_VALUE_STAGING.canonicalUrl,
      connectorId: 'CONN-LEGACY-FCA',
    });
    report.inspection.derive = {
      fingerprintV2: derived.fingerprintV2?.hash ?? null,
      obligationGradeSuitable: derived.extractionQuality?.obligationGradeSuitable ?? null,
      webpageExtractionStatus: derived.extractionQuality?.webpageExtraction?.status ?? null,
      normalisedTextBytes: derived.normalisedArticleTextV2?.length ?? 0,
    };

    if (derived.normalisedArticleTextV2) {
      const blocks = buildHtmlArticleEvidenceBlocks({
        publicationId: FAIR_VALUE_STAGING.publicationId,
        extractionRevisionId: 'dry-run',
        normalisedArticleText: derived.normalisedArticleTextV2,
        canonicalUrl: FAIR_VALUE_STAGING.canonicalUrl,
        ...buildPublicationHtmlEvidenceIndex(
          { canonical_url: FAIR_VALUE_STAGING.canonicalUrl, extraction_quality: derived.extractionQuality },
          {
            text: derived.normalisedArticleTextV2,
            html: derived.normalisedArticleHtmlV2,
            metaParsed: derived.derivedMetadataV2 || {},
            integrityVerified: true,
          },
        ),
      });
      report.inspection.evidenceBlocksDryRun = blocks.length;
    }

    const revCount = await client.query(
      `select count(*)::int as n from regulatory_source_extraction_revisions where publication_id = $1`,
      [FAIR_VALUE_STAGING.publicationId],
    );
    report.inspection.revisionCountForPublication = revCount.rows[0].n;

    report.inspection.cause = {
      summary:
        'Snapshots were persisted by FCA ingestion pilots; html_article_v2 rows are created only via createExtractionRevision (Step 78 pattern). No scheduler invokes extraction after snapshot persist.',
      missingScheduledExtraction: true,
      pipelineMechanism: 'createExtractionRevision + uploadExtractionRevisionArtefacts',
    };

    if (dryRun) {
      report.overall = 'PASS_DRY_RUN';
      console.log(JSON.stringify(report, null, 2));
      return;
    }

    await ensureSnapshotStorageReady({ environment: 'staging' });
    const storage = getSnapshotStorage({ environment: 'staging' });

    const first = await createExtractionRevision(client, {
      sourceSnapshotId: FAIR_VALUE_STAGING.snapshotId,
      rawBody,
      canonicalUrl: row.canonical_url || FAIR_VALUE_STAGING.canonicalUrl,
      createdBy: 'bus-uat-018-fair-value-backfill',
      environment: 'staging',
    });
    report.backfill = {
      revisionId: first.revisionId,
      created: first.created,
      outcome: first.outcome,
      obligationGradeSuitable: first.extractionQuality?.obligationGradeSuitable,
      storagePaths: first.storagePaths,
    };

    if (!first.revisionId) {
      fail('revision_missing', first);
      return;
    }

    for (const [label, key] of [
      ['html', first.storagePaths.html],
      ['text', first.storagePaths.text],
      ['metadata', first.storagePaths.metadata],
    ]) {
      const obj = await storage.getObject({ key });
      if (!obj?.sha256) fail('storage_missing', key);
      report.backfill.storage = report.backfill.storage || {};
      report.backfill.storage[label] = { path: key, sha256: obj.sha256, bytes: obj.body.length };
    }

    const second = await createExtractionRevision(client, {
      sourceSnapshotId: FAIR_VALUE_STAGING.snapshotId,
      rawBody,
      canonicalUrl: row.canonical_url || FAIR_VALUE_STAGING.canonicalUrl,
      createdBy: 'bus-uat-018-fair-value-backfill-idempotent',
      environment: 'staging',
    });
    report.backfill.idempotentSecondCreated = second.created;
    if (second.created || second.revisionId !== first.revisionId) {
      fail('idempotency_failed', { first: first.revisionId, second: second.revisionId });
      return;
    }

    const afterCount = await client.query(
      `select count(*)::int as n from regulatory_source_extraction_revisions where publication_id = $1 and extraction_profile = 'html_article_v2'`,
      [FAIR_VALUE_STAGING.publicationId],
    );
    report.backfill.htmlArticleV2Count = afterCount.rows[0].n;

    report.overall = 'PASS';
  } finally {
    await client.end();
    await drainNetworkResources();
  }

  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  fail('unhandled', e.message);
});
