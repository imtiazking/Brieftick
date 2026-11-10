#!/usr/bin/env node
/**
 * BUS-UAT-018 — FG22/5 controlled ingest preflight (default: dry-run, no DB/storage writes).
 *
 *   node scripts/staging/preflight-fg22-5-ingest.mjs
 *   node scripts/staging/preflight-fg22-5-ingest.mjs --dry-run
 *
 * Execution (blocked until operator approval — script exits unless --execute and FORGENIQ_FG22_INGEST_APPROVED=1):
 *   FORGENIQ_FG22_INGEST_APPROVED=1 node scripts/staging/preflight-fg22-5-ingest.mjs --execute
 */
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';
import {
  assertApprovedPrimaryPdfUrl,
  FCA_PUBLICATIONS_RSS_SOURCE_KEY,
  FG22_5_PRIMARY_PDF_URL,
} from '../../../../integrations/regulatory-sources/core/regulatory-pdf-allowlist.mjs';
import { retrieveRegulatoryPrimaryPdf } from '../../../../integrations/regulatory-sources/core/regulatory-pdf-retrieval.mjs';
import { extractRegulatoryPdfContent } from '../../../../integrations/regulatory-sources/core/regulatory-pdf-extract.mjs';
import { loadPlatformEnv, resolvePlatformRoot } from './load-platform-env.mjs';
import {
  stagingPgClientOptions,
  validateStagingDatabaseUrl,
} from '../../lib/ri/ingestion/snapshot/staging-database-config.mjs';
import { assertApprovedStagingGitBranch } from '../../lib/ri/ingestion/snapshot/staging-git-preflight.mjs';

const FAIR_VALUE_PUB_ID = '56b0beca-d8c3-4267-a794-9079009af661';
const FG22_LANDING_URL = 'https://www.fca.org.uk/publication/finalised-guidance/fg22-5';
const FG22_TITLE = 'FG22/5 — Final non-Handbook Guidance for firms on the Consumer Duty';

const dryRun = !process.argv.includes('--execute');
const execute = process.argv.includes('--execute');

const report = {
  step: 'bus-uat-018-fg22-5-ingest-preflight',
  mode: dryRun ? 'dry-run' : 'execute-blocked',
  document: {
    title: FG22_TITLE,
    pdfUrl: FG22_5_PRIMARY_PDF_URL,
    landingUrl: FG22_LANDING_URL,
    focusSection: 'Chapter 7 — The price and value outcome',
  },
  duplicateCheck: {},
  fairValueGuard: {},
  pdfRetrieval: {},
  pdfExtraction: {},
  chapter7: {},
  pipeline: {},
  proposedMutations: [],
  idempotency: {},
  askRiRouting: {},
  risks: [],
  executionCommand: null,
  overall: 'DRY_RUN',
};

function loadDatabaseUrl() {
  for (const key of ['STAGING_DATABASE_URL', 'DATABASE_URL', 'FORGENIQ_LOCAL_PG_URL']) {
    if (process.env[key]?.trim()) return process.env[key].trim();
  }
  return null;
}

async function catalogueDuplicateCheck(admin) {
  const patterns = await admin
    .from('regulatory_publications')
    .select('id, title, canonical_url, external_document_id, data_origin, created_at')
    .or(
      'title.ilike.%FG22%,external_document_id.ilike.%FG22%,canonical_url.ilike.%fg22-5%,canonical_url.ilike.%fg22%',
    )
    .limit(20);

  const fairValue = await admin
    .from('regulatory_publications')
    .select('id, title, canonical_url')
    .eq('id', FAIR_VALUE_PUB_ID)
    .maybeSingle();

  const fvRevisions = await admin
    .from('regulatory_source_extraction_revisions')
    .select('id, extraction_profile, publication_id, created_at')
    .eq('publication_id', FAIR_VALUE_PUB_ID);

  report.duplicateCheck = {
    fg22Matches: patterns.data || [],
    duplicateCount: patterns.data?.length ?? 0,
    fairValuePublication: fairValue.data,
    fairValueHtmlRevisions: (fvRevisions.data || []).filter((r) => r.extraction_profile === 'html_article_v2'),
    fairValuePdfRevisions: (fvRevisions.data || []).filter((r) => r.extraction_profile === 'pdf_primary_v1'),
  };

  if ((patterns.data || []).some((p) => /fg22/i.test(`${p.title} ${p.external_document_id || ''}`))) {
    report.risks.push('Existing FG22-like catalogue row found — ingest must be idempotent or skip duplicate publication create.');
  } else {
    report.risks.push('No FG22/5 catalogue row — new publication registration required before PDF extraction.');
  }
}

