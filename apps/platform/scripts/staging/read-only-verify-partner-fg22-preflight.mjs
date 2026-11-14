#!/usr/bin/env node
/**
 * Read-only audit: Partner UAT FG22 preflight artefacts (no writes).
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';
import { loadPlatformEnv, resolvePlatformRoot } from './load-platform-env.mjs';
import {
  stagingPgClientOptions,
  validateStagingDatabaseUrl,
} from '../../lib/ri/ingestion/snapshot/staging-database-config.mjs';
import { ORG_A_ID, PARTNER_UAT_ORG_ID } from './partner-uat-seed-constants.mjs';

const PUBLICATION_ID = 'a761cacc-8742-493d-b200-eb5d9a3ab884';
const FG22_CHANGE_ID = 'b8f5e3a1-0020-4000-8000-000000000020';
const FG22_EXTERNAL_KEY = 'UAT-PARTNER-CHG-FG22-PDF';

const platformRoot = resolvePlatformRoot(import.meta.url);
loadPlatformEnv(platformRoot);
const OUT = join(platformRoot, 'docs', 'STAGING-PARTNER-FG22-PREFLIGHT-READONLY-AUDIT.json');

async function main() {
  const url = process.env.STAGING_DATABASE_URL || process.env.FORGENIQ_LOCAL_PG_URL;
  if (!url) {
    console.error(JSON.stringify({ ok: false, error: 'database_url_missing' }));
    process.exit(1);
  }
  validateStagingDatabaseUrl(url);
  const client = new pg.Client(stagingPgClientOptions(url));
  await client.connect();

  const orgs = await client.query(
    `select id::text, name, slug, created_at
     from organisations
     where id in ($1::uuid, $2::uuid)
     or name ilike '%ai%develop%'
     or slug ilike '%ai%'
     order by name`,
    [ORG_A_ID, PARTNER_UAT_ORG_ID],
  );

  const change = await client.query(
    `select id::text, organisation_id::text, external_key, title, created_at, updated_at, metadata
     from regulatory_changes
     where id = $1::uuid or external_key = $2`,
    [FG22_CHANGE_ID, FG22_EXTERNAL_KEY],
  );

  const orgPub = await client.query(
    `select organisation_id::text, publication_id::text, triage_status, created_at, updated_at
     from organisation_publications
     where organisation_id = $1::uuid and publication_id = $2::uuid`,
    [PARTNER_UAT_ORG_ID, PUBLICATION_ID],
  );

  const partnerSeedChange = await client.query(
    `select id::text from regulatory_changes where organisation_id = $1::uuid and id = 'b8f5e3a1-0001-4000-8000-000000000001'::uuid`,
    [PARTNER_UAT_ORG_ID],
  );

  const report = {
    capturedAt: new Date().toISOString(),
    mode: 'read_only',
    organisations: orgs.rows,
    fg22PartnerChange: change.rows[0] ?? null,
    fg22PartnerChangeCount: change.rowCount,
    organisationPublication: orgPub.rows[0] ?? null,
    makerCheckerSeedPresent: partnerSeedChange.rowCount === 1,
    partnerAiRunsForFg22IdempotencyPattern: (
      await client.query(
        `select count(*)::int as n from ai_analysis_runs
         where organisation_id = $1::uuid and idempotency_key like $2`,
        [PARTNER_UAT_ORG_ID, 'UC-RI-005:%:UAT-PARTNER-FG22-PDF-v1'],
      )
    ).rows[0].n,
  };

  await client.end();
  writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: true, out: OUT, summary: report }, null, 2));
}

await main();