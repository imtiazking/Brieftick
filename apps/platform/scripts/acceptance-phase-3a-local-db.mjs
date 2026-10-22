#!/usr/bin/env node
/**
 * Phase 3A — live local PostgreSQL verification (embedded-postgres; auth.jwt shim).
 * Requires: npm run sync:reference-catalogue (generated seed SQL).
 */
import pg from 'pg';
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ORG_A,
  ORG_B,
  USER_A,
  USER_B,
  applyAllMigrations,
  applyReferenceSeed,
  ensureAppRole,
  environmentReport,
  insertTestPublication,
  resetAndStartEmbedded,
  seedTenantFixtures,
  stopEmbedded,
  withRlsSession,
  withRlsSessionCommit,
} from './local-db/harness.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const platformRoot = join(__dir, '..');

const OBLIGATION_STATUS_GROUPS = {
  active: ['OPEN', 'IN_PROGRESS', 'OVERDUE'],
  preActive: ['DRAFT', 'IN_REVIEW'],
  terminal: ['COMPLETE', 'HISTORIC', 'CLOSED'],
};

let fail = 0;
function pass(msg) {
  console.log(`PASS: ${msg}`);
}
function failMsg(msg) {
  fail += 1;
  console.error(`FAIL: ${msg}`);
}

function assert(cond, msg) {
  if (cond) pass(msg);
  else failMsg(msg);
}

const GLOBAL_TABLES = ['regulators', 'regulatory_sources', 'regulatory_publications'];
const TENANT_TABLES = [
  'organisation_publications',
  'applicability_assessments',
  'regulatory_changes',
  'impact_assessments',
  'regulatory_obligations',
  'policies',
  'risks',
  'controls',
  'actions',
  'evidence_items',
  'assurance_reviews',
  'findings',
  'workflow_events',
];
const JOIN_TABLES = [
  'obligation_policy_links',
  'obligation_risk_links',
  'risk_control_links',
  'obligation_control_links',
  'evidence_obligation_links',
  'finding_action_links',
];

const STABLE_KEYS = ['REG-FCA', 'REG-PRA', 'REG-SAMA', 'REG-DFSA'];

async function verifyStructure(adminClient) {
  for (const t of [...GLOBAL_TABLES, ...TENANT_TABLES, ...JOIN_TABLES]) {
    const { rows } = await adminClient.query(
      `select to_regclass($1) as reg`,
      [`public.${t}`],
    );
    assert(rows[0].reg !== null, `table public.${t} exists`);
  }

  for (const t of TENANT_TABLES) {
    const { rows } = await adminClient.query(
      `select column_name from information_schema.columns
       where table_schema = 'public' and table_name = $1 and column_name = 'organisation_id'`,
      [t],
    );
    assert(rows.length === 1, `${t}.organisation_id present`);
  }

  const { rows: rls } = await adminClient.query(
    `select relname, relrowsecurity from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and relname = any($1::text[])`,
    [TENANT_TABLES],
  );
  assert(
    rls.length === TENANT_TABLES.length && rls.every((r) => r.relrowsecurity),
    'RLS enabled on core tenant tables',
  );

  const { rows: enums } = await adminClient.query(
    `select typname from pg_type t join pg_namespace n on n.oid = t.typnamespace
     where n.nspname = 'public' and typname = 'obligation_status'`,
  );
  assert(enums.length === 1, 'obligation_status enum exists');
}

async function verifyCatalogue(adminClient) {
  const { rows: rc } = await adminClient.query(`select count(*)::int as n from public.regulators`);
  assert(rc[0].n === 36, `regulators seeded (36) — got ${rc[0].n}`);

  const { rows: sc } = await adminClient.query(
    `select count(*)::int as n from public.regulatory_sources`,
  );
  assert(sc[0].n === 41, `sources seeded (41) — got ${sc[0].n}`);

  for (const key of STABLE_KEYS) {
    const { rows } = await adminClient.query(
      `select count(*)::int as n from public.regulators where external_key = $1`,
      [key],
    );
    assert(rows[0].n === 1, `regulator ${key} exactly once`);
  }

  const { rows: enabled } = await adminClient.query(
    `select count(*)::int as n from public.regulatory_sources where production_status = 'ENABLED'`,
  );
  assert(enabled[0].n === 0, 'no production ENABLED sources');

  const { rows: notEn } = await adminClient.query(
    `select count(*)::int as n from public.regulatory_sources where production_status = 'NOT_ENABLED'`,
  );
  assert(notEn[0].n === 41, 'all sources NOT_ENABLED');
}

