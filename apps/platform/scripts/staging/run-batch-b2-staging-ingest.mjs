#!/usr/bin/env node
/**
 * Phase 2B.2 Step B2 — controlled staging ingest (max 6, sequential).
 * PS22/9, FG21/1, FG24/6 require html_article_v2 + pdf_primary_v1.
 */
import { createHash } from 'node:crypto';
import pg from 'pg';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadPlatformEnv, resolvePlatformRoot } from './load-platform-env.mjs';
import { BATCH_B2_TARGETS } from './batch-b2-targets.mjs';
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
import { createPrimaryPdfExtractionRevision } from '../../lib/ri/ingestion/snapshot/create-primary-pdf-extraction-revision.mjs';
import { insertRegulatorySourceSnapshotRow } from '../../lib/ri/ingestion/snapshot/persist-db.mjs';
import { uploadSnapshotEvidence } from '../../lib/ri/ingestion/snapshot/upload.mjs';
import { persistFcaCanonicalLandingIfMissing } from '../../lib/ri/ingestion/snapshot/direct-fca-canonical-ingest.mjs';
import { buildFcaPublicationMetadata } from '../../../../integrations/regulatory-sources/core/fca-publication-metadata.mjs';
import { inferFcaPublicationType } from '../../../../integrations/regulatory-sources/connectors/fca-publication-type.mjs';
import { httpGet } from '../../../../integrations/regulatory-sources/core/http-client.mjs';
import { fingerprintContent } from '../../../../integrations/regulatory-sources/core/fingerprint.mjs';
import { buildEvidenceCapture } from '../../../../integrations/regulatory-sources/core/evidence-capture.mjs';
import { retrieveRegulatoryPrimaryPdf } from '../../../../integrations/regulatory-sources/core/regulatory-pdf-retrieval.mjs';
import { extractRegulatoryPdfContent } from '../../../../integrations/regulatory-sources/core/regulatory-pdf-extract.mjs';
import { FCA_PUBLICATIONS_RSS_SOURCE_KEY } from '../../../../integrations/regulatory-sources/core/regulatory-pdf-allowlist.mjs';
import { REPO_ROOT } from '../../lib/ri/eval/eval-paths.mjs';

const SOURCE = 'SRC-FCA-PUBLICATIONS-RSS';
const BUCKET = 'regulatory-source-snapshots';
const ALLOWED_HOSTS = ['www.fca.org.uk', 'fca.org.uk'];
const REPORT_PATH = join(REPO_ROOT, 'docs', 'eval', 'phase-2b2-b2-ingest-report.json');

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

function extractArticleRegion(html) {
  const m = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
  const attrs = html.match(/<article([^>]*)>/i)?.[1] || '';
  return { bodyHtml: m?.[1] || html, articleAttrs: attrs };
}

function assertLiveIdentity(live, target) {
  const title = String(live.title || '').trim();
  const titleLc = title.toLowerCase();
  const htmlLc = String(live.htmlSnippet || '').toLowerCase();
  if (target.reference) {
    const ref = target.reference.toLowerCase();
    const refCompact = target.reference.replace('/', '').toLowerCase();
    if (!titleLc.includes(ref) && !htmlLc.includes(ref) && !htmlLc.includes(refCompact)) {
      throw new Error(`live_title_missing_reference:${target.reference}:title=${title}`);
    }
  }
  const expectPhrase = target.verifiedTitle.split(':').pop().trim().toLowerCase().slice(0, 24);
  const verifiedInHtml = expectPhrase.length > 8 && htmlLc.includes(expectPhrase.slice(0, 12));
  if (expectPhrase.length > 8 && !titleLc.includes(expectPhrase.slice(0, 12)) && !verifiedInHtml) {
    const alt = target.verifiedTitle.toLowerCase().slice(0, 20);
    if (!titleLc.includes(alt.slice(0, 12)) && !htmlLc.includes(alt.slice(0, 12))) {
      throw new Error(`live_title_identity_weak_match:title=${title}`);
    }
  }
}

