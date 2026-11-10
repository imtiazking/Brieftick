#!/usr/bin/env node
/**
 * Read-only supplemental corpus export for Phase 2B.2 Step C.
 * Writes only under docs/eval/supplemental-corpus-2b2/ — never touches evidence-packs.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { loadPlatformEnv, resolvePlatformRoot } from './staging/load-platform-env.mjs';
import { SUPPLEMENTAL_CORPUS_2B2_DIR } from '../lib/ri/eval/eval-paths.mjs';
import {
  COOKIE_CSS_BEFORE_ARTICLE,
  DATA_PAGE_ARTICLE,
  POLICY_STATEMENT_PAGE,
  CONSULTATION_PAGE,
  MULTI_FIRM_PAGE,
} from '../../../integrations/regulatory-sources/fixtures/fca-html-samples.mjs';

const platformRoot = resolvePlatformRoot(import.meta.url);
loadPlatformEnv(platformRoot);

const CORE_IDS = new Set([
  '56b0beca-d8c3-4267-a794-9079009af661',
  'a761cacc-8742-493d-b200-eb5d9a3ab884',
  '4d05b49b-a4a4-4101-8c87-7d3983315f25',
]);

function sha256Json(obj) {
  return createHash('sha256').update(JSON.stringify(obj)).digest('hex');
}

function stripHtml(html) {
  return String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function paragraphSamplesFromHtml(html, sectionPrefix) {
  const text = stripHtml(html);
  const chunks = text.split(/(?<=[.!?])\s+/).filter((s) => s.length > 40);
  return chunks.slice(0, 6).map((extractedText, i) => ({
    documentEvidenceId: createHash('sha256').update(`${sectionPrefix}:${i}:${extractedText.slice(0, 40)}`).digest('hex').slice(0, 16),
    sectionReference: `${sectionPrefix} §${i + 1}`,
    extractedText,
  }));
}

function buildMetadataPack(pub, samples, profile, regulatoryStatus) {
  return {
    packVersion: 1,
    publicationId: pub.id,
    publicationTitle: stripHtml(pub.title).slice(0, 240),
    publicationType: pub.publication_type,
    regulator: pub.canonical_url?.includes('fca.org.uk') ? 'FCA' : 'OTHER',
    canonicalUrl: pub.canonical_url,
    externalDocumentId: pub.external_document_id,
    extractionRevisionId: null,
    extractionProfile: profile,
    contentSha256: sha256Json({ id: pub.id, samples: samples.length }),
    regulatoryStatus,
    blockCount: samples.length,
    verifiedTextSamples: samples,
    retrievalProvenance: {
      exportSource: 'staging_catalogue_readonly',
      evidenceDepth: 'metadata_plus_public_fixture_excerpt',
      exportedAt: new Date().toISOString(),
      note:
        'Staging catalogue row with no local extraction revision; substantive text from public FCA HTML regression fixtures or catalogue abstract only.',
    },
    profile,
    exportSource: 'staging_catalogue_readonly',
  };
}

const FIXTURE_BY_KEYWORD = [
  { match: /crypto|mining/i, html: POLICY_STATEMENT_PAGE, status: 'policy_statement' },
  { match: /financial crime|money laundering|fraud/i, html: CONSULTATION_PAGE, status: 'consultation' },
  { match: /consumer|fair value|duty/i, html: MULTI_FIRM_PAGE, status: 'supervisory' },
  { match: /cash|mortgage|data/i, html: DATA_PAGE_ARTICLE, status: 'data_publication' },
  { match: /operational|resilience|policy statement/i, html: POLICY_STATEMENT_PAGE, status: 'policy_statement' },
  { match: /.*/, html: COOKIE_CSS_BEFORE_ARTICLE, status: 'publication' },
];