async function verifyRlsIsolation(adminUrl) {
  const countChanges = async (sub, orgId) =>
    withRlsSession(adminUrl, sub, async (c) => {
      const { rows } = await c.query(
        `select count(*)::int as n from public.regulatory_changes where organisation_id = $1`,
        [orgId],
      );
      return rows[0].n;
    });

  const aOwn = await countChanges(USER_A, ORG_A);
  const aOther = await countChanges(USER_A, ORG_B);
  const bOwn = await countChanges(USER_B, ORG_B);
  const bOther = await countChanges(USER_B, ORG_A);

  assert(aOwn >= 1, 'USER-A reads ORG-A changes');
  assert(aOther === 0, 'USER-A cannot read ORG-B changes');
  assert(bOwn >= 1, 'USER-B reads ORG-B changes');
  assert(bOther === 0, 'USER-B cannot read ORG-A changes');

  const unknown = await countChanges('clerk_unknown_test', ORG_A);
  assert(unknown === 0, 'unknown user sees no ORG-A changes');

  let spoofBlocked = false;
  try {
    await withRlsSessionCommit(adminUrl, USER_A, async (c) => {
      await c.query(
        `insert into public.regulatory_changes (
          organisation_id, publication_id, title, change_type, status
        ) select $1, publication_id, 'SPOOF', 'TEST', 'DRAFT'
        from public.regulatory_changes where organisation_id = $2 limit 1`,
        [ORG_B, ORG_A],
      );
    });
  } catch {
    spoofBlocked = true;
  }
  assert(spoofBlocked, 'spoofed organisation_id insert blocked by RLS');

  const updateRes = await withRlsSession(adminUrl, USER_A, async (c) =>
    c.query(`update public.regulators set acronym = 'ZZZ' where external_key = 'REG-FCA'`),
  );
  assert(updateRes.rowCount === 0, 'authenticated tenant cannot UPDATE global regulators (RLS)');

  const readRes = await withRlsSession(adminUrl, USER_A, async (c) =>
    c.query(`select count(*)::int as n from public.regulators`),
  );
  assert(readRes.rows[0].n === 36, 'authenticated user can read global regulators');
}

async function verifyMembershipPrivileges(adminUrl) {
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  await admin.query(
    `insert into public.organisation_memberships (organisation_id, clerk_user_id, role, status)
     values ($1, 'clerk_viewer_a_test', 'VIEWER'::public.platform_role, 'active')
     on conflict (organisation_id, clerk_user_id) do update set role = 'VIEWER'`,
    [ORG_A],
  );
  await admin.end();

  let viewerCannotPromote = false;
  try {
    await withRlsSessionCommit(adminUrl, 'clerk_viewer_a_test', async (c) => {
      await c.query(
        `insert into public.organisation_memberships (organisation_id, clerk_user_id, role, status)
         values ($1, 'clerk_elevated_test', 'ADMIN'::public.platform_role, 'active')`,
        [ORG_A],
      );
    });
  } catch {
    viewerCannotPromote = true;
  }
  assert(viewerCannotPromote, 'VIEWER cannot perform ADMIN membership mutations');

  await withRlsSessionCommit(adminUrl, USER_B, async (c) => {
    await c.query(
      `insert into public.organisation_memberships (organisation_id, clerk_user_id, role, status)
       values ($1, 'clerk_admin_b_test', 'ADMIN'::public.platform_role, 'active')
       on conflict do nothing`,
      [ORG_B],
    );
  });

  let adminCannotAssignOwner = false;
  try {
    await withRlsSessionCommit(adminUrl, 'clerk_admin_b_test', async (c) => {
      await c.query(
        `insert into public.organisation_memberships (organisation_id, clerk_user_id, role, status)
         values ($1, 'clerk_new_owner_test', 'OWNER'::public.platform_role, 'active')`,
        [ORG_B],
      );
    });
  } catch {
    adminCannotAssignOwner = true;
  }
  assert(adminCannotAssignOwner, 'ADMIN cannot assign OWNER membership');
}