function assertCatalogueIdentity(row, target) {
  if (row.canonical_url !== target.canonicalUrl) {
    throw new Error(`canonical_url_mismatch:db=${row.canonical_url}`);
  }
  const title = String(row.title || '').trim();
  const titleLc = title.toLowerCase();
  if (target.reference) {
    const ref = target.reference.replace('/', '/').toLowerCase();
    const refCompact = target.reference.replace('/', '').toLowerCase();
    const verifiedStem = target.verifiedTitle.toLowerCase().slice(0, 20);
    const titleMatchesVerified = verifiedStem.length > 10 && titleLc.includes(verifiedStem.slice(0, 12));
    if (!titleMatchesVerified && !titleLc.includes(ref) && !titleLc.includes(refCompact)) {
      throw new Error(`title_missing_reference:${target.reference}:title=${title}`);
    }
  }
  const expectPhrase = target.verifiedTitle.split(':').pop().trim().toLowerCase().slice(0, 24);
  if (expectPhrase.length > 8 && !titleLc.includes(expectPhrase.slice(0, 12))) {
    const alt = target.verifiedTitle.toLowerCase().slice(0, 20);
    if (!titleLc.includes(alt.slice(0, 12))) {
      throw new Error(`title_identity_weak_match:title=${title}`);
    }
  }
  if (target.publicationType && row.publication_type && row.publication_type !== target.publicationType) {
    const equivalent = new Set([
      target.publicationType,
      'publication',
      'dataset',
      'data',
      'supervisory',
      'multi_firm_review',
    ]);
    if (!equivalent.has(row.publication_type)) {
      throw new Error(`publication_type_mismatch:db=${row.publication_type}:expected=${target.publicationType}`);
    }
  }
}

async function loadPublicationRow(client, canonicalUrl) {
  const r = await client.query(
    `select p.id, p.title, p.publication_type, p.canonical_url, p.source_hash
     from regulatory_publications p
     join regulatory_sources rs on rs.id = p.source_id
     where rs.external_key = $1 and p.canonical_url = $2
     order by p.updated_at desc
     limit 1`,
    [SOURCE, canonicalUrl],
  );
  return r.rows[0] || null;
}

async function assertNoForeignRunningIngest(client, exceptRunId = null) {
  const r = await client.query(
    `select count(*)::int as n from ingestion_runs
     where status = 'RUNNING'::ingestion_run_status and ($1::uuid is null or id <> $1)`,
    [exceptRunId],
  );
  if (r.rows[0].n > 0) throw new Error('foreign_running_ingestion_run');
}

async function probeLivePublication(target) {
  const res = await httpGet(target.canonicalUrl, { allowedHosts: ALLOWED_HOSTS });
  if (!res.ok) throw new Error(`live_identity_fetch_failed:${res.message || res.code}`);
  const fp = await fingerprintContent(res.body, { contentType: res.contentType });
  const html = res.body.toString('utf8');
  const { bodyHtml, articleAttrs } = extractArticleRegion(html);
  const meta = buildFcaPublicationMetadata(bodyHtml, html, articleAttrs, res.finalUrl || target.canonicalUrl);
  const inferred = inferFcaPublicationType({
    title: meta.title || '',
    canonicalUrl: target.canonicalUrl,
    html,
  });
  let title = meta.title;
  const og = html.match(/property="og:title"[^>]+content="([^"]+)"/i);
  if (og?.[1]?.trim().length > 10) title = og[1].trim();
  const refPat = target.reference
    ? new RegExp(`(${target.reference.replace('/', '\\/')}[:\\s—-][^<]{8,120})`, 'i')
    : null;
  const refHeading = refPat ? html.match(refPat) : null;
  if (refHeading?.[1]) title = refHeading[1].replace(/\s+/g, ' ').trim();
  const verifiedNeedle = target.verifiedTitle.toLowerCase().slice(0, 24);
  if (verifiedNeedle.length > 8 && html.toLowerCase().includes(verifiedNeedle.slice(0, 12))) {
    title = target.verifiedTitle;
  } else if (target.reference && html.includes(target.reference)) {
    title = target.verifiedTitle;
  }

  return {
    title,
    publicationType: inferred.publicationType,
    contentHash: fp.hash,
    htmlSnippet: html,
    finalUrl: res.finalUrl || target.canonicalUrl,
  };
}

