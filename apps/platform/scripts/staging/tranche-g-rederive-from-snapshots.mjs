#!/usr/bin/env node
/**
 * Tranche G — resumable deterministic html_article_v2 re-derive from existing snapshots (no paid AI, no refetch).
 * Requires valid STAGING_DATABASE_URL pointing at approved RI staging Postgres.
 */
import pg from 'pg';
import { config as dotenvConfig } from 'dotenv';
import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadPlatformEnv, resolvePlatformRoot } from './load-platform-env.mjs';
import { stagingPgClientOptions } from '../../lib/ri/ingestion/snapshot/staging-database-config.mjs';
import { createExtractionRevision } from '../../lib/ri/ingestion/snapshot/create-extraction-revision.mjs';
import { downloadSnapshotRawBody } from '../../lib/ri/ingestion/snapshot/download-snapshot-raw.mjs';
import { REPO_ROOT } from '../../lib/ri/eval/eval-paths.mjs';

const platformRoot = resolvePlatformRoot(import.meta.url);
loadPlatformEnv(platformRoot);
for (const name of ['.env.local', '.env.uat-secrets.local', '.env.staging.pull']) {
  const p = join(platformRoot, name);
  if (existsSync(p)) dotenvConfig({ path: p, override: false });
}

const limit = Number(process.env.TRANCHE_G_REDERIVE_LIMIT || 5);
const url = process.env.STAGING_DATABASE_URL?.trim();
if (!url || /@base(\b|:|\/)/i.test(url)) {
  console.error('STAGING_DATABASE_URL required');
  process.exit(2);
}

const client = new pg.Client(stagingPgClientOptions({ connectionString: url }));
await client.connect();

const { rows } = await client.query(
  `select s.id as snapshot_id, s.publication_id, s.raw_storage_path, s.canonical_url
   from regulatory_source_snapshots s
   where not exists (
     select 1 from regulatory_source_extraction_revisions r
     where r.source_snapshot_id = s.id and r.extraction_profile = 'html_article_v2'
   )
   order by s.retrieved_at desc nulls last
   limit $1`,
  [limit],
);

const report = { generatedAt: new Date().toISOString(), limit, attempted: rows.length, results: [] };

for (const row of rows) {
  try {
    const raw = await downloadSnapshotRawBody(client, row.snapshot_id);
    const revision = await createExtractionRevision(client, {
      sourceSnapshotId: row.snapshot_id,
      rawBody: raw,
      canonicalUrl: row.canonical_url,
      createdBy: 'tranche-g-rederive',
    });
    report.results.push({ publicationId: row.publication_id, snapshotId: row.snapshot_id, ok: true, revisionId: revision.id });
    console.log('OK', row.publication_id.slice(0, 8));
  } catch (e) {
    report.results.push({
      publicationId: row.publication_id,
      snapshotId: row.snapshot_id,
      ok: false,
      error: String(e.message || e).slice(0, 200),
    });
    console.error('FAIL', row.publication_id.slice(0, 8), e.message);
  }
}

await client.end();
const outDir = join(REPO_ROOT, 'docs', 'uat', 'evidence', 'regulatory-knowledge-foundation-2026-11-27');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'REDERIVE-RUN.json'), JSON.stringify(report, null, 2));
process.exit(report.results.some((r) => !r.ok) ? 1 : 0);