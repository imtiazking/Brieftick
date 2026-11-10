#!/usr/bin/env node
/**
 * BUS-UAT-018 — Controlled FG22/5 staging ingest (html_article_v2 + pdf_primary_v1).
 *
 * Default: --dry-run (no database or storage writes).
 *
 *   FORGENIQ_ENV=staging node scripts/staging/ingest-fg22-5-primary-pdf.mjs --dry-run
 *
 * Execute (operator-approved only):
 *   FORGENIQ_FG22_INGEST_APPROVED=1 FORGENIQ_ENV=staging node scripts/staging/ingest-fg22-5-primary-pdf.mjs --execute
 */
import pg from 'pg';
import {
  assertApprovedPrimaryPdfUrl,
  FCA_PUBLICATIONS_RSS_SOURCE_KEY,
  FG22_5_PRIMARY_PDF_URL,
} from '../../../../integrations/regulatory-sources/core/regulatory-pdf-allowlist.mjs';
import { retrieveRegulatoryPrimaryPdf } from '../../../../integrations/regulatory-sources/core/regulatory-pdf-retrieval.mjs';
import { extractRegulatoryPdfContent } from '../../../../integrations/regulatory-sources/core/regulatory-pdf-extract.mjs';
import { assertStagingIngestIsolation } from '../../lib/ri/ingestion/staging-ingest-guards.mjs';
import {
  persistFg22ControlledCatalogue,
  applyFg22DiscoveryHtmlRevisionSemantics,
} from '../../lib/ri/ingestion/snapshot/fg22-5-persist-controlled.mjs';
import { FG22_5_STAGING } from '../../lib/ri/ingestion/snapshot/fg22-5-staging-identity.mjs';
import {
  resolveFg22LandingPage,
  FG22_5_EXPECTED_PRIMARY_PDF_SHA256,
} from '../../lib/ri/ingestion/snapshot/fg22-5-landing-resolve.mjs';
import { assessFg22ControlledIngestSafety } from '../../lib/ri/ingestion/snapshot/fg22-5-controlled-ingest-safety.mjs';
import { createExtractionRevision } from '../../lib/ri/ingestion/snapshot/create-extraction-revision.mjs';
import { createPrimaryPdfExtractionRevision } from '../../lib/ri/ingestion/snapshot/create-primary-pdf-extraction-revision.mjs';
import { validateSupabaseSnapshotConfig } from '../../lib/ri/ingestion/snapshot/supabase-config.mjs';
import {
  stagingPgClientOptions,
  validateStagingDatabaseUrl,
} from '../../lib/ri/ingestion/snapshot/staging-database-config.mjs';
import { assertApprovedStagingGitBranch } from '../../lib/ri/ingestion/snapshot/staging-git-preflight.mjs';
import { ensureSnapshotStorageReady } from '../../lib/ri/ingestion/snapshot/resolve-storage.mjs';
import { downloadPrivateStorageObject, drainNetworkResources } from '../../lib/ri/ingestion/snapshot/readonly-storage-download.mjs';
import { loadPlatformEnv, resolvePlatformRoot } from './load-platform-env.mjs';

const dryRun = process.argv.includes('--dry-run') || !process.argv.includes('--execute');
const execute = process.argv.includes('--execute');
const BUCKET = 'regulatory-source-snapshots';

const report = {
  step: 'bus-uat-018-fg22-5-controlled-ingest',
  mode: dryRun ? 'dry-run' : 'execute',
  overall: 'BLOCKED',
};

function finish(code = 0) {
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = code;
}

function loadDatabaseUrl() {
  for (const key of ['STAGING_DATABASE_URL', 'DATABASE_URL', 'FORGENIQ_LOCAL_PG_URL']) {
    if (process.env[key]?.trim()) return process.env[key].trim();
  }
  return null;
}