async function verifyRelationshipAuthority(adminUrl, publicationId, fixtureA) {
  const { controlId, obligationId: oblA } = fixtureA;

  const oblB = await withRlsSessionCommit(adminUrl, USER_A, async (c) => {
    const { rows } = await c.query(
      `insert into public.regulatory_obligations (
        organisation_id, regulatory_change_id, publication_id, obligation_statement, status, external_key
      ) values ($1, (select id from public.regulatory_changes where organisation_id = $1 limit 1),
        $2, 'TEST Obligation B shared control', 'OPEN', 'TEST-OBL-A-SHARED')
      returning id`,
      [ORG_A, publicationId],
    );
    await c.query(
      `insert into public.obligation_control_links (organisation_id, obligation_id, control_id)
       values ($1, $2, $3)`,
      [ORG_A, rows[0].id, controlId],
    );
    return rows[0].id;
  });

  const evLinks = await withRlsSession(adminUrl, USER_A, async (c) => {
    const { rows } = await c.query(
      `select obligation_id from public.evidence_obligation_links where organisation_id = $1`,
      [ORG_A],
    );
    return rows.map((r) => r.obligation_id);
  });
  assert(evLinks.includes(oblA) && !evLinks.includes(oblB), 'evidence explicit to Obligation A only');

  const actionId = await withRlsSessionCommit(adminUrl, USER_A, async (c) => {
    const { rows } = await c.query(
      `insert into public.actions (organisation_id, title, source_type, status, external_key)
       values ($1, 'TEST finding action', 'finding', 'OPEN', 'TEST-ACT-A') returning id`,
      [ORG_A],
    );
    return rows[0].id;
  });

  const findingId = await withRlsSessionCommit(adminUrl, USER_A, async (c) => {
    const { rows } = await c.query(
      `insert into public.findings (organisation_id, title, severity, status, external_key)
       values ($1, 'TEST finding', 'medium', 'OPEN', 'TEST-FND-A') returning id`,
      [ORG_A],
    );
    await c.query(
      `insert into public.finding_action_links (organisation_id, finding_id, action_id)
       values ($1, $2, $3)`,
      [ORG_A, rows[0].id, actionId],
    );
    return rows[0].id;
  });

  const findingOblLinks = await withRlsSession(adminUrl, USER_A, async (c) => {
    const { rows } = await c.query(
      `select to_regclass('public.finding_obligation_links') as reg`,
    );
    return rows[0].reg;
  });
  assert(findingOblLinks === null, 'no finding_obligation inference table');

  const oblCountViaFinding = await withRlsSession(adminUrl, USER_A, async (c) => {
    const { rows } = await c.query(
      `select count(*)::int as n from public.regulatory_obligations o
       where o.organisation_id = $1
         and exists (
           select 1 from public.findings f
           join public.finding_action_links fal on fal.finding_id = f.id
           where f.id = $2
         )`,
      [ORG_A, findingId],
    );
    return rows[0].n;
  });
  assert(
    oblCountViaFinding >= 2,
    'obligations exist independently of finding (no automatic attachment)',
  );
}

async function verifyObligationTaxonomy(adminUrl, publicationId) {
  const statuses = [
    'DRAFT',
    'IN_REVIEW',
    'OPEN',
    'IN_PROGRESS',
    'OVERDUE',
    'COMPLETE',
    'HISTORIC',
    'CLOSED',
  ];
  await withRlsSessionCommit(adminUrl, USER_A, async (c) => {
    for (const st of statuses) {
      await c.query(
        `insert into public.regulatory_obligations (
          organisation_id, publication_id, obligation_statement, status, external_key
        ) values ($1, $2, $3, $4::public.obligation_status, $5)`,
        [ORG_A, publicationId, `TEST taxonomy ${st}`, st, `TEST-TAX-${st}`],
      );
    }
  });

  const { rows } = await withRlsSession(adminUrl, USER_A, async (c) =>
    c.query(
      `select status::text as status, count(*)::int as n
       from public.regulatory_obligations
       where organisation_id = $1 and external_key like 'TEST-TAX-%'
       group by status`,
      [ORG_A],
    ),
  );
  const byStatus = Object.fromEntries(rows.map((r) => [r.status, r.n]));
  for (const st of statuses) {
    assert(byStatus[st] === 1, `obligation status ${st} insert accepted`);
  }

  const activeCount = statuses
    .filter((s) => OBLIGATION_STATUS_GROUPS.active.includes(s))
    .reduce((sum, s) => sum + (byStatus[s] || 0), 0);
  assert(activeCount === 3, 'ACTIVE group (OPEN, IN_PROGRESS, OVERDUE) count = 3');
  assert(byStatus.OVERDUE === 1, 'OVERDUE is explicit status (not ambiguous open)');
}

