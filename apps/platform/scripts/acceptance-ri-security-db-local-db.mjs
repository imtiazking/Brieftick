#!/usr/bin/env node
/**
 * SEC-DB-001..003 — isolated database acceptance.
 */
import pg from 'pg';
import {
  applyAllMigrations,
  ensureAppRole,
  resetAndStartEmbedded,
  stopEmbedded,
  withRlsSession,
  withRlsSessionCommit,
} from './local-db/harness.mjs';
import { join } from 'node:path';

const PILOT = 'b8f5e3a1-00ad-4000-8000-000000000001';
const ANA = 'user_ana_security_test';
const CMG = 'user_cmg_security_test';

let pass = 0;
let fail = 0;
const check = (name, cond, detail) => {
  if (cond) {
    pass++;
    console.log(`PASS: ${name}`);
  } else {
    fail++;
    console.log(`FAIL: ${name}`, detail ? JSON.stringify(detail) : '');
  }
};

const { embedded, adminUrl } = await resetAndStartEmbedded({ port: 54371 });
const admin = new pg.Client({ connectionString: adminUrl });
await admin.connect();
try {
  await admin.query(`do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;`);
  await applyAllMigrations(admin);
  await ensureAppRole(admin);
  await admin.query(
    `insert into organisations (id, name, slug) values ($1, 'Pilot', 'pilot') on conflict do nothing`,
    [PILOT],
  );
  await admin.query(
    `insert into organisation_memberships (organisation_id, clerk_user_id, role, status)
     values ($1, $2, 'ANALYST'::public.platform_role, 'active'),
            ($1, $3, 'COMPLIANCE_MANAGER'::public.platform_role, 'active')
     on conflict do nothing`,
    [PILOT, ANA, CMG],
  );

  const openFinding = await withRlsSessionCommit(adminUrl, ANA, async (c) => {
    const r = await c.query(
      `insert into findings (organisation_id, title, severity, status, created_by_user_id)
       values ($1, 'Test finding', 'MEDIUM', 'OPEN', $2) returning id`,
      [PILOT, ANA],
    );
    return r.rows[0]?.id;
  });
  check('seed finding', Boolean(openFinding));

  const anaClose = await withRlsSession(adminUrl, ANA, async (c) => {
    try {
      const upd = await c.query(`update findings set status = 'CLOSED' where id = $1`, [openFinding]);
      const row = (await c.query(`select status from findings where id = $1`, [openFinding])).rows[0];
      return { ok: true, rowCount: upd.rowCount, status: row?.status };
    } catch (e) {
      return { ok: false, message: e.message };
    }
  });
  const anaBlocked =
    (!anaClose.ok && /finding_close_requires_compliance_manager/.test(anaClose.message || '')) ||
    anaClose.status !== 'CLOSED';
  check('SEC-DB-001 ANALYST cannot close finding', anaBlocked, anaClose);

  const cmClose = await withRlsSession(adminUrl, CMG, async (c) => {
    try {
      await c.query(`update findings set status = 'CLOSED' where id = $1`, [openFinding]);
      return (await c.query(`select status from findings where id = $1`, [openFinding])).rows[0]?.status;
    } catch (e) {
      return { error: e.message };
    }
  });
  check('SEC-DB-001 COMPLIANCE_MANAGER may close finding', cmClose === 'CLOSED', { cmClose });

  const spoof = await withRlsSession(adminUrl, ANA, async (c) => {
    try {
      await c.query(
        `insert into findings (organisation_id, title, severity, status, created_by_user_id)
         values ($1, 'Spoof owner', 'LOW', 'OPEN', $2)`,
        [PILOT, CMG],
      );
      return { ok: true };
    } catch (e) {
      return { ok: false, message: e.message };
    }
  });
  check('SEC-DB-002 manual record creator must match actor', !spoof.ok && /manual_record_creator_mismatch/.test(spoof.message || ''));

  await admin.query(
    `insert into workflow_events (organisation_id, entity_type, entity_id, event_type, metadata)
     values ($1, 'regulatory_change', $1, 'TEST_AUDIT', '{}'::jsonb)`,
    [PILOT],
  );
  let auditBlocked = false;
  try {
    const del = await admin.query(`delete from workflow_events where organisation_id = $1`, [PILOT]);
    auditBlocked = del.rowCount === 0;
  } catch (e) {
    auditBlocked = /workflow_events_immutable/.test(e.message || '');
  }
  check('SEC-DB-003 workflow_events delete blocked', auditBlocked);
} finally {
  await admin.end();
  await stopEmbedded(embedded);
}

console.log(`\nacceptance-ri-security-db-local-db: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);