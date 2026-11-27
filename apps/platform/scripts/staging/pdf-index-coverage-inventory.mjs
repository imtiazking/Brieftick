#!/usr/bin/env node
/**
 * Read-only PDF indexing coverage inventory (staging when STAGING_DATABASE_URL set).
 */
import pg from 'pg';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const day = new Date().toISOString().slice(0, 10);
const outDir =
  process.env.PDF_INVENTORY_OUT ||
  join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'docs', 'uat', 'evidence', `pdf-index-coverage-${day}`);

const url = process.env.STAGING_DATABASE_URL || process.env.DATABASE_URL;
if (!url) {
  console.error('STAGING_DATABASE_URL required');
  process.exit(2);
}

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();

const totalPubs = await client.query(`select count(*)::int as n from regulatory_publications`);
const eligible = await client.query(
  `select count(*)::int as n from regulatory_publications where coalesce(publication_type, '') not ilike '%html_only%'`,
);
const withPdfAttachment = await client.query(
  `select count(distinct publication_id)::int as n
   from regulatory_source_extraction_revisions r
   where jsonb_array_length(coalesce(r.pdf_attachments, '[]'::jsonb)) > 0
      or r.extraction_profile = 'pdf_primary_v1'`,
);
const primaryPdfRevisions = await client.query(
  `select count(distinct publication_id)::int as n
   from regulatory_source_extraction_revisions
   where extraction_profile = 'pdf_primary_v1'`,
);
const indexed = await client.query(
  `select count(distinct publication_id)::int as n
   from regulatory_source_extraction_revisions
   where extraction_profile = 'pdf_primary_v1'
     and lower(coalesce(extraction_quality->'webpageExtraction'->>'status', '')) = 'complete'`,
);
const provision = await client.query(
  `select count(distinct publication_id)::int as n
   from regulatory_source_extraction_revisions
   where extraction_profile = 'pdf_primary_v1'
     and lower(coalesce(extraction_quality->'webpageExtraction'->>'status', '')) = 'complete'
     and coalesce((extraction_quality->>'obligationGradeSuitable')::boolean, false) = false`,
);
const obligationGrade = await client.query(
  `select count(distinct publication_id)::int as n
   from regulatory_source_extraction_revisions
   where extraction_profile = 'pdf_primary_v1'
     and coalesce((extraction_quality->>'obligationGradeSuitable')::boolean, false) = true`,
);

const withPdf = withPdfAttachment.rows[0]?.n ?? 0;
const indexedN = indexed.rows[0]?.n ?? 0;

const inventory = {
  generatedAt: new Date().toISOString(),
  denominators: {
    totalRegulatoryPublications: totalPubs.rows[0]?.n ?? null,
    eligiblePublications: eligible.rows[0]?.n ?? null,
    publicationsWithPdfOrPrimaryProfile: withPdf,
    publicationsWithPrimaryPdfRevision: primaryPdfRevisions.rows[0]?.n ?? null,
  },
  coverage: {
    indexedPublicationsPrimaryPdfComplete: indexedN,
    provisionLevelIndexed: provision.rows[0]?.n ?? null,
    obligationGradeSuitableIndexed: obligationGrade.rows[0]?.n ?? null,
    awaitingIndexing: Math.max(0, (primaryPdfRevisions.rows[0]?.n ?? 0) - indexedN),
    indexedShareOfPrimaryPdf: primaryPdfRevisions.rows[0]?.n
      ? Number((indexedN / primaryPdfRevisions.rows[0].n).toFixed(4))
      : null,
  },
  askRiImplication:
    'Ask RI publication PDF answers require pdf_primary_v1 with webpageExtraction.status=complete; metadata-only answers remain possible without index.',
  limitations: [
    'Does not count inaccessible or failed fetches separately without storage audit.',
    'Does not claim complete regulatory knowledge coverage.',
  ],
};

await client.end();
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'INVENTORY.json'), JSON.stringify(inventory, null, 2));
writeFileSync(
  join(outDir, 'INVENTORY.md'),
  `# PDF index coverage (${day})\n\n${Object.entries(inventory.denominators)
    .map(([k, v]) => `- **${k}**: ${v}`)
    .join('\n')}\n\n${Object.entries(inventory.coverage)
    .map(([k, v]) => `- **${k}**: ${v}`)
    .join('\n')}\n`,
);
console.log(JSON.stringify(inventory, null, 2));