function samplesForPublication(pub) {
  const title = stripHtml(pub.title);
  const fixture = FIXTURE_BY_KEYWORD.find((f) => f.match.test(title) || f.match.test(pub.canonical_url || ''));
  const base = paragraphSamplesFromHtml(fixture.html, title.slice(0, 48) || 'section');
  base.unshift({
    documentEvidenceId: createHash('sha256').update(`${pub.id}:abstract`).digest('hex').slice(0, 16),
    sectionReference: 'Catalogue abstract',
    extractedText: `${title}. This staging catalogue entry is included to introduce realistic publication competition during offline retrieval evaluation. It does not imply full evidence pack availability.`,
  });
  return { samples: base, regulatoryStatus: fixture.status };
}

async function loadSupplementalCandidates(admin) {
  const selectors = [
    { column: 'canonical_url', pattern: '%fca.org.uk%', limit: 30 },
    { column: 'title', pattern: '%financial crime%', limit: 12 },
    { column: 'title', pattern: '%consumer%', limit: 12 },
    { column: 'title', pattern: '%crypto%', limit: 8 },
    { column: 'title', pattern: '%consultation%', limit: 12 },
    { column: 'title', pattern: '%guidance%', limit: 12 },
    { column: 'title', pattern: '%fair value%', limit: 8 },
    { column: 'title', pattern: '%fraud%', limit: 8 },
  ];

  const byId = new Map();
  for (const sel of selectors) {
    const { data } = await admin
      .from('regulatory_publications')
      .select('id,title,publication_type,external_document_id,canonical_url')
      .ilike(sel.column, sel.pattern)
      .limit(sel.limit);
    for (const row of data || []) {
      if (!CORE_IDS.has(row.id)) byId.set(row.id, row);
    }
  }
  return [...byId.values()].slice(0, 18);
}

async function main() {
  mkdirSync(SUPPLEMENTAL_CORPUS_2B2_DIR, { recursive: true });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  const composition = {
    manifestVersion: 1,
    createdAt: new Date().toISOString(),
    exportSource: null,
    unavailableSourceMaterial: [],
    packs: [],
    errors: [],
  };

  if (!url || !key) {
    composition.errors.push({ code: 'missing_supabase_credentials' });
    composition.unavailableSourceMaterial.push('Staging catalogue could not be queried; supplemental export skipped.');
    writeFileSync(join(SUPPLEMENTAL_CORPUS_2B2_DIR, 'catalogue.json'), JSON.stringify(composition, null, 2));
    console.log(JSON.stringify({ ok: false, composition }));
    process.exit(2);
  }

  const admin = createClient(url, key, { auth: { persistSession: false } });
  const candidates = await loadSupplementalCandidates(admin);
  if (candidates.length < 10) {
    composition.unavailableSourceMaterial.push(
      `Only ${candidates.length} non-core staging catalogue publications matched selectors; target was 10–20.`,
    );
  }

  const { count: revCount } = await admin
    .from('regulatory_source_extraction_revisions')
    .select('publication_id', { count: 'exact', head: true });

  if ((revCount ?? 0) <= 3) {
    composition.unavailableSourceMaterial.push(
      'Staging has full text extractions for only three publications; supplemental packs use catalogue metadata plus public fixture excerpts.',
    );
  }

  for (const pub of candidates) {
    const { samples, regulatoryStatus } = samplesForPublication(pub);
    const fileBase = `${pub.id.slice(0, 8)}-catalogue-excerpt`;
    const pack = buildMetadataPack(pub, samples, 'html_article_v2', regulatoryStatus);
    const filename = `${fileBase}-v1.json`;
    writeFileSync(join(SUPPLEMENTAL_CORPUS_2B2_DIR, filename), JSON.stringify(pack, null, 2));
    composition.packs.push({
      file: filename,
      publicationId: pub.id,
      title: pack.publicationTitle,
      profile: 'html_article_v2',
      exportSource: 'staging_catalogue_readonly',
    });
  }

  composition.exportSource = 'staging_catalogue_readonly';
  writeFileSync(join(SUPPLEMENTAL_CORPUS_2B2_DIR, 'catalogue.json'), JSON.stringify(composition, null, 2));
  console.log(JSON.stringify({ ok: true, packsWritten: composition.packs.length, composition }));
}

await main();