function assessChapter7CitationReadiness(structured) {
  const pages = structured?.pages || [];
  const ch7HeadingPages = [];
  const priceValueDensePages = [];
  for (const p of pages) {
    const t = p.text || '';
  const head = t.slice(0, 600);
    if (/\b7\s+The price and value outcome\b/i.test(head) || /^Chapter\s+7\b/im.test(head)) {
      ch7HeadingPages.push(p.pageNumber);
    }
    if (/price and value outcome/i.test(t) && t.replace(/\s+/g, '').length > 400) {
      priceValueDensePages.push(p.pageNumber);
    }
  }
  const uniqueCh7 = [...new Set(ch7HeadingPages)].sort((a, b) => a - b);
  const uniqueDense = [...new Set(priceValueDensePages)].sort((a, b) => a - b);
  const citationPages = [...new Set([...uniqueCh7, ...uniqueDense.slice(0, 6)])].sort((a, b) => a - b);
  return {
    chapter7HeadingPages: uniqueCh7,
    priceValueDensePages: uniqueDense.slice(0, 12),
    suggestedCitationPhysicalPages: citationPages.slice(0, 8),
    meetsTwoPagePotential:
      citationPages.filter((n) => uniqueDense.includes(n) || uniqueCh7.includes(n)).length >= 2,
    note: 'Post-ingest Ask RI must select citations from indexed pdf_primary_v1 blocks — not pre-selected here.',
  };
}

async function fairValueGuard(client) {
  const pub = await client.query(
    `select id, title, source_hash, source_version from regulatory_publications where id = $1`,
    [FG22_5_STAGING.fairValuePublicationId],
  );
  const rev = await client.query(
    `select id, extraction_profile, raw_content_sha256 from regulatory_source_extraction_revisions
     where id = $1 and publication_id = $2`,
    [FG22_5_STAGING.fairValueHtmlRevisionId, FG22_5_STAGING.fairValuePublicationId],
  );
  const pdfOnFairValue = await client.query(
    `select count(*)::int as n from regulatory_source_extraction_revisions
     where publication_id = $1 and extraction_profile = 'pdf_primary_v1'`,
    [FG22_5_STAGING.fairValuePublicationId],
  );
  return {
    publication: pub.rows[0] || null,
    htmlRevision: rev.rows[0] || null,
    fairValuePdfRevisions: pdfOnFairValue.rows[0]?.n ?? 0,
    pass: Boolean(pub.rows[0] && rev.rows[0]?.extraction_profile === 'html_article_v2'),
  };
}

async function checkCanonicalCollisions(client) {
  const pdfUrl = FG22_5_STAGING.canonicalPdfUrl;
  const rows = await client.query(
    `select id, title, external_document_id, canonical_url from regulatory_publications
     where canonical_url = $1 and coalesce(external_document_id, '') <> $2`,
    [pdfUrl, FG22_5_STAGING.externalDocumentId],
  );
  return {
    canonicalPdfUrl: pdfUrl,
    collisions: (rows.rows || []).filter((r) => r.external_document_id !== FG22_5_STAGING.externalDocumentId),
  };
}

async function findFg22CatalogueRow(client) {
  const byExt = await client.query(
    `select p.id, p.title, p.canonical_url, p.external_document_id, p.source_hash,
            (select id from regulatory_source_snapshots s where s.publication_id = p.id order by s.retrieved_at desc limit 1) as snapshot_id
     from regulatory_publications p
     join regulatory_sources rs on rs.id = p.source_id
     where rs.external_key = $1 and p.external_document_id = $2`,
    [FG22_5_STAGING.sourceId, FG22_5_STAGING.externalDocumentId],
  );
  if (byExt.rows[0]) return { row: byExt.rows[0], matchedBy: 'external_document_id' };

  const byCanonical = await client.query(
    `select p.id, p.title, p.canonical_url, p.external_document_id, p.source_hash,
            (select id from regulatory_source_snapshots s where s.publication_id = p.id order by s.retrieved_at desc limit 1) as snapshot_id
     from regulatory_publications p where p.canonical_url = $1`,
    [FG22_5_STAGING.canonicalPdfUrl],
  );
  if (byCanonical.rows[0]) return { row: byCanonical.rows[0], matchedBy: 'canonical_pdf_url' };

  const byUrl = await client.query(
    `select p.id, p.title, p.canonical_url, p.external_document_id, p.source_hash,
            (select id from regulatory_source_snapshots s where s.publication_id = p.id order by s.retrieved_at desc limit 1) as snapshot_id
     from regulatory_publications p
     where p.canonical_url ilike '%fg22%' or p.title ilike '%FG22/5%'`,
  );
  if (byUrl.rows.length === 1) return { row: byUrl.rows[0], matchedBy: 'title_or_url' };
  if (byUrl.rows.length > 1) return { row: null, matchedBy: 'ambiguous', candidates: byUrl.rows };
  return { row: null, matchedBy: 'none' };
}