function proposedMutationPlan(pdfSha, extraction) {
  report.proposedMutations = [
    {
      entity: 'regulatory_publications',
      action: 'INSERT (if no FG22/5 row)',
      fields: {
        title: FG22_TITLE,
        canonical_url: FG22_LANDING_URL,
        external_document_id: 'FG22/5',
        publication_type: 'finalised_guidance',
        data_origin: 'fca_catalogue_controlled_ingest',
        regulator: 'FCA (SRC-FCA-PUBLICATIONS-RSS)',
      },
      note: 'Distinct UUID; must not reuse 56b0beca-…',
    },
    {
      entity: 'regulatory_publication_versions',
      action: 'INSERT v1',
      note: 'Linked to new FG22/5 publication_id; source_hash from HTML landing snapshot fingerprint',
    },
    {
      entity: 'regulatory_source_snapshots',
      action: 'INSERT',
      fields: {
        canonical_url: FG22_LANDING_URL,
        content_type: 'text/html; charset=UTF-8',
        raw_content_sha256: '<from FCA landing HTML fetch>',
      },
      note: 'Step-80 architecture requires html snapshot on same source_snapshot_id before pdf_primary_v1',
    },
    {
      entity: 'storage.regulatory-source-snapshots',
      action: 'PUT content-addressed objects',
      objects: [
        '{sha}.raw.html (FCA landing page)',
        `{${pdfSha?.slice(0, 16) || 'pdf-sha'}…}.primary.pdf`,
        'pdf.structured.json + pdf.extracted.txt + extraction-revision.meta.json (via uploadPrimaryPdfExtractionArtefacts)',
      ],
    },
    {
      entity: 'regulatory_source_extraction_revisions',
      action: 'INSERT html_article_v2 (createExtractionRevision)',
      note: 'Publication metadata includes pdf_attachments[] with FG22_5_PRIMARY_PDF_URL; idempotent per snapshot',
    },
    {
      entity: 'regulatory_source_extraction_revisions',
      action: 'INSERT pdf_primary_v1 (createPrimaryPdfExtractionRevision)',
      note: 'Uses verified PDF bytes; pageBoundaryConfirmed must be true; idempotent per snapshot+profile',
    },
    {
      entity: 'regulatory_publications (Fair value)',
      action: 'NO CHANGE',
      publicationId: FAIR_VALUE_PUB_ID,
    },
  ];

  report.pipeline = {
    establishedMechanism: 'Step 80 CP26/38 pattern (html_article_v2 + pdf_primary_v1 on same snapshot)',
    htmlStep: 'createExtractionRevision (backfill-fair-value pattern) on FG22 landing HTML',
    pdfStep: 'createPrimaryPdfExtractionRevision (ingest-cp26-38-primary-pdf pattern)',
    fcaIngestionMode: 'Must remain DISABLED (controlled operator ingest only)',
    pageBoundaries: extraction?.structured?.pageBoundaryConfirmed === true ? 'confirmed_in_preflight' : 'pending_preflight',
    pageCount: extraction?.pageCount ?? null,
    parserVersion: extraction?.parserVersion ?? null,
  };

  report.idempotency = {
    publication: 'Skip create if FG22/5 external_document_id or canonical_url already exists',
    htmlRevision: 'UNIQUE(source_snapshot_id, html_article_v2) — createExtractionRevision idempotent_hit',
    pdfRevision: 'UNIQUE(source_snapshot_id, pdf_primary_v1) — createPrimaryPdfExtractionRevision idempotent_hit',
    storage: 'Content-addressed paths dedupe identical bytes',
  };

  report.askRiRouting = {
    primaryQuestionPublication: FAIR_VALUE_PUB_ID,
    supplementResolver: 'resolveSupplementaryPdfPublicationIds (FG22/5 needles)',
    pdfLoader: 'loadPublicationPdfEvidenceForAskRi on supplementary FG22 publication UUID only',
    citationAttribution: 'mergeCatalogueCitations marks PDF as separate catalogue publication',
    readiness: 'Ready after FG22 pdf_primary_v1 revision exists; no CP26/38 fallback for Consumer Duty question',
  };

  report.executionCommand =
    'FORGENIQ_FG22_INGEST_APPROVED=1 FORGENIQ_ENV=staging node scripts/staging/ingest-fg22-5-primary-pdf.mjs --execute';
}

