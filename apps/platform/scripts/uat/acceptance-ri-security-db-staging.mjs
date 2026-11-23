#!/usr/bin/env node
/**
 * SEC-DB-001..003 on hosted staging database (read/write test fixtures in pilot org only).
 */
import pg from 'pg';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadPlatformEnv, resolvePlatformRoot } from '../staging/load-platform-env.mjs';

loadPlatformEnv(resolvePlatformRoot(import.meta.url));
import { withRlsSession, withRlsSessionCommit } from '../local-db/harness.mjs';

const PILOT = 'b8f5e3a1-00ad-4000-8000-000000000001';
const ANA = 'user_3Fa9TcFi8izkxHdDP58Qb3UY4mr'; // User B REVIEWER — not COMPLIANCE_MANAGER
const CMG = 'user_3LBBtwYR4mmFisfpzMj3n7DVtVh'; // User C COMPLIANCE_MANAGER

const url = process.env.STAGING_DATABASE_URL?.trim() || process.env.DATABASE_URL?.trim();
if (!url) {
  console.error('STAGING_DATABASE_URL required');
  process.exit(2);
}

async function assertConnectionNotPrivileged(connectionString) {
  const probe = new pg.Client({ connectionString });
  await probe.connect();
  try {
    const r = await probe.query(
      `select current_user, session_user, rolsuper, rolbypassrls from pg_roles where rolname = current_user`,
    );
    const row = r.rows[0] || {};
    return {
      currentUser: row.current_user,
      rolsuper: row.rolsuper === true,
      rolbypassrls: row.rolbypassrls === true,
      privileged: row.rolsuper === true || row.rolbypassrls === true,
    };
  } finally {
    await probe.end();
  }
}

const roleProbe = await assertConnectionNotPrivileged(url);

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

check('connection is not superuser / bypassrls', !roleProbe.privileged, {
  currentUser: roleProbe.currentUser,
  rolsuper: roleProbe.rolsuper,
  rolbypassrls: roleProbe.rolbypassrls,
});

const title = `SEC-DB-UAT-${Date.now()}`;
const openFinding = await withRlsSessionCommit(url, ANA, async (c) => {
  const r = await c.query(
    `insert into findings (organisation_id, title, severity, status, created_by_user_id)
     values ($1, $2, 'MEDIUM', 'OPEN', $3) returning id`,
    [PILOT, title, ANA],
  );
  return r.rows[0]?.id;
});
check('seed finding on staging', Boolean(openFinding));

const anaClose = await withRlsSession(url, ANA, async (c) => {
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
check('SEC-DB-001 REVIEWER cannot close finding', anaBlocked, anaClose);

const cmClose = await withRlsSession(url, CMG, async (c) => {
  try {
    await c.query(`update findings set status = 'CLOSED' where id = $1`, [openFinding]);
    return (await c.query(`select status from findings where id = $1`, [openFinding])).rows[0]?.status;
  } catch (e) {
    return { error: e.message };
  }
});
check('SEC-DB-001 COMPLIANCE_MANAGER may close finding', cmClose === 'CLOSED', { cmClose });

const spoof = await withRlsSession(url, ANA, async (c) => {
  try {
    await c.query(
      `insert into findings (organisation_id, title, severity, status, created_by_user_id)
       values ($1, 'Spoof owner staging', 'LOW', 'OPEN', $2)`,
      [PILOT, CMG],
    );
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e.message };
  }
});
check('SEC-DB-002 manual record creator must match actor', !spoof.ok && /manual_record_creator_mismatch/.test(spoof.message || ''));

const auditEntity = openFinding;
const auditEventType = `SEC_DB_STAGING_TEST_${Date.now()}`;
await withRlsSessionCommit(url, CMG, async (c) => {
  await c.query(
    `insert into workflow_events (organisation_id, entity_type, entity_id, event_type, metadata, created_by_user_id)
     values ($1, 'finding', $2, $3, '{}'::jsonb, $4)`,
    [PILOT, auditEntity, auditEventType, CMG],
  );
});
const auditUpdate = await withRlsSession(url, CMG, async (c) => {
  try {
    await c.query(`update workflow_events set metadata = '{"tainted":true}'::jsonb where entity_id = $1 and event_type = $2`, [
      auditEntity,
      auditEventType,
    ]);
    return { blocked: false };
  } catch (e) {
    return { blocked: /workflow_events_immutable|permission denied/i.test(e.message || '') };
  }
});
check('SEC-DB-003 workflow_events update blocked', auditUpdate.blocked === true, auditUpdate);

const auditDelete = await withRlsSession(url, CMG, async (c) => {
  try {
    const del = await c.query(`delete from workflow_events where entity_id = $1 and event_type = $2`, [
      auditEntity,
      auditEventType,
    ]);
    return { blocked: del.rowCount === 0 };
  } catch (e) {
    return { blocked: /workflow_events_immutable/.test(e.message || '') };
  }
});
check('SEC-DB-003 workflow_events delete blocked', auditDelete.blocked === true, auditDelete);

const OUT = resolve(process.cwd(), '..', '..', 'docs', 'eval', 'SEC-DB-STAGING-VALIDATION-2026-11-23.json');
writeFileSync(
  OUT,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      pass,
      fail,
      findingId: openFinding,
      connectionRoleProbe: {
        currentUser: roleProbe.currentUser,
        privileged: roleProbe.privileged,
      },
    },
    null,
    2,
  ),
);

console.log(`\nacceptance-ri-security-db-staging: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);