function buildProposedMutations(ctx) {
  const { landing, pdfSha, existing, snapshotIdAfterIngest } = ctx;
  return [
    {
      entity: 'regulatory_publications',
      action: existing?.row ? 'SKIP (idempotent — row exists)' : 'INSERT',
      keys: {
        external_document_id: FG22_5_STAGING.externalDocumentId,
        title: FG22_5_STAGING.title,
        canonical_url: FG22_5_STAGING.canonicalPdfUrl,
        source_hash: pdfSha,
        source_id: FG22_5_STAGING.sourceId,
      },
    },
    {
      entity: 'regulatory_publication_versions',
      action: existing?.row?.source_hash === pdfSha ? 'SKIP (PDF hash unchanged)' : 'INSERT or bump version',
      source_hash: pdfSha,
      versionIdentity: 'anchored_to_primary_pdf_sha256',
    },
    {
      entity: 'regulatory_source_snapshots',
      action: existing?.row?.snapshot_id ? 'REUSE or INSERT version snapshot' : 'INSERT',
      discovery_html_url: landing.finalUrl,
      source_fingerprint: pdfSha,
      raw_content_sha256: landing.evidenceCapture?.rawSha256,
      note: 'HTML bytes are discovery index only; fingerprint matches PDF for extraction invariants',
    },
    {
      entity: 'storage.regulatory-source-snapshots',
      action: 'PUT (execute only)',
      objects: [
        'landing HTML raw + normalised artefacts',
        `primary PDF by-hash …${pdfSha.slice(0, 12)}…`,
        'pdf structured JSON + extracted text (pdf_primary_v1)',
      ],
    },
    {
      entity: 'regulatory_source_extraction_revisions',
      action: 'INSERT html_article_v2 (createExtractionRevision) + discovery semantics stamp',
      snapshotId: snapshotIdAfterIngest || '(after catalogue ingest)',
      htmlRole: 'fca_link_discovery_only',
    },
    {
      entity: 'regulatory_source_extraction_revisions',
      action: 'INSERT pdf_primary_v1 (createPrimaryPdfExtractionRevision)',
      sourceUrl: FG22_5_PRIMARY_PDF_URL,
      pdfSha256: pdfSha,
    },
    {
      entity: 'Fair value 56b0beca-…',
      action: 'NO CHANGE',
      revision: FG22_5_STAGING.fairValueHtmlRevisionId,
    },
  ];
}

async function loadSnapshotRow(client, snapshotId) {
  const snap = await client.query(`select * from regulatory_source_snapshots where id = $1`, [snapshotId]);
  return snap.rows[0];
}

