#!/usr/bin/env node
/**
 * Phase 2B.2 Step E — Batch B1 controlled staging ingest (max 5, sequential).
 * Append-only extraction revisions; stop on first mandatory failure.
 */
import { createHash } from 'node:crypto';
import pg from 'pg';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadPlatformEnv, resolvePlatformRoot } from './load-platform-env.mjs';
import { BATCH_B1_TARGETS } from './batch-b1-targets.mjs';
import {
  stagingPgClientOptions,
  validateStagingDatabaseUrl,
} from '../../lib/ri/ingestion/snapshot/staging-database-config.mjs';
import { FORGENIQ_RI_STAGING_PROJECT_REF } from '../../lib/ri/ingestion/snapshot/staging-constants.mjs';
import {
  extractProjectRefFromSupabaseUrl,
  validateSupabaseSnapshotConfig,
} from '../../lib/ri/ingestion/snapshot/supabase-config.mjs';
import { assertStagingIngestIsolation } from '../../lib/ri/ingestion/staging-ingest-guards.mjs';
import {
  APPROVED_STAGING_BACKFILL_BRANCHES,
  assertApprovedStagingGitBranch,
} from '../../lib/ri/ingestion/snapshot/staging-git-preflight.mjs';
import { downloadPrivateStorageObject, drainNetworkResources } from '../../lib/ri/ingestion/snapshot/readonly-storage-download.mjs';
import { ensureSnapshotStorageReady, getSnapshotStorage } from '../../lib/ri/ingestion/snapshot/resolve-storage.mjs';
import { createExtractionRevision } from '../../lib/ri/ingestion/snapshot/create-extraction-revision.mjs';
import { insertRegulatorySourceSnapshotRow } from '../../lib/ri/ingestion/snapshot/persist-db.mjs';
import { uploadSnapshotEvidence } from '../../lib/ri/ingestion/snapshot/upload.mjs';
import { httpGet } from '../../../../integrations/regulatory-sources/core/http-client.mjs';
import { fingerprintContent } from '../../../../integrations/regulatory-sources/core/fingerprint.mjs';
import { buildEvidenceCapture } from '../../../../integrations/regulatory-sources/core/evidence-capture.mjs';
import { REPO_ROOT } from '../../lib/ri/eval/eval-paths.mjs';

const SOURCE = 'SRC-FCA-PUBLICATIONS-RSS';
const BUCKET = 'regulatory-source-snapshots';
const ALLOWED_HOSTS = ['www.fca.org.uk', 'fca.org.uk'];
const REPORT_PATH = join(REPO_ROOT, 'docs', 'eval', 'phase-2b2-step-e-b1-ingest-report.json');

loadPlatformEnv(resolvePlatformRoot(import.meta.url));
process.env.FORGENIQ_ENV = 'staging';
process.env.FORGENIQ_INGEST_ENV = 'staging';

function loadDatabaseUrl() {
  for (const key of ['STAGING_DATABASE_URL', 'DATABASE_URL', 'FORGENIQ_LOCAL_PG_URL']) {
    if (process.env[key]?.trim()) return process.env[key].trim();
  }
  throw new Error('staging_database_url_missing');
}

