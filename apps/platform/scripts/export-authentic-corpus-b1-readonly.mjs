#!/usr/bin/env node
/**
 * Read-only export of Batch B1 + frozen core packs into docs/eval/authentic-corpus-b1-2b2/
 */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync, copyFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { loadPlatformEnv, resolvePlatformRoot } from './staging/load-platform-env.mjs';
import { AUTHENTIC_CORPUS_B1_DIR, EVIDENCE_PACKS_DIR } from '../lib/ri/eval/eval-paths.mjs';
import { EVIDENCE_PROVENANCE_CLASS } from '../lib/ri/semantic/regulatory-evidence-provenance.mjs';
import { loadPublicationHtmlEvidenceForAskRi } from '../lib/ri/ask-ri/load-publication-html-evidence.mjs';
import { BATCH_B1_TARGETS } from './staging/batch-b1-targets.mjs';

const platformRoot = resolvePlatformRoot(import.meta.url);
loadPlatformEnv(platformRoot);

function sha256Json(obj) {
  return createHash('sha256').update(JSON.stringify(obj)).digest('hex');
}

function buildPack(target, ev) {
  return {
    packVersion: 1,
    publicationId: target.publicationId,
    publicationTitle: target.title,
    publicationType: ev.publicationMetadata?.publicationType || target.sourceType,
    regulator: 'FCA',
    canonicalUrl: target.canonicalUrl,
    extractionRevisionId: ev.extractionRevisionId,
    extractionProfile: 'html_article_v2',
    contentSha256: ev.rawContentSha256 || sha256Json(ev.evidenceBlocks?.slice(0, 3)),
    regulatoryStatus: ev.publicationMetadata?.publicationType || target.sourceType,
    blockCount: ev.evidenceBlocks?.length ?? 0,
    verifiedTextSamples: (ev.evidenceBlocks || []).map((b) => ({
      documentEvidenceId: b.documentEvidenceId,
      sectionReference: b.sectionReference,
      extractedText: String(b.extractedText || ''),
    })),
    askRiEvidence: ev,
    provenanceClassification: EVIDENCE_PROVENANCE_CLASS.AUTHORITATIVE_STAGING_EXTRACTION,
    retrievalProvenance: {
      exportSource: 'b1_staging_readonly_export',
      exportedAt: new Date().toISOString(),
    },
    exportSource: 'b1_staging_readonly_export',
  };
}

async function main() {
  mkdirSync(AUTHENTIC_CORPUS_B1_DIR, { recursive: true });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    console.log(JSON.stringify({ ok: false, code: 'missing_supabase_credentials' }));
    process.exit(2);
  }
  const admin = createClient(url, key, { auth: { persistSession: false } });
  const manifest = {
    manifestVersion: 1,
    corpus: 'authentic-b1-2b2',
    createdAt: new Date().toISOString(),
    coreReusedFrom: EVIDENCE_PACKS_DIR,
    b1Publications: [],
    errors: [],
  };

  for (const name of readdirSync(EVIDENCE_PACKS_DIR)) {
    if (!name.endsWith('.json') || name === 'manifest.json') continue;
    copyFileSync(join(EVIDENCE_PACKS_DIR, name), join(AUTHENTIC_CORPUS_B1_DIR, `core-${name}`));
    const pack = JSON.parse(readFileSync(join(EVIDENCE_PACKS_DIR, name), 'utf8'));
    manifest.b1Publications.push({
      file: `core-${name}`,
      publicationId: pack.publicationId,
      extractionRevisionId: pack.extractionRevisionId,
      exportSource: 'frozen_evidence_packs_copy',
    });
  }

  for (const target of BATCH_B1_TARGETS) {
    const loaded = await loadPublicationHtmlEvidenceForAskRi(admin, {
      projectUrl: url,
      serviceRoleKey: key,
      publicationIds: [target.publicationId],
    });
    const ev = loaded.evidence?.[0];
    if (!ev) {
      manifest.errors.push({ publicationId: target.publicationId, code: loaded.errors?.[0]?.code || 'no_html_evidence' });
      continue;
    }
    const file = `b1-${target.publicationId.slice(0, 8)}-html-v1.json`;
    const pack = buildPack(target, ev);
    writeFileSync(join(AUTHENTIC_CORPUS_B1_DIR, file), JSON.stringify(pack, null, 2));
    manifest.b1Publications.push({
      file,
      publicationId: target.publicationId,
      extractionRevisionId: ev.extractionRevisionId,
      canonicalUrl: target.canonicalUrl,
      exportSource: 'b1_staging_readonly_export',
    });
  }

  writeFileSync(join(AUTHENTIC_CORPUS_B1_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(JSON.stringify({ ok: manifest.errors.length === 0, packs: manifest.b1Publications.length, errors: manifest.errors }));
}

await main();