async function main() {
  loadPlatformEnv(resolvePlatformRoot(import.meta.url));
  process.env.FORGENIQ_ENV = process.env.FORGENIQ_ENV || 'staging';

  if (execute && process.env.FORGENIQ_FG22_INGEST_APPROVED !== '1') {
    report.blocked = { reason: 'explicit_approval_required', env: 'FORGENIQ_FG22_INGEST_APPROVED=1' };
    return finish(2);
  }

  try {
    report.preflight = { gitBranch: assertApprovedStagingGitBranch() };
  } catch (e) {
    report.blocked = { reason: 'git_preflight', message: e.message };
    return finish(2);
  }

  const dbUrl = loadDatabaseUrl();
  if (!dbUrl) {
    report.blocked = { reason: 'staging_database_url_missing' };
    return finish(2);
  }

  try {
    validateStagingDatabaseUrl(dbUrl);
    assertStagingIngestIsolation({ environment: 'staging', databaseUrl: dbUrl });
    validateSupabaseSnapshotConfig({ environment: 'staging', requireApprovedStagingProject: true });
  } catch (e) {
    report.blocked = { reason: 'staging_isolation', message: e.message };
    return finish(2);
  }

  const urlCheck = assertApprovedPrimaryPdfUrl(FCA_PUBLICATIONS_RSS_SOURCE_KEY, FG22_5_PRIMARY_PDF_URL);
  if (!urlCheck.ok) {
    report.failure = urlCheck;
    report.overall = 'FAIL';
    return finish(1);
  }

  const landing = await resolveFg22LandingPage();
  report.landing = landing;
  if (!landing.ok) {
    report.failure = { code: landing.code, message: landing.message, probes: landing.probes };
    report.overall = 'FAIL';
    return finish(1);
  }

  const retrieved = await retrieveRegulatoryPrimaryPdf(FG22_5_PRIMARY_PDF_URL, {
    sourceExternalKey: FCA_PUBLICATIONS_RSS_SOURCE_KEY,
  });
  if (!retrieved.ok) {
    report.failure = retrieved;
    report.overall = 'FAIL';
    return finish(1);
  }
  if (retrieved.contentSha256 !== FG22_5_EXPECTED_PRIMARY_PDF_SHA256) {
    report.failure = {
      reason: 'primary_pdf_sha_mismatch',
      expected: FG22_5_EXPECTED_PRIMARY_PDF_SHA256,
      actual: retrieved.contentSha256,
    };
    report.overall = 'FAIL';
    return finish(1);
  }

  const extracted = await extractRegulatoryPdfContent(retrieved.body, {
    expectedTitle: 'FG22/5',
  });
  if (!extracted.ok || extracted.structured?.pageBoundaryConfirmed !== true) {
    report.failure = extracted;
    report.overall = 'FAIL';
    return finish(1);
  }

  report.pdf = {
    url: FG22_5_PRIMARY_PDF_URL,
    sha256: retrieved.contentSha256,
    byteLength: retrieved.byteLength,
    pageCount: extracted.pageCount,
    pageBoundaryConfirmed: true,
    parserVersion: extracted.parserVersion,
  };
  report.chapter7 = assessChapter7CitationReadiness(extracted.structured);
  report.publicationIdentity = {
    canonicalUrl: FG22_5_STAGING.canonicalPdfUrl,
    externalDocumentId: FG22_5_STAGING.externalDocumentId,
    versionSourceHash: retrieved.contentSha256,
    versionSourceHashMeaning: 'SHA-256 of immutable FG22/5 PDF bytes (not discovery HTML)',
    discoveryHtmlUrl: landing.finalUrl,
    discoveryHtmlFingerprint: landing.contentHash,
    collisionKeys: ['external_document_id FG22/5', `canonical_url ${FG22_5_STAGING.canonicalPdfUrl}`],
  };

  const client = new pg.Client(stagingPgClientOptions(dbUrl));
  await client.connect();

  try {
    const running = await client.query(
      `select count(*)::int as n from ingestion_runs where status = 'RUNNING'::ingestion_run_status`,
    );
    report.ingestionRuns = { running: running.rows[0].n };

    const fca = await client.query(
      `select rs.ingestion_mode::text as ingestion_mode, rso.enabled as monitoring_enabled
       from regulatory_sources rs
       left join regulatory_source_operations rso on rso.source_id = rs.id
       where rs.external_key = $1`,
      [FCA_PUBLICATIONS_RSS_SOURCE_KEY],
    );
    report.ingestionModeSafety = assessFg22ControlledIngestSafety(fca.rows[0] || {});
    report.fairValueGuard = await fairValueGuard(client);
    if (!report.fairValueGuard.pass) {
      report.failure = { reason: 'fair_value_guard_failed', detail: report.fairValueGuard };
      report.overall = 'FAIL';
      return finish(1);
    }

    const existing = await findFg22CatalogueRow(client);
    report.catalogue = { existing, duplicateCount: existing.row ? 1 : 0 };
    report.canonicalCollisionCheck = await checkCanonicalCollisions(client);
    if (report.canonicalCollisionCheck.collisions?.length) {
      report.failure = {
        reason: 'canonical_url_collision',
        collisions: report.canonicalCollisionCheck.collisions,
      };
      report.overall = 'FAIL';
      return finish(1);
    }

    const fcaModeBefore = fca.rows[0]?.ingestion_mode;
    report.executionSafety = {
      concurrentRunningIngestionRuns: running.rows[0].n,
      fcaIngestionModeUnchanged: true,
      fcaIngestionModeBefore: fcaModeBefore,
      fairValueGuard: report.fairValueGuard.pass,
      productionConnectionGuard: 'assertStagingIngestIsolation + validateStagingDatabaseUrl',
    };

    report.proposedMutations = buildProposedMutations({
      landing,
      pdfSha: retrieved.contentSha256,
      existing,
      snapshotIdAfterIngest: existing.row?.snapshot_id || null,
    });

    report.idempotency = {
      publication: 'Match external_document_id FG22/5 then canonical_url',
      catalogueIngest: 'unchanged metric when source_hash matches',
      htmlRevision: 'UNIQUE(source_snapshot_id, html_article_v2)',
      pdfRevision: 'UNIQUE(source_snapshot_id, pdf_primary_v1)',
      recovery:
        'On partial failure after storage upload: note revision/orphan ids, re-run --execute (idempotent_hit). On publication without snapshot: resolve ingestion_items error_detail, fix landing/PDF integrity, re-run.',
    };

    report.askRiRouting = {
      supplementNeedles: ['FG22/5', 'fg22-5', 'FG22'],
      fairValuePrimary: FG22_5_STAGING.fairValuePublicationId,
      readyAfterExecute: 'resolveSupplementaryPdfPublicationIds + pdf_primary_v1 on FG22 publication id',
      chapter7CitationReadiness: report.chapter7.meetsTwoPagePotential ? 'likely_sufficient' : 'review_after_index',
    };

    if (dryRun) {
      report.writesPerformed = false;
      report.overall = report.ingestionModeSafety.executeAllowed ? 'PASS_DRY_RUN' : 'PASS_DRY_RUN_EXECUTE_BLOCKED';
      if (!report.ingestionModeSafety.executeAllowed) {
        report.executeBlockedReason = report.ingestionModeSafety;
      }
      return finish(0);
    }

    if (!report.ingestionModeSafety.executeAllowed) {
      report.blocked = report.ingestionModeSafety;
      return finish(2);
    }

    if (running.rows[0].n > 0) {
      report.blocked = { reason: 'concurrent_running_ingestion' };
      return finish(2);
    }

    await ensureSnapshotStorageReady({ environment: 'staging', requirePrimaryPdfStorage: true });

    let publicationId = existing.row?.id;
    let snapshotId = existing.row?.snapshot_id;

    if (!publicationId || !snapshotId || existing.row?.source_hash !== retrieved.contentSha256) {
      const persist = await persistFg22ControlledCatalogue(client, {
        landing,
        primaryPdfSha256: retrieved.contentSha256,
        primaryPdfRetrievedAt: retrieved.retrievedAt,
        environment: 'staging',
        initiatedBy: 'fg22-5-controlled-ingest',
      });
      report.cataloguePersist = persist;
      publicationId = persist.publicationId;
      snapshotId = persist.snapshotId;
    }

    if (publicationId === FG22_5_STAGING.fairValuePublicationId) {
      report.failure = { reason: 'identity_collision_with_fair_value' };
      report.overall = 'FAIL';
      return finish(1);
    }

    const snapRow = await loadSnapshotRow(client, snapshotId);
    const config = validateSupabaseSnapshotConfig({ environment: 'staging', requireApprovedStagingProject: true });
    const rawBody = await downloadPrivateStorageObject({
      projectUrl: config.url,
      serviceRoleKey: config.serviceKey,
      bucket: BUCKET,
      objectPath: snapRow.raw_storage_path,
    });

    const htmlRev = await createExtractionRevision(client, {
      sourceSnapshotId: snapshotId,
      rawBody,
      canonicalUrl: snapRow.canonical_url || landing.finalUrl,
      createdBy: 'fg22-5-controlled-ingest',
      environment: 'staging',
    });
    if (htmlRev.revisionId && (htmlRev.created || htmlRev.outcome === 'idempotent_hit')) {
      await applyFg22DiscoveryHtmlRevisionSemantics(client, htmlRev.revisionId);
    }
    report.htmlRevision = htmlRev;

    const pdfRev = await createPrimaryPdfExtractionRevision(client, {
      sourceSnapshotId: snapshotId,
      pdfBytes: retrieved.body,
      contentSha256: retrieved.contentSha256,
      sourceUrl: FG22_5_PRIMARY_PDF_URL,
      extraction: extracted,
      environment: 'staging',
      createdBy: 'fg22-5-controlled-ingest',
    });
    report.pdfRevision = pdfRev;

    const fcaModeAfter = (
      await client.query(
        `select ingestion_mode::text from regulatory_sources where external_key = $1`,
        [FCA_PUBLICATIONS_RSS_SOURCE_KEY],
      )
    ).rows[0]?.ingestion_mode;
    report.postExecute = {
      publicationId,
      snapshotId,
      htmlRevisionId: htmlRev.revisionId,
      pdfRevisionId: pdfRev.revisionId,
      fcaIngestionModeAfter: fcaModeAfter,
    };
    report.writesPerformed = true;
    report.overall =
      htmlRev.outcome === 'idempotent_hit' && pdfRev.outcome === 'idempotent_hit'
        ? 'PASS_IDEMPOTENT'
        : 'PASS';
    finish(0);
  } finally {
    await client.end();
    await drainNetworkResources();
  }
}

main().catch((e) => {
  report.overall = 'FAIL';
  report.failure = { message: e.message, code: e.code };
  finish(1);
});