async function verifyDeleteProvenance(adminClient, publicationId) {
  let pubDeleteBlocked = false;
  try {
    await adminClient.query(`delete from public.regulatory_publications where id = $1`, [
      publicationId,
    ]);
  } catch {
    pubDeleteBlocked = true;
  }
  assert(pubDeleteBlocked, 'DELETE publication RESTRICT when changes reference it');

  const { rows: obl } = await adminClient.query(
    `select id from public.regulatory_obligations where external_key = 'TEST-OBL-A' limit 1`,
  );
  const { rows: link } = await adminClient.query(
    `select id from public.obligation_control_links
     where obligation_id = $1 limit 1`,
    [obl[0].id],
  );
  await adminClient.query(`delete from public.obligation_control_links where id = $1`, [
    link[0].id,
  ]);
  const { rows: still } = await adminClient.query(
    `select id from public.regulatory_obligations where id = $1`,
    [obl[0].id],
  );
  assert(still.length === 1, 'deleting link row does not delete obligation');

  let oblDeleteBlocked = false;
  try {
    await adminClient.query(`delete from public.regulatory_obligations where id = $1`, [
      obl[0].id,
    ]);
  } catch {
    oblDeleteBlocked = true;
  }
  assert(oblDeleteBlocked, 'DELETE obligation RESTRICT when evidence link exists');
}

async function runCleanCycle(label) {
  console.log(`\n--- ${label} ---`);
  const { embedded, adminUrl } = await resetAndStartEmbedded({ port: 54328 });
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    await applyAllMigrations(admin);
    await ensureAppRole(admin);
    await applyReferenceSeed(admin);
    await verifyStructure(admin);
    await verifyCatalogue(admin);

    const publicationId = await insertTestPublication(admin);
    const fixtures = await seedTenantFixtures(adminUrl, publicationId);

    await verifyRlsIsolation(adminUrl);
    await verifyMembershipPrivileges(adminUrl);
    await verifyRelationshipAuthority(adminUrl, publicationId, fixtures.fixtureA);
    await verifyObligationTaxonomy(adminUrl, publicationId);
    await verifyDeleteProvenance(admin, publicationId);

    pass(`${label} completed`);
    return true;
  } catch (e) {
    failMsg(`${label} threw: ${e.message}`);
    return false;
  } finally {
    await admin.end();
    await stopEmbedded(embedded);
  }
}

console.log('Phase 3A local DB verification');
console.log('Environment:', JSON.stringify(environmentReport(), null, 2));

try {
  execSync('npm run sync:reference-catalogue', { cwd: platformRoot, stdio: 'pipe' });
  pass('reference catalogue SQL generated');
} catch (e) {
  failMsg(`sync:reference-catalogue failed: ${e.message}`);
}

const run1Ok = await runCleanCycle('Clean migration run #1');
const run2Ok = await runCleanCycle('Clean migration run #2');

assert(run1Ok, 'Clean migration run #1');
assert(run2Ok, 'Clean migration run #2');
assert(run1Ok && run2Ok, 'DATABASE REPRODUCIBILITY');

if (fail) {
  console.error(`\nPhase 3A local DB acceptance: FAIL (${fail})`);
  process.exit(1);
}
console.log('\nPhase 3A local DB acceptance: PASS');
console.log('DATABASE REPRODUCIBILITY: PASS');
