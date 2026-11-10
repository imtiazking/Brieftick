#!/usr/bin/env node
/**
 * Read-only export of Ask RI evaluation evidence packs into docs/eval/evidence-packs/.
 * No DB writes. No Storage writes.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { loadPlatformEnv, resolvePlatformRoot } from './staging/load-platform-env.mjs';
import { EVIDENCE_PACKS_DIR } from '../lib/ri/eval/eval-paths.mjs';
import { loadPublicationPdfEvidenceForAskRi } from '../lib/ri/ask-ri/load-publication-pdf-evidence.mjs';
import { loadPublicationHtmlEvidenceForAskRi } from '../lib/ri/ask-ri/load-publication-html-evidence.mjs';
import { FG22_5_STAGING } from '../lib/ri/ingestion/snapshot/fg22-5-staging-identity.mjs';
import { CP26_38_STAGING } from '../lib/ri/ingestion/snapshot/cp26-38-staging-identity.mjs';
import { FAIR_VALUE_CONSUMER_FINANCE_PUBLICATION_ID } from '../lib/ri/ask-ri/publication-question-scope.mjs';

const platformRoot = resolvePlatformRoot(import.meta.url);
loadPlatformEnv(platformRoot);

function sha256Json(obj) {
  return createHash('sha256').update(JSON.stringify(obj)).digest('hex');
}

const TARGETS = [
  {
    publicationId: FAIR_VALUE_CONSUMER_FINANCE_PUBLICATION_ID,
    fileBase: 'fair-value-consumer-finance',
    profile: 'html_article_v2',
    title: 'Fair value in consumer finance',
    regulatoryStatus: 'supervisory_examples',
  },
  {
    publicationId: 'a761cacc-8742-493d-b200-eb5d9a3ab884',
    fileBase: 'fg22-5-primary-pdf',
    profile: 'pdf_primary_v1',
    title: FG22_5_STAGING.title,
    regulatoryStatus: 'finalised_guidance',
    extractionRevisionId: '56fd1525-7f30-401e-82fd-16abf90100aa',
  },
  {
    publicationId: CP26_38_STAGING.publicationId,
    fileBase: 'cp26-38-primary-pdf',
    profile: 'pdf_primary_v1',
    title: 'CP26/38 Financial Crime Guide updates',
    regulatoryStatus: 'consultation',
    extractionRevisionId: CP26_38_STAGING.pdfExtractionRevisionId,
  },
  {
    publicationId: CP26_38_STAGING.publicationId,
    fileBase: 'cp26-38-html-article',
    profile: 'html_article_v2',
    title: 'CP26/38 Financial Crime Guide updates',
    regulatoryStatus: 'consultation',
    extractionRevisionId: CP26_38_STAGING.extractionRevisionId,
  },
];

async function tryStagingExport() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceRoleKey) return { ok: false, reason: 'missing_supabase_credentials' };

  const admin = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const packs = [];
  for (const t of TARGETS) {
    if (t.profile === 'pdf_primary_v1') {
      const loaded = await loadPublicationPdfEvidenceForAskRi(admin, {
        projectUrl: url,
        serviceRoleKey,
        publicationIds: [t.publicationId],
      });
      const ev = loaded.evidence?.[0];
      if (!ev) {
        packs.push({ target: t, error: loaded.errors?.[0]?.code || 'no_pdf_evidence' });
        continue;
      }
      packs.push({
        target: t,
        pack: buildPack(t, ev, 'staging_readonly'),
      });
    } else {
      const loaded = await loadPublicationHtmlEvidenceForAskRi(admin, {
        projectUrl: url,
        serviceRoleKey,
        publicationIds: [t.publicationId],
      });
      const ev = loaded.evidence?.[0];
      if (!ev) {
        packs.push({ target: t, error: loaded.errors?.[0]?.code || 'no_html_evidence' });
        continue;
      }
      packs.push({
        target: t,
        pack: buildPack(t, ev, 'staging_readonly'),
      });
    }
  }
  return { ok: true, packs };
}

function buildPack(target, askRiEvidence, exportSource) {
  const blockCount =
    askRiEvidence.evidenceBlocks?.length ??
    (Array.isArray(askRiEvidence.evidenceBlocks) ? askRiEvidence.evidenceBlocks.length : 0);
  const sampleBlocks = (askRiEvidence.evidenceBlocks || []).slice(0, 24).map((b) => ({
    documentEvidenceId: b.documentEvidenceId,
    pageNumber: b.pageNumber,
    sectionReference: b.sectionReference,
    extractedText: String(b.extractedText || '').slice(0, 500),
  }));
  return {
    packVersion: 1,
    publicationId: target.publicationId,
    publicationTitle: target.title,
    publicationType: askRiEvidence.publicationMetadata?.publicationType || target.regulatoryStatus,
    regulator: askRiEvidence.regulatorShortName || 'FCA',
    canonicalUrl: askRiEvidence.canonicalUrl || null,
    publicationVersionId: askRiEvidence.publicationVersionId || null,
    extractionRevisionId: askRiEvidence.extractionRevisionId || target.extractionRevisionId,
    extractionProfile: target.profile,
    contentSha256: askRiEvidence.rawContentSha256 || sha256Json(sampleBlocks),
    regulatoryStatus: target.regulatoryStatus,
    blockCount,
    verifiedTextSamples: sampleBlocks,
    askRiEvidence,
    retrievalProvenance: {
      exportSource,
      exportedAt: new Date().toISOString(),
    },
    profile: target.profile,
    exportSource,
  };
}

async function main() {
  mkdirSync(EVIDENCE_PACKS_DIR, { recursive: true });
  const report = { exportSource: null, packsWritten: [], errors: [] };
  const staging = await tryStagingExport();

  const writtenPubProfiles = new Set();
  if (staging.ok) {
    for (const row of staging.packs || []) {
      if (row.pack) {
        const filename = `${row.target.fileBase}-v1.json`;
        const path = join(EVIDENCE_PACKS_DIR, filename);
        writeFileSync(path, JSON.stringify(row.pack, null, 2));
        report.packsWritten.push({
          file: filename,
          publicationId: row.target.publicationId,
          profile: row.target.profile,
          exportSource: 'staging_readonly',
        });
        writtenPubProfiles.add(`${row.target.publicationId}:${row.target.profile}`);
        report.exportSource = 'staging_readonly';
      } else if (row.error) {
        report.errors.push({ publicationId: row.target.publicationId, code: row.error });
      }
    }
  } else if (staging.reason) {
    report.errors.push({ code: staging.reason });
  }

  const needOffline =
    writtenPubProfiles.size < TARGETS.length ||
    TARGETS.some((t) => !writtenPubProfiles.has(`${t.publicationId}:${t.profile}`));
  if (needOffline) {
    const { writeOfflineEvidenceFixtures } = await import('../lib/ri/eval/build-offline-evidence-fixtures.mjs');
    const before = report.packsWritten.length;
    writeOfflineEvidenceFixtures(EVIDENCE_PACKS_DIR, report);
    if (!report.exportSource) report.exportSource = 'offline_fixture_subset';
    else if (before < report.packsWritten.length) report.exportSource = 'staging_readonly_with_offline_fill';
  }

  const manifest = {
    manifestVersion: 1,
    createdAt: new Date().toISOString(),
    exportSource: report.exportSource,
    packs: report.packsWritten,
    errors: report.errors,
  };
  writeFileSync(join(EVIDENCE_PACKS_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.packsWritten.length ? 0 : 2);
}

await main();
