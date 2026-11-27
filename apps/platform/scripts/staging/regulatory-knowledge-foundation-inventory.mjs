#!/usr/bin/env node
/**
 * Tranche G — read-only regulatory knowledge foundation inventory (staging catalogue).
 */
import pg from 'pg';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REPO_ROOT } from '../../lib/ri/eval/eval-paths.mjs';
import { config as dotenvConfig } from 'dotenv';
import { loadPlatformEnv, resolvePlatformRoot } from './load-platform-env.mjs';

const platformRoot = resolvePlatformRoot(import.meta.url);
loadPlatformEnv(platformRoot);
for (const name of ['.env.local', '.env.uat-secrets.local', '.env.staging.pull']) {
  const p = join(platformRoot, name);
  if (existsSync(p)) dotenvConfig({ path: p, override: false });
}

const day = new Date().toISOString().slice(0, 10);
const outDir =
  process.env.RK_INVENTORY_OUT ||
  join(REPO_ROOT, 'docs', 'uat', 'evidence', `regulatory-knowledge-foundation-${day}`);

const url = process.env.STAGING_DATABASE_URL?.trim();
if (!url || /@base(\b|:|\/)/i.test(url)) {
  console.error('STAGING_DATABASE_URL required (valid staging Postgres host)');
  process.exit(2);
}

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();

const detailSql = `
with latest_html as (
  select distinct on (publication_id)
    publication_id,
    id as revision_id,
    extraction_profile,
    extraction_quality,
    publication_metadata,
    pdf_attachments,
    normalised_text_storage_path,
    provenance,
    created_at
  from regulatory_source_extraction_revisions
  where extraction_profile = 'html_article_v2'
  order by publication_id, created_at desc
),
latest_pdf as (
  select distinct on (publication_id)
    publication_id,
    id as revision_id,
    extraction_profile,
    extraction_quality,
    publication_metadata,
    pdf_attachments,
    normalised_text_storage_path,
    provenance,
    created_at
  from regulatory_source_extraction_revisions
  where extraction_profile = 'pdf_primary_v1'
  order by publication_id, created_at desc
),
snap_counts as (
  select v.publication_id, count(*)::int as snapshot_count
  from regulatory_source_snapshots s
  join regulatory_publication_versions v on v.id = s.publication_version_id
  group by v.publication_id
)
select
  p.id,
  p.title,
  p.publication_type,
  p.canonical_url,
  p.external_document_id,
  p.data_origin,
  p.provenance,
  p.publication_date,
  p.effective_date,
  p.retrieved_at,
  reg.external_key as regulator_key,
  reg.jurisdiction,
  src.external_key as source_key,
  coalesce(sc.snapshot_count, 0) as snapshot_count,
  case when p.canonical_url ~* '\\.pdf(\\?|#|$)' then true else false end as canonical_is_pdf,
  case when p.canonical_url ~* '^https?://' and p.canonical_url !~* '\\.pdf(\\?|#|$)' then true else false end as likely_html_url,
  lh.revision_id as html_revision_id,
  lh.extraction_quality as html_quality,
  lh.normalised_text_storage_path as html_text_path,
  lh.publication_metadata as html_metadata,
  lp.revision_id as pdf_revision_id,
  lp.extraction_quality as pdf_quality,
  lp.normalised_text_storage_path as pdf_text_path,
  coalesce(jsonb_array_length(lp.pdf_attachments), 0) as pdf_attachment_count
from regulatory_publications p
join regulators reg on reg.id = p.regulator_id
join regulatory_sources src on src.id = p.source_id
left join snap_counts sc on sc.publication_id = p.id
left join latest_html lh on lh.publication_id = p.id
left join latest_pdf lp on lp.publication_id = p.id
order by reg.external_key, p.publication_date desc nulls last, p.title
`;

const { rows } = await client.query(detailSql);

function normStatus(quality) {
  if (!quality || typeof quality !== 'object') return 'none';
  const w = quality.webpageExtraction?.status;
  if (typeof w === 'string' && w.length) return w.toLowerCase();
  const p = quality.primaryDocument?.completeness;
  if (p === 'complete') return 'primary_pdf_complete';
  return 'unknown';
}

