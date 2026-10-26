#!/usr/bin/env node
/**
 * Regression: impact assessment create, save draft (update), dimensions, no duplicates.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import {
  ORG_A,
  USER_A,
  USER_B,
  applyAllMigrations,
  applyReferenceSeed,
  ensureAppRole,
  insertTestPublication,
  resetAndStartEmbedded,
  stopEmbedded,
  withRlsSessionCommit,
} from './local-db/harness.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const platformRoot = join(__dir, '..');

let fail = 0;
function pass(msg) {
  console.log(`PASS: ${msg}`);
}
function failMsg(msg) {
  fail += 1;
  console.error(`FAIL: ${msg}`);
}

const actionsSrc = readFileSync(join(platformRoot, 'lib', 'ri', 'server-actions.ts'), 'utf8');
if (actionsSrc.includes('redirect(`/ri/impact-assessments/${impactId}?saved=1`)')) {
  pass('updateImpactAction redirects after save (POST-redirect-GET)');
} else failMsg('updateImpactAction must redirect after draft save');

if (actionsSrc.includes('revalidatePath(`/ri/impact-assessments/${impactId}`)')) {
  pass('updateImpactAction revalidates impact detail path');
} else failMsg('updateImpactAction must revalidate detail path');

const pageSrc = readFileSync(
  join(platformRoot, 'app', 'ri', 'impact-assessments', '[id]', 'page.tsx'),
  'utf8',
);
if (pageSrc.includes('Draft saved successfully')) pass('impact detail shows saved confirmation banner');
else failMsg('impact detail saved banner');

const impactSvc = readFileSync(join(platformRoot, 'lib', 'ri', 'services', 'impact.ts'), 'utf8');
if (impactSvc.includes('deleteAreasError') && impactSvc.includes('insertAreasError')) {
  pass('business area persistence checks Supabase errors');
} else failMsg('business area delete/insert must surface errors');

console.log('\n--- Embedded Postgres impact draft workflow ---\n');

const { embedded, adminUrl } = await resetAndStartEmbedded({ port: 54333 });
const admin = new pg.Client({ connectionString: adminUrl });
await admin.connect();

try {
  await applyAllMigrations(admin);
  await ensureAppRole(admin);
  await applyReferenceSeed(admin);
  const publicationId = await insertTestPublication(admin);

  await admin.query(
    `insert into public.organisations (id, name, slug) values ($1, 'TEST ORG-A', 'test-org-a') on conflict do nothing`,
    [ORG_A],
  );
  await admin.query(
    `insert into public.organisation_memberships (organisation_id, clerk_user_id, role, status)
     values ($1, $2, 'ANALYST'::public.platform_role, 'active'),
            ($1, $3, 'COMPLIANCE_MANAGER'::public.platform_role, 'active')
     on conflict (organisation_id, clerk_user_id) do update set role = excluded.role`,
    [ORG_A, USER_A, USER_B],
  );

  const { changeId, impactId } = await withRlsSessionCommit(adminUrl, USER_A, async (c) => {
    const chg = await c.query(
      `insert into regulatory_changes (organisation_id, publication_id, title, change_type, status)
       values ($1, $2, 'Impact draft test change', 'TEST', 'DRAFT') returning id`,
      [ORG_A, publicationId],
    );
    const imp = await c.query(
      `insert into impact_assessments (organisation_id, regulatory_change_id, status, owner_user_id, materiality)
       values ($1, $2, 'DRAFT', $3, 'LOW') returning id`,
      [ORG_A, chg.rows[0].id, USER_A],
    );
    return { changeId: chg.rows[0].id, impactId: imp.rows[0].id };
  });

  const beforeCount = await admin.query(
    `select count(*)::int as n from impact_assessments where organisation_id = $1 and regulatory_change_id = $2`,
    [ORG_A, changeId],
  );
  if (beforeCount.rows[0].n === 1) pass('single impact assessment after create');
  else failMsg(`expected 1 impact row, got ${beforeCount.rows[0].n}`);

  await withRlsSessionCommit(adminUrl, USER_A, async (c) => {
    await c.query(
      `update impact_assessments set
         business_impact = 'Updated business narrative',
         operational_impact = 'Updated ops',
         materiality = 'HIGH',
         due_date = '2026-11-20'
       where id = $1 and organisation_id = $2`,
      [impactId, ORG_A],
    );
    await c.query(
      `delete from impact_assessment_business_areas where impact_assessment_id = $1`,
      [impactId],
    );
    await c.query(
      `insert into impact_assessment_business_areas (organisation_id, impact_assessment_id, business_area)
       values ($1, $2, 'Retail'), ($1, $2, 'Wholesale')`,
      [ORG_A, impactId],
    );
  });

  const { rows: saved } = await admin.query(
    `select owner_user_id, materiality, due_date::text, business_impact, status
     from impact_assessments where id = $1`,
    [impactId],
  );
  if (saved[0]?.owner_user_id === USER_A && saved[0]?.materiality === 'HIGH') {
    pass('draft fields persisted with correct owner');
  } else failMsg('draft field persistence');

  const { rows: areas } = await admin.query(
    `select business_area from impact_assessment_business_areas where impact_assessment_id = $1 order by 1`,
    [impactId],
  );
  if (areas.length === 2 && areas[0].business_area === 'Retail') pass('business area dimensions persisted');
  else failMsg('business area dimensions');

  const afterCount = await admin.query(
    `select count(*)::int as n from impact_assessments where organisation_id = $1 and regulatory_change_id = $2`,
    [ORG_A, changeId],
  );
  if (afterCount.rows[0].n === 1) pass('save draft does not duplicate impact assessment');
  else failMsg('duplicate impact assessments after update');

  const bSees = await withRlsSessionCommit(adminUrl, USER_B, async (c) => {
    const r = await c.query(`select count(*)::int as n from impact_assessments where id = $1`, [impactId]);
    return r.rows[0].n;
  });
  if (bSees === 1) pass('COMPLIANCE_MANAGER in same org can read impact (RLS)');
  else failMsg('org member cannot read impact');
} catch (e) {
  failMsg(e.message);
} finally {
  await admin.end();
  await stopEmbedded(embedded);
}

if (fail > 0) {
  console.error(`\nImpact draft save acceptance: FAIL (${fail})\n`);
  process.exit(1);
}
console.log('\nImpact draft save acceptance: PASS\n');