function sha256Buffer(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

async function resolveLatestSnapshot(client, publicationId) {
  const r = await client.query(
    `select s.id, s.raw_content_sha256, s.canonical_url, s.raw_storage_path
     from regulatory_source_snapshots s
     where s.publication_id = $1
     order by s.retrieved_at desc
     limit 1`,
    [publicationId],
  );
  return r.rows[0] || null;
}

async function ensureSnapshot(client, config, target, runId) {
  const existing = await resolveLatestSnapshot(client, target.publicationId);
  if (existing) return { snapshotId: existing.id, created: false, rawStoragePath: existing.raw_storage_path };

  const pub = await client.query(
    `select p.id, p.title, p.canonical_url, p.source_hash, p.source_id,
            v.id as version_id, v.version_number
     from regulatory_publications p
     join lateral (
       select id, version_number from regulatory_publication_versions
       where publication_id = p.id order by version_number desc limit 1
     ) v on true
     where p.id = $1`,
    [target.publicationId],
  );
  if (!pub.rows[0]) throw new Error('publication_not_found');
  const row = pub.rows[0];
  if (row.canonical_url !== target.canonicalUrl) {
    throw new Error(`canonical_url_mismatch:${row.canonical_url}`);
  }

  await sleep(1500);
  const res = await httpGet(target.canonicalUrl, { allowedHosts: ALLOWED_HOSTS });
  if (!res.ok) throw new Error(`live_fetch_failed:${res.message || res.code}`);
  const fp = await fingerprintContent(res.body, { contentType: res.contentType });
  if (fp.hash !== row.source_hash) {
    throw new Error(`source_hash_mismatch:live=${fp.hash}:db=${row.source_hash}`);
  }

  const evidenceCapture = await buildEvidenceCapture({
    body: res.body,
    contentType: res.contentType,
    finalUrl: res.finalUrl || target.canonicalUrl,
    connectorId: 'CONN-LEGACY-FCA',
  });
  if (!evidenceCapture?.rawBody?.length) throw new Error('evidence_capture_empty');

  await ensureSnapshotStorageReady({ environment: 'staging' });
  const storage = getSnapshotStorage({ environment: 'staging' });
  const uploaded = await uploadSnapshotEvidence(storage, {
    evidenceCapture,
    contentHash: fp.hash,
    connectorId: 'CONN-LEGACY-FCA',
    ingestionRunId: runId,
  });

  await client.query('BEGIN');
  try {
    const snapshotId = await insertRegulatorySourceSnapshotRow(client, {
      publicationId: target.publicationId,
      publicationVersionId: row.version_id,
      ingestionRunId: runId,
      ingestionItemId: null,
      canonicalUrl: target.canonicalUrl,
      retrievedAt: new Date().toISOString(),
      sourceFingerprint: fp.hash,
      fingerprintAlgorithm: evidenceCapture.fingerprint.algorithm,
      fingerprintNormalisation: evidenceCapture.fingerprint.normalisation,
      rawContentSha256: evidenceCapture.rawSha256,
      normalisedHtmlSha256: evidenceCapture.normalisedHtmlSha256,
      normalisedTextSha256: evidenceCapture.normalisedTextSha256,
      rawStoragePath: uploaded.paths.raw,
      normalisedHtmlStoragePath: uploaded.paths.html,
      normalisedTextStoragePath: uploaded.paths.text,
      metadataStoragePath: uploaded.paths.metadata,
      contentType: evidenceCapture.contentType,
      byteSizeRaw: evidenceCapture.rawBody.length,
      byteSizeNormalisedHtml: Buffer.byteLength(evidenceCapture.normalisedArticleHtml, 'utf8'),
      byteSizeNormalisedText: Buffer.byteLength(evidenceCapture.normalisedArticleText, 'utf8'),
      licenceNotice: uploaded.licenceNotice,
      provenance: {
        batch: '2B2-B1',
        connectorId: 'CONN-LEGACY-FCA',
        finalUrl: evidenceCapture.finalUrl,
      },
    });
    await client.query('COMMIT');
    return { snapshotId, created: true, rawStoragePath: uploaded.paths.raw };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }
}

async function createHtmlRevision(client, config, target, snapshotId) {
  const snap = await client.query(`select * from regulatory_source_snapshots where id = $1`, [snapshotId]);
  if (!snap.rows[0]) throw new Error('snapshot_missing');
  const row = snap.rows[0];
  const rawBody = await downloadPrivateStorageObject({
    projectUrl: config.url,
    serviceRoleKey: config.serviceKey,
    bucket: BUCKET,
    objectPath: row.raw_storage_path,
  });
  const rawSha = sha256Buffer(rawBody);
  if (rawSha !== row.raw_content_sha256) throw new Error('raw_storage_sha_mismatch');

  const snippet = rawBody.toString('utf8', 0, Math.min(rawBody.length, 6000));
  if (!/fca\.org\.uk/i.test(snippet)) throw new Error('content_missing_fca_host');
  if (snippet.length < 400) throw new Error('content_too_short');
  if (/PS24\/1 sets out final rules for operational resilience/.test(snippet)) {
    throw new Error('synthetic_fixture_text_detected');
  }
  if (/included to introduce realistic publication competition/i.test(snippet)) {
    throw new Error('synthetic_catalogue_abstract_detected');
  }

  const revision = await createExtractionRevision(client, {
    sourceSnapshotId: snapshotId,
    rawBody,
    canonicalUrl: target.canonicalUrl,
    createdBy: 'batch-b1-2b2-html-v2',
    environment: 'staging',
  });

  if (!revision.revisionId) throw new Error('revision_create_failed');
  const blockCount = await client.query(
    `select extraction_quality, publication_metadata from regulatory_source_extraction_revisions where id = $1`,
    [revision.revisionId],
  );

  return {
    revisionId: revision.revisionId,
    created: revision.created,
    obligationGradeSuitable: revision.extractionQuality?.obligationGradeSuitable,
    derivedFingerprint: revision.derivedContentFingerprint,
    rawSha256: row.raw_content_sha256,
    webpageStatus: revision.extractionQuality?.webpageExtraction?.status,
    extractionQuality: blockCount.rows[0]?.extraction_quality ?? null,
  };
}

async function main() {
  const report = {
    phase: '2B.2-E-B1',
    generatedAt: new Date().toISOString(),
    preflight: {},
    publications: [],
    overall: 'BLOCKED',
  };

  let config;
  try {
    report.preflight.gitBranch = assertApprovedStagingGitBranch([
      ...APPROVED_STAGING_BACKFILL_BRANCHES,
      'feature/ask-ri-v2-evaluation-baseline',
    ]);
    const dbUrl = loadDatabaseUrl();
    validateStagingDatabaseUrl(dbUrl);
    config = validateSupabaseSnapshotConfig({ environment: 'staging', requireApprovedStagingProject: true });
    assertStagingIngestIsolation({ environment: 'staging', databaseUrl: dbUrl });
    if (extractProjectRefFromSupabaseUrl(config.url) !== FORGENIQ_RI_STAGING_PROJECT_REF) {
      throw new Error('wrong_supabase_project');
    }
    report.preflight = {
      gitBranch: report.preflight.gitBranch,
      stagingProjectRef: config.projectRef,
      targetCount: BATCH_B1_TARGETS.length,
      onlyUrlSupported: true,
    };
  } catch (e) {
    report.overall = 'PREFLIGHT_FAILED';
    report.error = e.message;
    writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
    process.exit(2);
  }

  await ensureSnapshotStorageReady({ environment: 'staging' });

  const client = new pg.Client(stagingPgClientOptions(loadDatabaseUrl()));
  await client.connect();

  const runInsert = await client.query(
    `insert into ingestion_runs (source_id, run_type, status, trigger_type, attempt_number, queued_at, started_at, initiated_by, environment)
     values ((select id from regulatory_sources where external_key = $1), 'MANUAL'::ingestion_run_type, 'RUNNING'::ingestion_run_status,
             'MANUAL'::ingestion_trigger_type, 1, now(), now(), 'batch-b1-2b2', 'staging')
     returning id`,
    [SOURCE],
  );
  const batchRunId = runInsert.rows[0].id;

  try {
    for (const target of BATCH_B1_TARGETS) {
      const row = { ...target, status: 'pending' };
      try {
        const snapshot = await ensureSnapshot(client, config, target, batchRunId);
        row.snapshot = snapshot;

        const rev = await createHtmlRevision(client, config, target, snapshot.snapshotId);
        row.extraction = rev;
        row.status = 'PASS';
        report.publications.push(row);
      } catch (e) {
        row.status = 'FAILED';
        row.error = e.message;
        report.publications.push(row);
        report.overall = 'PARTIAL_OR_FAILED';
        report.stoppedAfter = target.publicationId;
        break;
      }
    }

    if (report.publications.every((p) => p.status === 'PASS')) report.overall = 'PASS';
    else if (!report.overall) report.overall = 'PARTIAL_OR_FAILED';
  } finally {
    await client.query(
      `update ingestion_runs set status = 'COMPLETED'::ingestion_run_status, completed_at = now() where id = $1`,
      [batchRunId],
    );
    await client.end();
    await drainNetworkResources();
  }

  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ overall: report.overall, ingested: report.publications.filter((p) => p.status === 'PASS').length }));
  process.exit(report.overall === 'PASS' ? 0 : 1);
}

main().catch((e) => {
  console.error(JSON.stringify({ ok: false, error: e.message }));
  process.exit(2);
});
