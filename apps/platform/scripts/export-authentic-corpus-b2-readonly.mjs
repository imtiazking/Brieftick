#!/usr/bin/env node
/**
 * Read-only export: frozen core + B1 corpus copies + Batch B2 staging evidence (html + pdf blocks).
 */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync, copyFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { loadPlatformEnv, resolvePlatformRoot } from './staging/load-platform-env.mjs';
import {
  AUTHENTIC_CORPUS_B1_DIR,
  AUTHENTIC_CORPUS_B2_DIR,
  EVIDENCE_PACKS_DIR,
  REPO_ROOT,
} from '../lib/ri/eval/eval-paths.mjs';
import { EVIDENCE_PROVENANCE_CLASS } from '../lib/ri/semantic/regulatory-evidence-provenance.mjs';
import { loadPublicationHtmlEvidenceForAskRi } from '../lib/ri/ask-ri/load-publication-html-evidence.mjs';
import { loadPublicationPdfEvidenceForAskRi } from '../lib/ri/ask-ri/load-publication-pdf-evidence.mjs';
import { BATCH_B2_TARGETS } from './staging/batch-b2-targets.mjs';
import { auditPackTextCoverage, listSourceEvidenceBlocks } from '../lib/ri/semantic/evidence-pack-full-text.mjs';

const platformRoot = resolvePlatformRoot(import.meta.url);
loadPlatformEnv(platformRoot);

function sha256Json(obj) {
  return createHash('sha256').update(JSON.stringify(obj)).digest('hex');
}

function mergeEvidence(htmlEv, pdfEv) {
  const htmlBlocks = htmlEv?.evidenceBlocks || [];
  const pdfBlocks = pdfEv?.evidenceBlocks || [];
  const mergedBlocks = [...htmlBlocks, ...pdfBlocks];
  const base = htmlEv || pdfEv;
  return {
    ...base,
    evidenceBlocks: mergedBlocks,
    extractionProfiles: [htmlEv && 'html_article_v2', pdfEv && 'pdf_primary_v1'].filter(Boolean),
    htmlExtractionRevisionId: htmlEv?.extractionRevisionId || null,
    pdfExtractionRevisionId: pdfEv?.extractionRevisionId || null,
  };
}

function buildPack(target, publicationId, merged, profiles) {
  const blocks = merged.evidenceBlocks || [];
  return {
    packVersion: 1,
    publicationId,
    publicationTitle: target.verifiedTitle,
    publicationType: merged.publicationMetadata?.publicationType || target.publicationType,
    regulator: 'FCA',
    canonicalUrl: target.canonicalUrl,
    extractionRevisionId: merged.htmlExtractionRevisionId || merged.pdfExtractionRevisionId,
    extractionProfile: profiles.join('+'),
    contentSha256: merged.rawContentSha256 || sha256Json(blocks.slice(0, 3)),
    regulatoryStatus: merged.publicationMetadata?.publicationType || target.publicationType,
    blockCount: blocks.length,
    verifiedTextSamples: blocks.map((b) => ({
      documentEvidenceId: b.documentEvidenceId,
      pageNumber: b.pageNumber,
      sectionReference: b.sectionReference,
      extractedText: String(b.extractedText || ''),
    })),
    askRiEvidence: merged,
    provenanceClassification: EVIDENCE_PROVENANCE_CLASS.AUTHORITATIVE_STAGING_EXTRACTION,
    retrievalProvenance: {
      exportSource: 'b2_staging_readonly_export',
      exportedAt: new Date().toISOString(),
    },
    exportSource: 'b2_staging_readonly_export',
  };
}

