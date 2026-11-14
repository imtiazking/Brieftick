#!/usr/bin/env node
/**
 * Read-only: AI Development org isolation vs Org A and Partner UAT.
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
import { AI_DEV_ORG_ID, AI_DEV_ORG_SLUG } from './staging-ai-technical-test-config.mjs';

const platformRoot = resolvePlatformRoot(import.meta.url);
loadPlatformEnv(platformRoot);
const OUT = join(platformRoot, 'docs', 'STAGING-AI-DEV-TENANT-ISOLATION.json');

async function main() {
  const url = process.env.STAGING_DATABASE_URL || process.env.FORGENIQ_LOCAL_PG_URL;
  if (!url) {
    console.error(JSON.stringify({ ok: false, error: 'database_url_missing' }));
    process.exit(1);
  }
  validateStagingDatabaseUrl(url);
  const client = new pg.Client(stagingPgClientOptions(url));
  await client.connect();

  const org = await client.query(`select id::text, name, slug from organisations where id = $1::uuid`, [
    AI_DEV_ORG_ID,
  ]);
  const memberships = await client.query(
    `select clerk_user_id, role::text, status::text from organisation_memberships where organisation_id = $1::uuid`,
    [AI_DEV_ORG_ID],
  );

  const partnerUsersOnAiDev = await client.query(
    `select clerk_user_id from organisation_memberships
     where organisation_id = $1::uuid
       and clerk_user_id in ('user_3LyUoEAY0PUiR2JgAQEVfYK9jOU', 'user_3LyOgAkyBmShhe8mJt0AeIZ5Ux4')
       and status = 'active'`,
    [AI_DEV_ORG_ID],
  );

  const counts = async (orgId) => {
    const tables = [
      'regulatory_changes',
      'regulatory_obligations',
      'ai_analysis_runs',
      'impact_assessments',
    ];
    const out = {};
    for (const t of tables) {
      const r = await client.query(
        `select count(*)::int as n from ${t} where organisation_id = $1::uuid`,
        [orgId],
      );
      out[t] = r.rows[0].n;
    }
    return out;
  };

  const report = {
    capturedAt: new Date().toISOString(),
    aiDevOrg: org.rows[0] ?? null,
    slugOk: org.rows[0]?.slug === AI_DEV_ORG_SLUG,
    memberships: memberships.rows,
    partnerPersonasOnAiDev: partnerUsersOnAiDev.rows,
    rowCounts: {
      aiDev: await counts(AI_DEV_ORG_ID),
      orgA: await counts(ORG_A_ID),
      partnerUat: await counts(PARTNER_UAT_ORG_ID),
    },
    pass:
      org.rowCount === 1 &&
      org.rows[0].slug === AI_DEV_ORG_SLUG &&
      partnerUsersOnAiDev.rowCount === 0,
  };

  await client.end();
  writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.pass ? 0 : 1);
}

await main();