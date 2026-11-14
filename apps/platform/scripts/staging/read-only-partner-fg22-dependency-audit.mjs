#!/usr/bin/env node
/**
 * Read-only: downstream dependencies of orphaned Partner FG22 preflight rows.
 * Cleanup plan only — no deletes.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';
import { loadPlatformEnv, resolvePlatformRoot } from './load-platform-env.mjs';
import {
  stagingPgClientOptions,
  validateStagingDatabaseUrl,
} from '../../lib/ri/ingestion/snapshot/staging-database-config.mjs';
import { PARTNER_UAT_ORG_ID } from './partner-uat-seed-constants.mjs';

const FG22_CHANGE = 'b8f5e3a1-0020-4000-8000-000000000020';
const FG22_PUB = 'a761cacc-8742-493d-b200-eb5d9a3ab884';

const platformRoot = resolvePlatformRoot(import.meta.url);
loadPlatformEnv(platformRoot);
const OUT = join(platformRoot, 'docs', 'STAGING-PARTNER-FG22-CLEANUP-PLAN.json');

async function main() {
  const url = process.env.STAGING_DATABASE_URL || process.env.FORGENIQ_LOCAL_PG_URL;
  if (!url) {
    console.error(JSON.stringify({ ok: false, error: 'database_url_missing' }));
    process.exit(1);
  }
  validateStagingDatabaseUrl(url);
  const client = new pg.Client(stagingPgClientOptions(url));
  await client.connect();

  const deps = {
    impactAssessments: await client.query(
      `select count(*)::int as n from impact_assessments where regulatory_change_id = $1::uuid`,
      [FG22_CHANGE],
    ),
    obligations: await client.query(
      `select count(*)::int as n from regulatory_obligations where organisation_id = $1::uuid and metadata::text like '%FG22%'`,
      [PARTNER_UAT_ORG_ID],
    ),
    aiRunsByChange: await client.query(
      `select count(*)::int as n from ai_analysis_runs
       where organisation_id = $1::uuid and target_entity_type = 'regulatory_change' and target_entity_id = $2::text`,
      [PARTNER_UAT_ORG_ID, FG22_CHANGE],
    ),
    aiRunsFg22Idempotency: await client.query(
      `select id::text, review_status, execution_status from ai_analysis_runs
       where organisation_id = $1::uuid and idempotency_key like '%UAT-PARTNER-FG22-PDF%'`,
      [PARTNER_UAT_ORG_ID],
    ),
    workflowEvents: await client.query(
      `select count(*)::int as n from workflow_events where organisation_id = $1::uuid and entity_id = $2::uuid`,
      [PARTNER_UAT_ORG_ID, FG22_CHANGE],
    ),
    orgPublication: await client.query(
      `select * from organisation_publications where organisation_id = $1::uuid and publication_id = $2::uuid`,
      [PARTNER_UAT_ORG_ID, FG22_PUB],
    ),
    changeRow: await client.query(`select id::text, external_key, created_at from regulatory_changes where id = $1::uuid`, [
      FG22_CHANGE,
    ]),
  };

  const safeToRemove =
    deps.impactAssessments.rows[0].n === 0 &&
    deps.aiRunsByChange.rows[0].n === 0 &&
    deps.aiRunsFg22Idempotency.rowCount === 0 &&
    deps.workflowEvents.rows[0].n === 0;

  const plan = {
    capturedAt: new Date().toISOString(),
    mode: 'read_only',
    targets: [
      {
        table: 'regulatory_changes',
        id: FG22_CHANGE,
        externalKey: 'UAT-PARTNER-CHG-FG22-PDF',
      },
      {
        table: 'organisation_publications',
        organisationId: PARTNER_UAT_ORG_ID,
        publicationId: FG22_PUB,
      },
    ],
    dependencies: {
      impactAssessmentsOnChange: deps.impactAssessments.rows[0].n,
      aiRunsOnChange: deps.aiRunsByChange.rows[0].n,
      aiRunsFg22Pattern: deps.aiRunsFg22Idempotency.rows,
      workflowEventsOnChange: deps.workflowEvents.rows[0].n,
      changeRow: deps.changeRow.rows[0] ?? null,
      orgPublication: deps.orgPublication.rows[0] ?? null,
    },
    safeToRemoveAfterApproval: safeToRemove,
    proposedCleanupOrder: safeToRemove
      ? [
          'DELETE organisation_publications WHERE organisation_id = PARTNER AND publication_id = FG22 (only if no other Partner FG22 workflows)',
          'DELETE regulatory_changes WHERE id = FG22_CHANGE AND organisation_id = PARTNER AND external_key = UAT-PARTNER-CHG-FG22-PDF',
        ]
      : ['BLOCKED — resolve dependent rows first'],
    excludedFromCleanup: [
      'b8f5e3a1-0001-4000-8000-000000000001 maker-checker change',
      'UAT-PARTNER-SEED-v1 bundle entities',
    ],
    execution: 'FORGENIQ_PARTNER_FG22_CLEANUP_ENABLED=1 --apply (not implemented until approved)',
  };

  await client.end();
  writeFileSync(OUT, JSON.stringify(plan, null, 2));
  console.log(JSON.stringify(plan, null, 2));
}

await main();