async function main() {
  mkdirSync(AUTHENTIC_CORPUS_B2_DIR, { recursive: true });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    console.log(JSON.stringify({ ok: false, code: 'missing_supabase_credentials' }));
    process.exit(2);
  }
  const admin = createClient(url, key, { auth: { persistSession: false } });
  const manifest = {
    manifestVersion: 1,
    corpus: 'authentic-b2-2b2',
    createdAt: new Date().toISOString(),
    coreReusedFrom: EVIDENCE_PACKS_DIR,
    b1ReusedFrom: AUTHENTIC_CORPUS_B1_DIR,
    publications: [],
    reconciliation: [],
    errors: [],
  };

  for (const name of readdirSync(EVIDENCE_PACKS_DIR)) {
    if (!name.endsWith('.json') || name === 'manifest.json') continue;
    copyFileSync(join(EVIDENCE_PACKS_DIR, name), join(AUTHENTIC_CORPUS_B2_DIR, `core-${name}`));
    const pack = JSON.parse(readFileSync(join(EVIDENCE_PACKS_DIR, name), 'utf8'));
    manifest.publications.push({
      file: `core-${name}`,
      publicationId: pack.publicationId,
      exportSource: 'frozen_evidence_packs_copy',
    });
    manifest.reconciliation.push({
      publicationId: pack.publicationId,
      ...auditPackTextCoverage({ ...pack, packFile: `core-${name}` }),
    });
  }

  for (const name of readdirSync(AUTHENTIC_CORPUS_B1_DIR)) {
    if (!name.endsWith('.json')) continue;
    copyFileSync(join(AUTHENTIC_CORPUS_B1_DIR, name), join(AUTHENTIC_CORPUS_B2_DIR, name));
    if (name.startsWith('b1-') || name.startsWith('core-')) {
      const pack = JSON.parse(readFileSync(join(AUTHENTIC_CORPUS_B2_DIR, name), 'utf8'));
      manifest.publications.push({
        file: name,
        publicationId: pack.publicationId,
        exportSource: 'b1_corpus_copy',
      });
      manifest.reconciliation.push({
        publicationId: pack.publicationId,
        ...auditPackTextCoverage({ ...pack, packFile: name }),
      });
    }
  }

  const ingestReportPath = join(REPO_ROOT, 'docs', 'eval', 'phase-2b2-b2-ingest-report.json');
  let publicationIdByUrl = new Map(BATCH_B2_TARGETS.filter((t) => t.publicationId).map((t) => [t.canonicalUrl, t.publicationId]));
  try {
    const ingestReport = JSON.parse(readFileSync(ingestReportPath, 'utf8'));
    for (const p of ingestReport.publications || []) {
      if (p.resolvedPublicationId) publicationIdByUrl.set(p.canonicalUrl, p.resolvedPublicationId);
    }
  } catch {
    /* ingest report optional until after ingest */
  }

  for (const target of BATCH_B2_TARGETS) {
    const publicationId = publicationIdByUrl.get(target.canonicalUrl);
    if (!publicationId) {
      manifest.errors.push({ canonicalUrl: target.canonicalUrl, code: 'missing_publication_id' });
      continue;
    }

    const htmlLoaded = await loadPublicationHtmlEvidenceForAskRi(admin, {
      projectUrl: url,
      serviceRoleKey: key,
      publicationIds: [publicationId],
    });
    const htmlEv = htmlLoaded.evidence?.[0];

    let pdfEv = null;
    if (target.requiresPrimaryPdf) {
      const pdfLoaded = await loadPublicationPdfEvidenceForAskRi(admin, {
        projectUrl: url,
        serviceRoleKey: key,
        publicationIds: [publicationId],
      });
      pdfEv = pdfLoaded.evidence?.[0];
      if (!pdfEv) {
        manifest.errors.push({ publicationId, code: pdfLoaded.errors?.[0]?.code || 'no_pdf_evidence' });
        continue;
      }
    }

    if (!htmlEv) {
      manifest.errors.push({ publicationId, code: htmlLoaded.errors?.[0]?.code || 'no_html_evidence' });
      continue;
    }

    const merged = mergeEvidence(htmlEv, pdfEv);
    const profiles = target.requiresPrimaryPdf ? ['html_article_v2', 'pdf_primary_v1'] : ['html_article_v2'];
    const file = `b2-${publicationId.slice(0, 8)}-mixed-v1.json`;
    const pack = buildPack(target, publicationId, merged, profiles);
    writeFileSync(join(AUTHENTIC_CORPUS_B2_DIR, file), JSON.stringify(pack, null, 2));
    manifest.publications.push({
      file,
      publicationId,
      canonicalUrl: target.canonicalUrl,
      reference: target.reference,
      exportSource: 'b2_staging_readonly_export',
      htmlExtractionRevisionId: merged.htmlExtractionRevisionId,
      pdfExtractionRevisionId: merged.pdfExtractionRevisionId,
      totalEligibleBlocks: listSourceEvidenceBlocks(pack).length,
    });
    manifest.reconciliation.push({
      publicationId,
      reference: target.reference,
      ...auditPackTextCoverage({ ...pack, packFile: file }),
    });
  }

  writeFileSync(join(AUTHENTIC_CORPUS_B2_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(
    JSON.stringify({
      ok: manifest.errors.length === 0,
      dir: AUTHENTIC_CORPUS_B2_DIR,
      publications: manifest.publications.length,
      errors: manifest.errors,
    }),
  );
  process.exit(manifest.errors.length ? 1 : 0);
}

main();
