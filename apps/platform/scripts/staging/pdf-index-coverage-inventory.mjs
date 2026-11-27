#!/usr/bin/env node
/**
 * Read-only PDF indexing coverage inventory (staging or local when STAGING_DATABASE_URL set).
 */
import pg from 'pg';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const outDir =
  process.env.PDF_INVENTORY_OUT ||
  join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'docs', 'uat', 'evidence', 'pdf-index-coverage-2026-11-27');

const url = process.env.STAGING_DATABASE_URL || process.env.DATABASE_URL;
if (!url) {
  console.error('STAGING_DATABASE_URL required');
  process.exit(2);
}

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();

const eligible = await client.query(
  `select count(*)::int as n from regulatory_publications where publication_type not like '%html%'`,
);
const withPdf = await client.query(
  `select count(distinct publication_id)::int as n
   from regulatory_source_extraction_revisions
   where extraction_profile = 'pdf_primary_v1'`,
);
const indexed = await client.query(
  `select count(distinct publication_id)::int as n
   from regulatory_source_extraction_revisions
   where extraction_profile = 'pdf_primary_v1' and extraction_status = 'COMPLETE'`,
);
const provision = await client.query(
  `select count(distinct publication_id)::int as n
   from regulatory_source_extraction_revisions
   where extraction_profile = 'pdf_primary_v1'
     and extraction_status = 'COMPLETE'
     and coalesce((structured->>'obligationGradeSuitable')::boolean, false) = false`,
);

const inventory = {
  generatedAt: new Date().toISOString(),
  eligiblePublications: eligible.rows[0]?.n ?? null,
  publicationsWithPrimaryPdf: withPdf.rows[0]?.n ?? null,
  indexedPublications: indexed.rows[0]?.n ?? null,
  provisionLevelIndexed: provision.rows[0]?.n ?? null,
  awaitingIndexing: Math.max(0, (withPdf.rows[0]?.n ?? 0) - (indexed.rows[0]?.n ?? 0)),
  note: 'Does not claim complete regulatory knowledge coverage.',
};

await client.end();
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'INVENTORY.json'), JSON.stringify(inventory, null, 2));
console.log(JSON.stringify(inventory, null, 2));