function detectChapter7(structured) {
  const sections = structured?.sections || [];
  const pages = structured?.pages || [];
  const chapter7Sections = sections.filter((s) => /chapter\s*7|price and value/i.test(s.heading || ''));
  const chapter7Pages = new Set(chapter7Sections.map((s) => s.pageNumber));
  const keywordPages = pages
    .filter((p) => /price and value|fair value|consumer duty/i.test(p.text || ''))
    .map((p) => p.pageNumber);
  report.chapter7 = {
    sectionHeadings: chapter7Sections.map((s) => ({ heading: s.heading, pageNumber: s.pageNumber })),
    candidatePhysicalPages: [...new Set([...chapter7Pages, ...keywordPages])].sort((a, b) => a - b).slice(0, 12),
    citationPotential:
      [...new Set([...chapter7Pages, ...keywordPages])].length >= 2 ? 'meets_uat_two_pdf_citations' : 'needs_manual_page_pick_after_ingest',
  };
}

async function main() {
  loadPlatformEnv(resolvePlatformRoot(import.meta.url));
  process.env.FORGENIQ_ENV = process.env.FORGENIQ_ENV || 'staging';

  if (execute && process.env.FORGENIQ_FG22_INGEST_APPROVED !== '1') {
    report.overall = 'BLOCKED';
    report.blocked = {
      reason: 'explicit_approval_required',
      hint: 'Set FORGENIQ_FG22_INGEST_APPROVED=1 after reviewing this dry-run report',
    };
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = 2;
    return;
  }

  if (execute) {
    report.overall = 'BLOCKED';
    report.blocked = {
      reason: 'use_ingest_script',
      message: 'Use scripts/staging/ingest-fg22-5-primary-pdf.mjs --execute after approval',
    };
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = 2;
    return;
  }

  try {
    report.preflight = { gitBranch: assertApprovedStagingGitBranch() };
  } catch (e) {
    report.preflight = { gitBranchError: e.message };
  }

  const urlCheck = assertApprovedPrimaryPdfUrl(FCA_PUBLICATIONS_RSS_SOURCE_KEY, FG22_5_PRIMARY_PDF_URL);
  report.pdfRetrieval.allowlist = urlCheck;
  if (!urlCheck.ok) {
    report.overall = 'FAIL';
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = 1;
    return;
  }

  const retrieved = await retrieveRegulatoryPrimaryPdf(FG22_5_PRIMARY_PDF_URL, {
    sourceExternalKey: FCA_PUBLICATIONS_RSS_SOURCE_KEY,
  });
  if (!retrieved.ok) {
    report.pdfRetrieval = retrieved;
    report.overall = 'FAIL';
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = 1;
    return;
  }

  report.pdfRetrieval = {
    ok: true,
    finalUrl: retrieved.finalUrl,
    byteLength: retrieved.byteLength,
    contentSha256: retrieved.contentSha256,
    retrievedAt: retrieved.retrievedAt,
    redirectTrail: retrieved.redirectTrail?.length ?? 0,
  };

  const extracted = await extractRegulatoryPdfContent(retrieved.body, {
    expectedTitle: 'FG22/5',
  });
  report.pdfExtraction = {
    ok: extracted.ok,
    extractionStatus: extracted.extractionStatus,
    pageCount: extracted.pageCount,
    pageBoundaryConfirmed: extracted.structured?.pageBoundaryConfirmed,
    parserVersion: extracted.parserVersion,
    warnings: extracted.warnings?.slice(0, 8),
  };

  if (!extracted.ok) {
    report.overall = 'FAIL';
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = 1;
    return;
  }

  detectChapter7(extracted.structured);

  const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (projectUrl && serviceKey) {
    const admin = createClient(projectUrl, serviceKey, { auth: { persistSession: false } });
    await catalogueDuplicateCheck(admin);
  } else {
    report.duplicateCheck = { skipped: 'missing supabase env' };
  }

  const dbUrl = loadDatabaseUrl();
  if (dbUrl) {
    try {
      validateStagingDatabaseUrl(dbUrl);
      const client = new pg.Client(stagingPgClientOptions(dbUrl));
      await client.connect();
      const fca = await client.query(
        `select ingestion_mode::text from regulatory_sources where external_key = $1`,
        [FCA_PUBLICATIONS_RSS_SOURCE_KEY],
      );
      const bucketMime = await client.query(
        `select allowed_mime_types from storage.buckets where id = 'regulatory-source-snapshots'`,
      );
      report.stagingGuards = {
        fcaIngestionMode: fca.rows[0]?.ingestion_mode,
        snapshotBucketPdfMimeAllowed: (bucketMime.rows[0]?.allowed_mime_types || []).includes('application/pdf'),
      };
      if (fca.rows[0]?.ingestion_mode !== 'DISABLED') {
        report.risks.push('FCA ingestion_mode is not DISABLED — controlled ingest policy violation.');
      }
      await client.end();
    } catch (e) {
      report.stagingGuards = { error: e.message };
    }
  }

  proposedMutationPlan(retrieved.contentSha256, extracted);
  report.overall = 'PASS_DRY_RUN';
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  report.overall = 'FAIL';
  report.failure = e.message;
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = 1;
});
