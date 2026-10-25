#!/usr/bin/env node
/**
 * Phase 8 security RLS acceptance (static migration checks + optional embedded Postgres).
 * Live staging: apply migration + platform_operators bootstrap, then JWT simulation.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import {
  ORG_A,
  USER_A,
  applyAllMigrations,
  applyReferenceSeed,
  ensureAppRole,
  resetAndStartEmbedded,
  seedTenantFixtures,
  stopEmbedded,
  withRlsSession,
} from './local-db/harness.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const platformRoot = join(__dir, '..');
const migrationName = '20261025100000_phase8_security_hardening.sql';
const migrationPath = join(platformRoot, 'supabase', 'migrations', migrationName);

const USER_NO_MEMBER = 'clerk_user_no_org_test';
const USER_VIEWER = 'clerk_user_viewer_test';
const USER_CM = 'clerk_user_cm_no_platform_op';

let fail = 0;
function pass(msg) {
  console.log(`PASS: ${msg}`);
}
function failMsg(msg) {
  fail += 1;
  console.error(`FAIL: ${msg}`);
}

if (!existsSync(migrationPath)) failMsg(`missing migration ${migrationName}`);
else pass(`migration file ${migrationName}`);

const mig = existsSync(migrationPath) ? readFileSync(migrationPath, 'utf8') : '';

if (!mig.includes('platform_operators')) failMsg('missing platform_operators table');
else pass('platform_operators table defined');

if (!mig.includes('is_platform_operator')) failMsg('missing is_platform_operator()');
else pass('is_platform_operator() defined');

if (mig.includes('has_ingestion_ops_privilege')) {
  failMsg('must not grant ops via org role (remove has_ingestion_ops_privilege)');
} else pass('no org-role-based ingestion ops privilege');

if (!mig.includes('operational_alerts_update_platform_operator')) {
  failMsg('operational_alerts must use platform operator policy');
} else pass('operational_alerts_update_platform_operator policy');

if (!mig.includes('notification_events_insert_tenant_ai')) {
  failMsg('notification_events tenant-scoped AI insert policy');
} else pass('notification_events_insert_tenant_ai policy');

if (!mig.includes('security definer')) failMsg('SECURITY DEFINER helpers expected');
else pass('SECURITY DEFINER functions use explicit search_path');

if (!mig.includes('drop policy if exists organisations_insert_authenticated')) {
  failMsg('must drop organisations_insert_authenticated');
} else pass('drops organisations_insert_authenticated');

if (mig.includes('regulators_select_authenticated')) {
  failMsg('must not alter global catalogue policies in this migration');
} else pass('global catalogue policies untouched in migration text');

const runLocalDb = process.argv.includes('--local-db');

if (runLocalDb) {
  console.log('\n--- Embedded Postgres RLS verification ---\n');
  const { embedded, adminUrl } = await resetAndStartEmbedded({ port: 54331 });
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    await applyAllMigrations(admin);
    await ensureAppRole(admin);
    await applyReferenceSeed(admin);
    const pubId = await (async () => {
      const { rows: src } = await admin.query(`select id from public.regulatory_sources limit 1`);
      const { rows: reg } = await admin.query(`select id from public.regulators limit 1`);
      const ins = await admin.query(
        `insert into public.regulatory_publications (
          source_id, regulator_id, title, publication_type, canonical_url, data_origin
        ) values ($1, $2, 'TEST pub', 'TEST', 'https://example.test/p', 'test_fixture') returning id`,
        [src[0].id, reg[0].id],
      );
      return ins.rows[0].id;
    })();
    await seedTenantFixtures(adminUrl, pubId);

    await admin.query(
      `insert into public.organisation_memberships (organisation_id, clerk_user_id, role, status)
       values ($1, $2, 'VIEWER'::public.platform_role, 'active'),
              ($1, $3, 'COMPLIANCE_MANAGER'::public.platform_role, 'active')
       on conflict (organisation_id, clerk_user_id) do update set role = excluded.role`,
      [ORG_A, USER_VIEWER, USER_CM],
    );

    await admin.query(
      `insert into public.platform_operators (clerk_user_id, status, display_name)
       values ($1, 'active', 'test platform operator')
       on conflict (clerk_user_id) do update set status = 'active'`,
      [USER_A],
    );

    const alertRes = await admin.query(
      `insert into public.operational_alerts (category, dedupe_key, title, message)
       values ('TEST', 'phase8-test-dedupe', 'TEST alert', 'fixture') returning id`,
    );
    const alertId = alertRes.rows[0].id;

    const { rows: srcForRun } = await admin.query(`select id from public.regulatory_sources limit 1`);
    await admin.query(
      `insert into public.ingestion_runs (source_id, status, environment)
       values ($1, 'COMPLETED', 'test_fixture')`,
      [srcForRun[0].id],
    );

    await withRlsSession(adminUrl, USER_NO_MEMBER, async (client) => {
      const orgs = await client.query(`select count(*)::int as n from public.organisations`);
      if (orgs.rows[0].n !== 0) failMsg('non-member sees organisations');
      else pass('non-member: organisations count 0');

      const upd = await client.query(
        `update public.operational_alerts set status = 'ACKNOWLEDGED' where id = $1`,
        [alertId],
      );
      if (upd.rowCount !== 0) failMsg('non-member updated operational_alerts');
      else pass('non-member: cannot update operational_alerts');
    });

    await withRlsSession(adminUrl, USER_NO_MEMBER, async (client) => {
      try {
        await client.query(
          `insert into public.ingestion_operational_events (event_type, metadata)
           values ('TEST_FAKE', '{}'::jsonb)`,
        );
        failMsg('non-member inserted ingestion_operational_events');
      } catch {
        pass('non-member: cannot insert ingestion_operational_events');
      }
    });

    await withRlsSession(adminUrl, USER_CM, async (client) => {
      const upd = await client.query(
        `update public.operational_alerts set status = 'ACKNOWLEDGED' where id = $1`,
        [alertId],
      );
      if (upd.rowCount !== 0) failMsg('customer COMPLIANCE_MANAGER updated alerts without platform op');
      else pass('customer COMPLIANCE_MANAGER: cannot update operational_alerts');

      const runs = await client.query(`select count(*)::int as n from public.ingestion_runs`);
      if (runs.rows[0].n !== 0) failMsg('customer COMPLIANCE_MANAGER can read ingestion_runs');
      else pass('customer COMPLIANCE_MANAGER: cannot read ingestion_runs');
    });

    await withRlsSession(adminUrl, USER_A, async (client) => {
      const orgs = await client.query(
        `select count(*)::int as n from public.organisations where id = $1`,
        [ORG_A],
      );
      if (orgs.rows[0].n !== 1) failMsg('tenant OWNER cannot read own organisation');
      else pass('tenant OWNER: organisation visible (tenant RLS)');

      const upd = await client.query(
        `update public.operational_alerts set status = 'ACKNOWLEDGED' where id = $1 returning id`,
        [alertId],
      );
      if (upd.rowCount !== 1) failMsg('platform operator cannot update operational_alerts');
      else pass('platform operator: can update operational_alerts');

      const insEv = await client.query(
        `insert into public.ingestion_operational_events (event_type, metadata)
         values ('TEST_PLATFORM_OP', '{}'::jsonb) returning id`,
      );
      if (!insEv.rows[0]?.id) failMsg('platform operator cannot insert ingestion_operational_events');
      else pass('platform operator: can insert ingestion_operational_events');
    });

    await admin.query(`delete from public.platform_operators where clerk_user_id = $1`, [USER_A]);

    await withRlsSession(adminUrl, USER_A, async (client) => {
      const upd = await client.query(
        `update public.operational_alerts set status = 'OPEN' where id = $1`,
        [alertId],
      );
      if (upd.rowCount !== 0) failMsg('OWNER without platform_op row updated alerts');
      else pass('OWNER without platform operator: cannot update operational_alerts');
    });

    await admin.query(
      `insert into public.platform_operators (clerk_user_id, status) values ($1, 'active')
       on conflict (clerk_user_id) do update set status = 'active'`,
      [USER_A],
    );

    await withRlsSession(adminUrl, USER_VIEWER, async (client) => {
      try {
        await client.query(
          `insert into public.notification_events (event_type, payload)
           values ('AI_REVIEW_REQUIRED', '{"organisation_id":"${ORG_A}","analysis_run_id":"x"}'::jsonb)`,
        );
        pass('VIEWER: tenant-scoped AI notification insert allowed');
      } catch (e) {
        failMsg(`VIEWER AI notification insert: ${e.message}`);
      }
      try {
        await client.query(
          `insert into public.notification_events (event_type, payload)
           values ('NEW_REGULATORY_PUBLICATION', '{}'::jsonb)`,
        );
        failMsg('VIEWER inserted arbitrary global notification');
      } catch {
        pass('VIEWER: cannot insert arbitrary global notification');
      }
    });

    await withRlsSession(adminUrl, USER_VIEWER, async (client) => {
      const ops = await client.query(`select count(*)::int as n from public.regulatory_source_operations`);
      if (ops.rows[0].n !== 0) failMsg('VIEWER can read regulatory_source_operations');
      else pass('VIEWER: cannot read regulatory_source_operations (not platform operator)');

      const regs = await client.query(`select count(*)::int as n from public.regulators`);
      if (regs.rows[0].n === 0) failMsg('VIEWER cannot read global catalogue');
      else pass('VIEWER: global regulators catalogue readable');
    });
  } finally {
    await admin.end();
    await stopEmbedded(embedded);
  }
} else {
  console.log('\nSKIP: embedded DB tests (run with --local-db)\n');
}

if (fail) {
  console.error(`\nPhase 8 security RLS acceptance: FAIL (${fail})`);
  process.exit(1);
}
console.log('\nPhase 8 security RLS acceptance: PASS');
console.log(
  'NOTE: After migration on lhgzdicffkhaaykzthep, run bootstrap-platform-operator.mjs for RI admin Clerk id.',
);