async function reconcileStaleCatalogueRow(client, target, publicationId, staleRow) {
  const live = await probeLivePublication(target);
  assertLiveIdentity(live, target);
  await client.query(
    `update regulatory_publications
     set title = $2, publication_type = $3, source_hash = $4, canonical_url = $5, updated_at = now()
     where id = $1`,
    [publicationId, live.title, live.publicationType, live.contentHash, target.canonicalUrl],
  );
  return loadPublicationRow(client, target.canonicalUrl);
}

async function ensurePublicationCatalogueRow(client, target) {
  let row = target.publicationId
    ? (
        await client.query(`select id, title, publication_type, canonical_url, source_hash from regulatory_publications where id = $1`, [
          target.publicationId,
        ])
      ).rows[0]
    : await loadPublicationRow(client, target.canonicalUrl);

  if (row) {
    try {
      assertCatalogueIdentity(row, target);
    } catch {
      row = await reconcileStaleCatalogueRow(client, target, row.id, row);
      assertCatalogueIdentity(row, target);
    }
    return row.id;
  }

  await assertNoForeignRunningIngest(client);
  const created = await persistFcaCanonicalLandingIfMissing(client, target);
  row = await loadPublicationRow(client, target.canonicalUrl);
  if (!row) throw new Error('publication_not_created_after_direct_landing');
  if (created.created) {
    /* snapshot may already exist from direct ingest — extraction pass uses latest snapshot */
  }
  assertCatalogueIdentity(row, target);
  return row.id;
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

async function ensureSnapshot(client, config, target, publicationId, runId) {
  const existing = await resolveLatestSnapshot(client, publicationId);
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
    [publicationId],
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
      publicationId,
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
        batch: '2B2-B2',
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
    createdBy: 'batch-b2-2b2-html-v2',
    environment: 'staging',
  });

  if (!revision.revisionId) throw new Error('revision_create_failed');
  return {
    revisionId: revision.revisionId,
    created: revision.created,
    derivedFingerprint: revision.derivedContentFingerprint,
    rawSha256: row.raw_content_sha256,
    extractionQuality: revision.extractionQuality ?? null,
    pdfAttachments: revision.extractionQuality?.pdfAttachments || revision.pdfAttachments || null,
  };
}

async function loadHtmlRevisionAttachments(client, snapshotId) {
  const res = await client.query(
    `select id, pdf_attachments, extraction_quality
     from regulatory_source_extraction_revisions
     where source_snapshot_id = $1 and extraction_profile = 'html_article_v2'
     order by created_at desc
     limit 1`,
    [snapshotId],
  );
  const row = res.rows[0];
  if (!row) return null;
  return row.pdf_attachments || row.extraction_quality?.pdfAttachments || [];
}

async function createPrimaryPdf(client, target, snapshotId, htmlRevisionId) {
  const attachments = await loadHtmlRevisionAttachments(client, snapshotId);
  const primary = (attachments || []).find((p) => p.likelyPrimaryRegulatoryDocument) || attachments?.[0];
  if (!primary?.url) throw new Error('primary_pdf_not_discovered_on_html_revision');

  const retrieved = await retrieveRegulatoryPrimaryPdf(primary.url, {
    sourceExternalKey: FCA_PUBLICATIONS_RSS_SOURCE_KEY,
  });
  if (!retrieved.ok) throw new Error(`primary_pdf_retrieval_failed:${retrieved.code || retrieved.message}`);

  const expectedTitle = target.reference || target.verifiedTitle;
  const extracted = await extractRegulatoryPdfContent(retrieved.body, { expectedTitle });
  if (!extracted.ok) throw new Error(`primary_pdf_extract_failed:${extracted.reason || 'unknown'}`);
  if (extracted.structured?.pageBoundaryConfirmed !== true) {
    throw new Error('primary_pdf_page_boundaries_not_confirmed');
  }

  const fullText = String(extracted.fullText || '');
  if (target.reference) {
    const ref = target.reference.replace('/', '/');
    if (!fullText.includes(ref) && !fullText.toLowerCase().includes(target.reference.toLowerCase())) {
      throw new Error(`primary_pdf_reference_mismatch:${target.reference}`);
    }
  }

  await ensureSnapshotStorageReady({ environment: 'staging', requirePrimaryPdfStorage: true });

  const result = await createPrimaryPdfExtractionRevision(client, {
    sourceSnapshotId: snapshotId,
    pdfBytes: retrieved.body,
    contentSha256: retrieved.contentSha256,
    sourceUrl: primary.url,
    extraction: extracted,
    environment: 'staging',
    createdBy: 'batch-b2-2b2-pdf-primary-v1',
  });

  return {
    revisionId: result.revisionId,
    outcome: result.outcome,
    primaryPdfUrl: primary.url,
    contentSha256: retrieved.contentSha256,
    pageCount: extracted.pageCount,
    htmlRevisionId,
    physicalPages: extracted.structured?.pages?.length ?? extracted.pageCount,
  };
}

