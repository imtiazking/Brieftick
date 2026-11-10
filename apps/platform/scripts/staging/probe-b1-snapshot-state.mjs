#!/usr/bin/env node
import pg from 'pg';
import { loadPlatformEnv, resolvePlatformRoot } from './load-platform-env.mjs';
import { stagingPgClientOptions, validateStagingDatabaseUrl } from '../../lib/ri/ingestion/snapshot/staging-database-config.mjs';

loadPlatformEnv(resolvePlatformRoot(import.meta.url));
process.env.FORGENIQ_ENV = 'staging';

const IDS = [
  'edcebe7d-3a3f-4adb-bb54-14120f14315a',
  '49dee37a-9051-4c3f-8597-fa0dc232c91d',
  '34b18772-3732-4e10-89a6-946bd15c5afe',
  'ff1150cc-3d7e-45c5-ac7a-3cd15ddaa37e',
  '9e8d3736-506a-4909-8ad4-08229e0e6249',
];

function loadDatabaseUrl() {
  for (const key of ['STAGING_DATABASE_URL', 'DATABASE_URL', 'FORGENIQ_LOCAL_PG_URL']) {
    if (process.env[key]?.trim()) return process.env[key].trim();
  }
  return null;
}
const dbUrl = loadDatabaseUrl();
if (!dbUrl) {
  console.log(JSON.stringify({ ok: false, error: 'staging_database_url_missing' }));
  process.exit(1);
}
validateStagingDatabaseUrl(dbUrl);
const client = new pg.Client(stagingPgClientOptions(dbUrl));
await client.connect();
const { rows } = await client.query(
  `select p.id, p.title, p.canonical_url,
    (select count(*)::int from regulatory_source_snapshots s where s.publication_id = p.id) as snapshots,
    (select count(*)::int from regulatory_source_extraction_revisions r where r.publication_id = p.id) as revisions
   from regulatory_publications p where p.id = any($1::uuid[])`,
  [IDS],
);
console.log(JSON.stringify(rows, null, 2));
await client.end();
