#!/usr/bin/env node
/**
 * LOCAL/DEVELOPMENT ONLY — inserts one TEST publication (not live ingestion).
 * Requires FORGENIQ_RI_DEV_FIXTURES=1 and local Supabase service role in env.
 */
import pg from 'pg';

if (process.env.FORGENIQ_RI_DEV_FIXTURES !== '1') {
  console.error('Set FORGENIQ_RI_DEV_FIXTURES=1 to run this script.');
  process.exit(1);
}

const url = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
if (!url) {
  console.error('DATABASE_URL or SUPABASE_DB_URL required (local only).');
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
await client.connect();

const { rows: reg } = await client.query(
  `select id from public.regulators where external_key = 'REG-FCA' limit 1`,
);
const { rows: src } = await client.query(
  `select id from public.regulatory_sources where external_key = 'SRC-FCA-PUBLICATIONS-RSS' limit 1`,
);
if (!reg[0] || !src[0]) {
  console.error('Run migrations + reference seed first.');
  process.exit(1);
}

const { rows } = await client.query(
  `insert into public.regulatory_publications (
    source_id, regulator_id, title, publication_type, canonical_url, data_origin, provenance
  ) values ($1, $2, 'TEST / DEVELOPMENT DATA — manual fixture publication', 'DEV_FIXTURE',
    'https://example.test/dev-fixture', 'dev_fixture', '{"fixture":true}'::jsonb)
  returning id`,
  [src[0].id, reg[0].id],
);

console.log(`Created dev_fixture publication ${rows[0].id}`);
await client.end();