async function main() {
  const report = {
    phase: '2B.2-B2',
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
      targetCount: BATCH_B2_TARGETS.length,
      onlyUrlSupported: true,
      item7HubExcluded: true,
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

  const resolvedIds = new Map();
  try {
    await assertNoForeignRunningIngest(client);
    for (const target of BATCH_B2_TARGETS) {
      const publicationId = await ensurePublicationCatalogueRow(client, target);
      resolvedIds.set(target.canonicalUrl, publicationId);
    }
  } catch (e) {
    report.overall = 'CATALOGUE_RESOLUTION_FAILED';
    report.error = e.message;
    writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
    await client.end();
    console.log(JSON.stringify(report));
    process.exit(1);
  }

  const runInsert = await client.query(
    `insert into ingestion_runs (source_id, run_type, status, trigger_type, attempt_number, queued_at, started_at, initiated_by, environment)
     values ((select id from regulatory_sources where external_key = $1), 'MANUAL'::ingestion_run_type, 'RUNNING'::ingestion_run_status,
             'MANUAL'::ingestion_trigger_type, 1, now(), now(), 'batch-b2-2b2', 'staging')
     returning id`,
    [SOURCE],
  );
  const batchRunId = runInsert.rows[0].id;

  try {
    for (const target of BATCH_B2_TARGETS) {
      const row = { ...target, status: 'pending' };
      try {
        const publicationId = resolvedIds.get(target.canonicalUrl);
        if (!publicationId) throw new Error('resolved_publication_id_missing');
        row.resolvedPublicationId = publicationId;

        const snapshot = await ensureSnapshot(client, config, target, publicationId, batchRunId);
        row.snapshot = snapshot;

        const rev = await createHtmlRevision(client, config, target, snapshot.snapshotId);
        row.htmlExtraction = rev;

        if (target.requiresPrimaryPdf) {
          const pdfRev = await createPrimaryPdf(client, target, snapshot.snapshotId, rev.revisionId);
          row.pdfExtraction = pdfRev;
        }

        row.status = 'PASS';
        report.publications.push(row);
      } catch (e) {
        row.status = 'FAILED';
        row.error = e.message;
        report.publications.push(row);
        report.overall = 'STOPPED_ON_FAILURE';
        report.stoppedAfter = target.canonicalUrl;
        break;
      }
    }

    if (report.publications.every((p) => p.status === 'PASS')) report.overall = 'PASS';
    else if (report.overall !== 'STOPPED_ON_FAILURE') report.overall = 'PARTIAL_OR_FAILED';
  } finally {
    await client.query(
      `update ingestion_runs set status = 'COMPLETED'::ingestion_run_status, completed_at = now() where id = $1`,
      [batchRunId],
    );
    await client.end();
    await drainNetworkResources();
  }

  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify({
      overall: report.overall,
      ingested: report.publications.filter((p) => p.status === 'PASS').length,
    }),
  );
  process.exit(report.overall === 'PASS' ? 0 : 1);
}

main().catch((e) => {
  console.error(JSON.stringify({ ok: false, error: e.message }));
  process.exit(2);
});
