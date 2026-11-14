#!/usr/bin/env node
/**
 * Provision FORGENIQ AI Development org on staging (idempotent).
 *
 *   FORGENIQ_AI_DEV_PROVISION_ENABLED=1 node scripts/staging/provision-ai-development-org.mjs
 *   FORGENIQ_AI_DEV_PROVISION_ENABLED=1 node scripts/staging/provision-ai-development-org.mjs --apply
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
import {
  AI_DEV_ORG_ID,
  AI_DEV_ORG_NAME,
  AI_DEV_ORG_SLUG,
  AI_DEV_TECHNICAL_MEMBERS,
} from './staging-ai-technical-test-config.mjs';

const platformRoot = resolvePlatformRoot(import.meta.url);
loadPlatformEnv(platformRoot);
const OUT = join(platformRoot, 'docs', 'STAGING-AI-DEVELOPMENT-ORG-PROVISION.json');

const APPLY = process.argv.includes('--apply');

async function main() {
  if (process.env.FORGENIQ_AI_DEV_PROVISION_ENABLED !== '1') {
    console.error('Set FORGENIQ_AI_DEV_PROVISION_ENABLED=1');
    process.exit(1);
  }

  const report = {
    capturedAt: new Date().toISOString(),
    organisation: {
      id: AI_DEV_ORG_ID,
      name: AI_DEV_ORG_NAME,
      slug: AI_DEV_ORG_SLUG,
    },
    apply: APPLY,
    ok: false,
    membershipsPlanned: AI_DEV_TECHNICAL_MEMBERS.map((m) => ({
      clerkUserId: m.clerkUserId,
      role: m.role,
      label: m.label,
    })),
  };

  const url = process.env.STAGING_DATABASE_URL || process.env.FORGENIQ_LOCAL_PG_URL;
  if (!url) {
    report.error = 'database_url_missing';
    finish(report);
    return;
  }
  validateStagingDatabaseUrl(url);
  const client = new pg.Client(stagingPgClientOptions(url));
  await client.connect();

  try {
    const existing = await client.query(`select id::text, slug from organisations where id = $1::uuid or slug = $2`, [
      AI_DEV_ORG_ID,
      AI_DEV_ORG_SLUG,
    ]);
    if (existing.rowCount > 0 && existing.rows[0].id !== AI_DEV_ORG_ID) {
      report.error = 'slug_collision_different_id';
      report.existing = existing.rows[0];
      finish(report);
      return;
    }

    if (APPLY) {
      await client.query(
        `insert into organisations (id, name, slug, status)
         values ($1::uuid, $2, $3, 'active')
         on conflict (id) do update set name = excluded.name, slug = excluded.slug, status = 'active'`,
        [AI_DEV_ORG_ID, AI_DEV_ORG_NAME, AI_DEV_ORG_SLUG],
      );
    }
    report.organisationUpsert = APPLY ? 'applied' : 'dry_run';

    for (const member of AI_DEV_TECHNICAL_MEMBERS) {
      if (member.clerkUserId === undefined) continue;
      const blocked = await client.query(
        `select organisation_id::text from organisation_memberships
         where clerk_user_id = $1 and organisation_id = $2::uuid and status = 'active'`,
        [member.clerkUserId, PARTNER_UAT_ORG_ID],
      );
      if (blocked.rowCount > 0 && member.forbidPartnerOnlyUser) {
        report.error = `refusing_partner_uat_user_on_ai_dev:${member.clerkUserId}`;
        finish(report);
        return;
      }

      if (APPLY) {
        await client.query(
          `insert into organisation_memberships (organisation_id, clerk_user_id, role, status)
           values ($1::uuid, $2, $3::platform_role, 'active')
           on conflict (organisation_id, clerk_user_id) do update
           set role = excluded.role, status = 'active', updated_at = now()`,
          [AI_DEV_ORG_ID, member.clerkUserId, member.role],
        );
      }
    }
    report.memberships = APPLY ? 'applied' : 'dry_run';

    const partnerPersonas = ['user_3LyUoEAY0PUiR2JgAQEVfYK9jOU', 'user_3LyOgAkyBmShhe8mJt0AeIZ5Ux4'];
    const partnerInAiDev = await client.query(
      `select clerk_user_id from organisation_memberships
       where organisation_id = $1::uuid and clerk_user_id = any($2::text[]) and status = 'active'`,
      [AI_DEV_ORG_ID, partnerPersonas],
    );
    report.partnerUsersInAiDev = partnerInAiDev.rows;

    const cross = await client.query(
      `select count(*)::int as n from regulatory_changes
       where organisation_id = $1::uuid`,
      [AI_DEV_ORG_ID],
    );
    report.regulatoryChanges = cross.rows[0].n;

    report.envHint = `STAGING_AI_TECH_ORG_ID=${AI_DEV_ORG_ID}`;
    report.ok = partnerInAiDev.rowCount === 0;
    report.isolationTargets = {
      orgA: ORG_A_ID,
      partnerUat: PARTNER_UAT_ORG_ID,
      aiDev: AI_DEV_ORG_ID,
    };
  } finally {
    await client.end();
  }

  finish(report);
}

function finish(report) {
  writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 1);
}

await main();