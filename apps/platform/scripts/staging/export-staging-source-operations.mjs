#!/usr/bin/env node
/**
 * Writes docs/uat/evidence/production-readiness/raw/staging-source-operations.json from staging Postgres.
 * Requires STAGING_DATABASE_URL or FORGENIQ_LOCAL_PG_URL (read-only).
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const outPath = join(repoRoot, 'docs', 'uat', 'evidence', 'production-readiness', 'raw', 'staging-source-operations.json');
const url = process.env.STAGING_DATABASE_URL?.trim() || process.env.FORGENIQ_LOCAL_PG_URL?.trim();
if (!url) {
  console.error(JSON.stringify({ ok: false, error: 'STAGING_DATABASE_URL missing' }));
  process.exit(2);
}

const SQL = `
select rs.external_key as source_key,
       rso.last_success_at,
       rso.consecutive_failures,
       (select count(*)::int from regulatory_publications rp where rp.source_id = rs.id) as publications,
       case when coalesce(rso.consecutive_failures, 0) > 0 then 'FAILING' else 'OK' end as health_status,
       coalesce(rso.enabled, true) as enabled
from regulatory_sources rs
left join regulatory_source_operations rso on rso.source_id = rs.id
order by rs.external_key;
`;

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  const { rows } = await client.query(SQL);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(rows, null, 2));
  console.log(JSON.stringify({ ok: true, path: outPath, rows: rows.length }, null, 2));
} finally {
  await client.end();
}