function classify(row) {
  const htmlStatus = normStatus(row.html_quality);
  const pdfStatus = normStatus(row.pdf_quality);
  const htmlComplete = htmlStatus === 'complete';
  const pdfComplete = pdfStatus === 'complete' || pdfStatus === 'primary_pdf_complete';
  const hasTextPath = Boolean(row.html_text_path || row.pdf_text_path);
  const obligationGrade =
    row.pdf_quality?.obligationGradeSuitable === true || row.html_quality?.obligationGradeSuitable === true;

  let knowledgeClass = 'metadata_only';
  let indexingStatus = 'not_indexed';
  if (htmlComplete || pdfComplete) {
    knowledgeClass = hasTextPath ? 'searchable_content' : 'extracted_metadata_incomplete_storage';
    indexingStatus = pdfComplete && row.pdf_revision_id ? 'pdf_primary_indexed' : htmlComplete ? 'html_article_indexed' : 'partial';
  } else if (htmlStatus !== 'none' || pdfStatus !== 'none') {
    knowledgeClass = 'extraction_attempted_incomplete';
    indexingStatus = 'failed_or_in_progress';
  }

  const failures = [];
  if (row.snapshot_count === 0) failures.push('no_source_snapshot');
  if (htmlStatus === 'failed') failures.push('html_extraction_failed');
  if (pdfStatus === 'failed') failures.push('pdf_extraction_failed');
  if (row.canonical_is_pdf && !row.pdf_revision_id) failures.push('pdf_canonical_without_revision');

  return {
    publicationId: row.id,
    title: row.title,
    regulatorKey: row.regulator_key,
    jurisdictionCode: row.jurisdiction,
    sourceKey: row.source_key,
    publicationType: row.publication_type,
    canonicalUrl: row.canonical_url,
    externalDocumentId: row.external_document_id,
    dataOrigin: row.data_origin,
    provenance: row.provenance,
    publicationDate: row.publication_date,
    effectiveDate: row.effective_date,
    retrievedAt: row.retrieved_at,
    format: {
      likelyHtmlUrl: row.likely_html_url,
      canonicalIsPdf: row.canonical_is_pdf,
      pdfAttachments: row.pdf_attachment_count,
    },
    snapshots: { count: row.snapshot_count },
    html: {
      revisionId: row.html_revision_id,
      webpageExtractionStatus: htmlStatus,
      textStoragePath: row.html_text_path ? 'present' : 'absent',
      obligationGradeSuitable: row.html_quality?.obligationGradeSuitable === true,
    },
    pdf: {
      revisionId: row.pdf_revision_id,
      extractionStatus: pdfStatus,
      textStoragePath: row.pdf_text_path ? 'present' : 'absent',
      obligationGradeSuitable: obligationGrade,
    },
    classification: {
      knowledgeClass,
      indexingStatus,
      provisionLevelIndexing: obligationGrade,
      searchable: knowledgeClass === 'searchable_content',
    },
    processingFailures: failures,
  };
}

const publications = rows.map(classify);

const byRegulator = {};
const byClass = {};
for (const p of publications) {
  byRegulator[p.regulatorKey] = (byRegulator[p.regulatorKey] || 0) + 1;
  byClass[p.classification.knowledgeClass] = (byClass[p.classification.knowledgeClass] || 0) + 1;
}

const summary = {
  generatedAt: new Date().toISOString(),
  gitBaselineNote: 'Tranche G inventory — compare to pdf-index-coverage prior (322 pubs, 6 pdf_primary complete)',
  totals: {
    publications: publications.length,
    withSnapshots: publications.filter((p) => p.snapshots.count > 0).length,
    htmlRevision: publications.filter((p) => p.html.revisionId).length,
    htmlComplete: publications.filter((p) => p.html.webpageExtractionStatus === 'complete').length,
    pdfRevision: publications.filter((p) => p.pdf.revisionId).length,
    pdfComplete: publications.filter((p) => p.pdf.extractionStatus === 'complete' || p.pdf.extractionStatus === 'primary_pdf_complete').length,
    searchable: publications.filter((p) => p.classification.searchable).length,
    metadataOnly: publications.filter((p) => p.classification.knowledgeClass === 'metadata_only').length,
    extractionIncomplete: publications.filter((p) => p.classification.knowledgeClass === 'extraction_attempted_incomplete').length,
    provisionLevelIndexed: publications.filter((p) => p.classification.provisionLevelIndexing).length,
    withProcessingFailures: publications.filter((p) => p.processingFailures.length > 0).length,
  },
  byRegulator,
  byKnowledgeClass: byClass,
  askRiImplication:
    'Ask RI substantive regulatory quotes require searchable_content (html_article_v2 or pdf_primary_v1 complete with stored normalised text). INSUFFICIENT_EVIDENCE is expected for metadata_only rows.',
};

await client.end();
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'SUMMARY.json'), JSON.stringify(summary, null, 2));
writeFileSync(join(outDir, 'PUBLICATIONS.json'), JSON.stringify(publications, null, 2));
writeFileSync(
  join(outDir, 'SUMMARY.md'),
  `# Regulatory knowledge foundation (${day})\n\n` +
    `| Metric | Count |\n|---|---:|\n` +
    Object.entries(summary.totals)
      .map(([k, v]) => `| ${k} | ${v} |`)
      .join('\n') +
    `\n`,
);
console.log(JSON.stringify(summary, null, 2));