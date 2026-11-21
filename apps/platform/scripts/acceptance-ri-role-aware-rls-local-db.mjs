#!/usr/bin/env node
/**
 * Isolated embedded Postgres (never staging): role-aware RLS migration 20261120140000.
 * Existing-data preservation, per-role write matrix under RLS with simulated Clerk identities,
 * append-only audit events, the AI publication-to-obligation workflow by role, tenant isolation,
 * evidence storage policies, rollback and re-apply.
 * Requires: npm run sync:reference-catalogue
 */
import pg from 'pg';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  applyReferenceSeed,
  applySqlFile,
  ensureAppRole,
  insertTestPublication,
  platformRoot,
  resetAndStartEmbedded,
  stopEmbedded,
  withRlsSession,
  withRlsSessionCommit,
} from './local-db/harness.mjs';

const PILOT = 'b8f5e3a1-00ad-4000-8000-000000000001';
const UAT = '4d871541-e0d4-4581-828d-72073f763f85';
const VIEW = 'user_viewer';
const REV = 'user_reviewer';
const ANA = 'user_analyst';
const CMG = 'user_compliance_manager';
const ADM = 'user_admin';
const UAT_OWNER = 'user_uat_owner';
const ROLES = [
  [VIEW, 'VIEWER', 10],
  [REV, 'REVIEWER', 20],
  [ANA, 'ANALYST', 30],
  [CMG, 'COMPLIANCE_MANAGER', 40],
  [ADM, 'ADMIN', 50],
];
const RANK = { VIEWER: 10, REVIEWER: 20, ANALYST: 30, COMPLIANCE_MANAGER: 40, ADMIN: 50, NONE: 99 };

const migrationsDir = join(platformRoot, 'supabase', 'migrations');
const RLS_FILE = '20261120140000_ri_role_aware_rls.sql';
const RLS_UP = join(migrationsDir, RLS_FILE);
const RLS_DOWN = join(platformRoot, 'supabase', 'rollbacks', '20261120140000_ri_role_aware_rls.down.sql');

let failures = 0;
let passes = 0;
const pass = (m) => {
  passes += 1;
  console.log(`PASS: ${m}`);
};
const fail = (m) => {
  failures += 1;
  console.error(`FAIL: ${m}`);
};
const isRls = (r) => !r.ok && /row-level security/.test(r.message);

async function attempt(adminUrl, sub, sql, params = []) {
  try {
    const res = await withRlsSession(adminUrl, sub, (c) => c.query(sql, params));
    return { ok: true, rowCount: res.rowCount, rows: res.rows };
  } catch (e) {
    return { ok: false, code: e.code, message: e.message };
  }
}

async function commitAs(adminUrl, sub, fn) {
  return withRlsSessionCommit(adminUrl, sub, fn);
}

const SNAPSHOT_SQL = `
  select json_object_agg(k, v order by k) as tables from (
    select c.relname as k,
      (xpath('/row/v/text()', query_to_xml(format(
        'select count(*)::text || '':'' || coalesce(md5(string_agg(md5(t::text), '''' order by md5(t::text))), ''-'') as v from public.%I t',
        c.relname), false, true, '')))[1]::text as v
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where c.relkind in ('r', 'p') and n.nspname = 'public'
  ) s`;
const POLICY_SQL = `
  select string_agg(schemaname || '.' || tablename || '.' || policyname || ':' || cmd || ':' || coalesce(qual, '') || ':' || coalesce(with_check, ''),
                    E'\\n' order by schemaname, tablename, policyname) as sig
  from pg_policies where schemaname in ('public', 'storage')`;

async function snapshot(db) {
  return JSON.stringify((await db.query(SNAPSHOT_SQL)).rows[0].tables);
}
async function policySig(db) {
  return (await db.query(POLICY_SQL)).rows[0].sig;
}

const { embedded, adminUrl } = await resetAndStartEmbedded({ port: 54346 });
const db = new pg.Client({ connectionString: adminUrl });
await db.connect();

try {
  // ---- schema as staging has it today (all migrations except the new one), plus a Storage shim ----
  await applySqlFile(db, join(platformRoot, 'scripts', 'local-db', 'auth-jwt-shim.sql'));
  await db.query(`
    do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
    do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
    create schema if not exists storage;
    create table if not exists storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table if not exists storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
    alter table storage.objects enable row level security;
  `);
  const files = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql') && f < RLS_FILE).sort();
  for (const f of files) await applySqlFile(db, join(migrationsDir, f));
  await ensureAppRole(db);
  await db.query(`
    grant all on all tables in schema public to anon, authenticated;
    grant authenticated to forgeniq_app;
    grant usage on schema storage to forgeniq_app;
    grant select, insert, update, delete on storage.objects to forgeniq_app;
  `);
  await applyReferenceSeed(db);
  pass(`pre-migration schema built from ${files.length} migrations (staging state) with a Storage shim`);

  // ---- seed: AI Development and Partner UAT with one row per protected table ----
  const pubId = await insertTestPublication(db);
  const verId = (
    await db.query(
      `insert into regulatory_publication_versions (publication_id, version_number, source_hash, canonical_url, retrieved_at)
       values ($1, 1, 'hash-1', 'https://example.test/pub', now()) returning id`,
      [pubId],
    )
  ).rows[0].id;
  await db.query(
    `insert into organisations (id, name, slug) values ($1, 'AI Development (test)', 'ai-dev-test'), ($2, 'Partner UAT (test)', 'partner-uat-test')`,
    [PILOT, UAT],
  );
  for (const [user, role] of ROLES) {
    await db.query(
      `insert into organisation_memberships (organisation_id, clerk_user_id, role, status) values ($1, $2, $3::platform_role, 'active')`,
      [PILOT, user, role],
    );
  }
  await db.query(
    `insert into organisation_memberships (organisation_id, clerk_user_id, role, status) values ($1, $2, 'OWNER', 'active')`,
    [UAT, UAT_OWNER],
  );

  const seedOrg = async (org, actor) => {
    const one = async (sql, params) => (await db.query(sql, params)).rows[0].id;
    const change = await one(
      `insert into regulatory_changes (organisation_id, publication_id, title, change_type, status, created_by_user_id)
       values ($1, $2, 'Seed change', 'TEST', 'OPEN', $3) returning id`, [org, pubId, actor]);
    const obligation = await one(
      `insert into regulatory_obligations (organisation_id, regulatory_change_id, publication_id, obligation_statement, status, created_by_user_id)
       values ($1, $2, $3, 'Seed obligation', 'OPEN', $4) returning id`, [org, change, pubId, actor]);
    const risk = await one(`insert into risks (organisation_id, title) values ($1, 'Seed risk') returning id`, [org]);
    const control = await one(`insert into controls (organisation_id, name) values ($1, 'Seed control') returning id`, [org]);
    const evidence = await one(`insert into evidence_items (organisation_id, title, evidence_type) values ($1, 'Seed evidence', 'TEST') returning id`, [org]);
    await db.query(`insert into policies (organisation_id, name) values ($1, 'Seed policy')`, [org]);
    await db.query(`insert into findings (organisation_id, title, severity) values ($1, 'Seed finding', 'LOW')`, [org]);
    await db.query(`insert into actions (organisation_id, title, source_type) values ($1, 'Seed action', 'MANUAL')`, [org]);
    await db.query(`insert into applicability_assessments (organisation_id, publication_id) values ($1, $2)`, [org, pubId]);
    await db.query(`insert into impact_assessments (organisation_id, regulatory_change_id) values ($1, $2)`, [org, change]);
    await db.query(`insert into organisation_publications (organisation_id, publication_id) values ($1, $2)`, [org, pubId]);
    await db.query(`insert into obligation_risk_links (organisation_id, obligation_id, risk_id) values ($1, $2, $3)`, [org, obligation, risk]);
    await db.query(`insert into obligation_control_links (organisation_id, obligation_id, control_id) values ($1, $2, $3)`, [org, obligation, control]);
    await db.query(`insert into risk_control_links (organisation_id, risk_id, control_id) values ($1, $2, $3)`, [org, risk, control]);
    await db.query(`insert into evidence_obligation_links (organisation_id, evidence_id, obligation_id) values ($1, $2, $3)`, [org, evidence, obligation]);
    await db.query(`insert into assurance_reviews (organisation_id, review_type, result, review_date) values ($1, 'TEST', 'PASS', current_date)`, [org]);
    const run = await one(
      `insert into ai_analysis_runs (organisation_id, use_case_id, publication_id, publication_version_id, provider, prompt_version, requested_by)
       values ($1, 'UC-RI-001', $2, $3, 'AIPROV-FIXTURE-001', 'v1', $4) returning id`, [org, pubId, verId, actor]);
    await db.query(`insert into ai_analysis_citations (organisation_id, analysis_run_id, claim_index, claim_text) values ($1, $2, 0, 'Seed claim')`, [org, run]);
    await db.query(`insert into ai_analysis_reviews (organisation_id, analysis_run_id, decision, reviewer_user_id) values ($1, $2, 'REJECTED', $3)`, [org, run, actor]);
    await db.query(
      `insert into workflow_events (organisation_id, entity_type, entity_id, event_type, actor_user_id) values ($1, 'regulatory_change', $2, 'CHANGE_CREATED', $3)`,
      [org, change, actor]);
    await db.query(`insert into ask_ri_query_log (organisation_id, user_id, question, status) values ($1, $2, 'Seed question', 'OK')`, [org, actor]);
    return { change, obligation, risk, control, evidence, run };
  };
  const pilotSeed = await seedOrg(PILOT, ANA);
  const uatSeed = await seedOrg(UAT, UAT_OWNER);
  await db.query(`insert into storage.objects (bucket_id, name) values ('ri-tenant-evidence', $1), ('ri-tenant-evidence', $2)`,
    [`${PILOT}/seed.pdf`, `${UAT}/seed.pdf`]);
  pass('seeded representative records in AI Development and Partner UAT');

  // ---- apply: existing data preserved, membership-only write policies replaced ----
  const before = await snapshot(db);
  const policiesBefore = await policySig(db);
  await applySqlFile(db, RLS_UP);
  pass('role-aware RLS migration applies over existing data');
  const afterUp = await snapshot(db);
  if (afterUp === before) pass('every public table byte-identical after the migration (no data modified)');
  else fail('table contents changed during the migration');
  const policiesAfter = await policySig(db);
  await applySqlFile(db, RLS_UP);
  if ((await policySig(db)) === policiesAfter) pass('migration is idempotent (re-apply yields the same policy set)');
  else fail('re-apply changed the policy set');

  const leftovers = await db.query(
    `select tablename || '.' || policyname as p from pg_policies
      where schemaname = 'public' and cmd in ('INSERT', 'UPDATE', 'DELETE')
        and (coalesce(qual, '') = 'is_active_member(organisation_id)' or coalesce(with_check, '') = 'is_active_member(organisation_id)')
        and tablename not in ('tenant_notifications')`,
  );
  if (leftovers.rows.length === 0) pass('no membership-only write policy remains on compliance tables');
  else fail(`membership-only write policies remain: ${leftovers.rows.map((r) => r.p).join(', ')}`);
  const wfMutate = await db.query(`select count(*)::int n from pg_policies where tablename = 'workflow_events' and cmd in ('UPDATE', 'DELETE', 'ALL')`);
  if (wfMutate.rows[0].n === 0) pass('workflow_events has no UPDATE/DELETE policy (append-only via API)');
  else fail('workflow_events still has UPDATE/DELETE policies');
  const pinned = await db.query(
    `select proname from pg_proc where proname in ('ri_has_min_role', 'ri_guard_role_scoped_update') and coalesce(proconfig, '{}') @> array['search_path=""']`,
  );
  if (pinned.rows.length === 2) pass('new functions pin search_path to empty');
  else fail(`search_path not pinned: ${JSON.stringify(pinned.rows)}`);
  const trunc = await db.query(
    `select count(*)::int n from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p')
        and (has_table_privilege('authenticated', c.oid, 'TRUNCATE') or has_table_privilege('anon', c.oid, 'TRUNCATE'))`,
  );
  if (trunc.rows[0].n === 0) pass('TRUNCATE (which bypasses RLS) revoked from anon/authenticated on every public table');
  else fail(`${trunc.rows[0].n} tables still grant TRUNCATE to API roles`);

  // ---- per-role write matrix (insert duplicate / no-op update / delete; all rolled back) ----
  const MATRIX = [
    ['regulatory_changes', 'ANALYST', 'ANALYST', 'ADMIN'],
    ['regulatory_obligations', 'ANALYST', 'REVIEWER*', 'ADMIN'],
    ['applicability_assessments', 'ANALYST', 'ANALYST', 'ADMIN'],
    ['impact_assessments', 'ANALYST', 'ANALYST', 'ADMIN'],
    ['organisation_publications', 'ANALYST', 'ANALYST', 'ADMIN'],
    ['policies', 'ANALYST', 'ANALYST', 'ADMIN'],
    ['risks', 'ANALYST', 'ANALYST', 'ADMIN'],
    ['controls', 'ANALYST', 'ANALYST', 'ADMIN'],
    ['evidence_items', 'ANALYST', 'ANALYST', 'ADMIN'],
    ['findings', 'ANALYST', 'ANALYST', 'ADMIN'],
    ['actions', 'ANALYST', 'ANALYST', 'ANALYST'],
    ['obligation_risk_links', 'ANALYST', 'ANALYST', 'ANALYST'],
    ['obligation_control_links', 'ANALYST', 'ANALYST', 'ADMIN'],
    ['risk_control_links', 'ANALYST', 'ANALYST', 'ADMIN'],
    ['evidence_obligation_links', 'ANALYST', 'ANALYST', 'ADMIN'],
    ['assurance_reviews', 'COMPLIANCE_MANAGER', 'COMPLIANCE_MANAGER', 'ADMIN'],
    ['ai_analysis_runs', 'ANALYST', 'REVIEWER*', 'ANALYST'],
    ['ai_analysis_citations', 'ANALYST', 'ANALYST', 'ADMIN'],
    ['ai_analysis_reviews', 'REVIEWER', 'NONE', 'NONE'],
  ];
  let matrixChecks = 0;
  const matrixFailures = [];
  for (const [table, ins, upd, del] of MATRIX) {
    for (const [user, role, rank] of ROLES) {
      const insR = await attempt(adminUrl, user, `insert into public.${table} select * from public.${table} where organisation_id = $1 limit 1`, [PILOT]);
      const insAllowed = rank >= RANK[ins];
      matrixChecks += 1;
      if (insAllowed ? isRls(insR) || insR.ok === undefined : !isRls(insR)) {
        matrixFailures.push(`${role} INSERT ${table}: expected ${insAllowed ? 'past RLS' : 'RLS refusal'}, got ${insR.ok ? 'success' : insR.message}`);
      }

      const updR = await attempt(adminUrl, user, `update public.${table} set organisation_id = organisation_id where organisation_id = $1`, [PILOT]);
      const scoped = upd === 'REVIEWER*';
      const updMin = scoped ? 'REVIEWER' : upd;
      matrixChecks += 1;
      if (scoped && role === 'REVIEWER') {
        if (updR.ok || !/insufficient_role/.test(updR.message)) {
          matrixFailures.push(`REVIEWER UPDATE ${table}: expected insufficient_role (scoped), got ${updR.ok ? `rowCount ${updR.rowCount}` : updR.message}`);
        }
      } else if (rank >= RANK[updMin]) {
        if (!updR.ok || updR.rowCount < 1) matrixFailures.push(`${role} UPDATE ${table}: expected rows updated, got ${updR.ok ? `rowCount ${updR.rowCount}` : updR.message}`);
      } else if (!updR.ok || updR.rowCount !== 0) {
        matrixFailures.push(`${role} UPDATE ${table}: expected 0 rows, got ${updR.ok ? `rowCount ${updR.rowCount}` : updR.message}`);
      }

      const delR = await attempt(adminUrl, user, `delete from public.${table} where organisation_id = $1`, [PILOT]);
      matrixChecks += 1;
      if (rank >= RANK[del]) {
        const passedRls = (delR.ok && delR.rowCount > 0) || (!delR.ok && (delR.code === '23503' || delR.code === '23001'));
        if (!passedRls) matrixFailures.push(`${role} DELETE ${table}: expected deletion permitted, got ${delR.ok ? `rowCount ${delR.rowCount}` : delR.message}`);
      } else if (!delR.ok || delR.rowCount !== 0) {
        matrixFailures.push(`${role} DELETE ${table}: expected 0 rows, got ${delR.ok ? `rowCount ${delR.rowCount}` : delR.message}`);
      }
    }
  }
  if (matrixFailures.length === 0) pass(`role matrix: ${matrixChecks} insert/update/delete checks across ${MATRIX.length} tables × 5 roles match lib/ri/permissions.ts`);
  else for (const m of matrixFailures) fail(`role matrix: ${m}`);
  if ((await snapshot(db)) === afterUp) pass('role matrix probes left no trace (all rolled back)');
  else fail('role matrix probes changed data');

  // ---- audit events: append-only, own actor, role-appropriate event types ----
  const wfInsert = `insert into workflow_events (organisation_id, entity_type, entity_id, event_type, actor_user_id) values ($1, 'test', $2, $3, $4)`;
  const expectEvent = async (label, sub, org, type, actor, allowed) => {
    const r = await attempt(adminUrl, sub, wfInsert, [org, pilotSeed.change, type, actor]);
    if (allowed ? r.ok : isRls(r)) pass(label);
    else fail(`${label} — got ${r.ok ? 'success' : r.message}`);
  };
  await expectEvent('audit: VIEWER may log own Ask RI query event', VIEW, PILOT, 'ASK_RI_QUERY_COMPLETED', VIEW, true);
  await expectEvent('audit: VIEWER may log own evidence download event', VIEW, PILOT, 'EVIDENCE_DOWNLOADED', VIEW, true);
  await expectEvent('audit: VIEWER cannot log a compliance event (CHANGE_CREATED)', VIEW, PILOT, 'CHANGE_CREATED', VIEW, false);
  await expectEvent('audit: VIEWER cannot log an event as another user', VIEW, PILOT, 'ASK_RI_QUERY_COMPLETED', ANA, false);
  await expectEvent('audit: event without an actor refused', ANA, PILOT, 'CHANGE_CREATED', null, false);
  await expectEvent('audit: REVIEWER may log own obligation review decision', REV, PILOT, 'OBLIGATION_STATUS_CHANGED', REV, true);
  await expectEvent('audit: REVIEWER cannot log RISK_LINKED', REV, PILOT, 'RISK_LINKED', REV, false);
  await expectEvent('audit: ANALYST may log own compliance event', ANA, PILOT, 'CHANGE_CREATED', ANA, true);
  await expectEvent('audit: ANALYST cannot attribute an event to the Compliance Manager', ANA, PILOT, 'CHANGE_CREATED', CMG, false);
  await expectEvent('audit: AI Development analyst cannot write Partner UAT events', ANA, UAT, 'CHANGE_CREATED', ANA, false);
  for (const [user, role] of [...ROLES, [UAT_OWNER, 'other-tenant OWNER']]) {
    const u = await attempt(adminUrl, user, `update workflow_events set event_type = 'TAMPERED', actor_user_id = 'x' where organisation_id = $1`, [PILOT]);
    const d = await attempt(adminUrl, user, `delete from workflow_events where organisation_id = $1`, [PILOT]);
    if (u.ok && u.rowCount === 0 && d.ok && d.rowCount === 0) pass(`audit: ${role} cannot modify or delete existing events`);
    else fail(`audit: ${role} update ${JSON.stringify(u)} delete ${JSON.stringify(d)}`);
  }

  const askR = await attempt(adminUrl, VIEW, `insert into ask_ri_query_log (organisation_id, user_id, question, status) values ($1, $2, 'q', 'OK')`, [PILOT, VIEW]);
  const askForged = await attempt(adminUrl, VIEW, `insert into ask_ri_query_log (organisation_id, user_id, question, status) values ($1, $2, 'q', 'OK')`, [PILOT, ANA]);
  if (askR.ok && isRls(askForged)) pass('Ask RI log: members log their own queries only');
  else fail(`Ask RI log: own ${JSON.stringify(askR)} forged ${JSON.stringify(askForged)}`);

  const notif = `insert into notification_events (event_type, payload) values ('AI_REVIEW_COMPLETED', jsonb_build_object('organisation_id', $1::text))`;
  const nView = await attempt(adminUrl, VIEW, notif, [PILOT]);
  const nRev = await attempt(adminUrl, REV, notif, [PILOT]);
  if (isRls(nView) && nRev.ok) pass('AI notification events: REVIEWER may emit, VIEWER may not');
  else fail(`AI notification events: viewer ${JSON.stringify(nView)} reviewer ${JSON.stringify(nRev)}`);

  // ---- evidence storage ----
  const objIns = `insert into storage.objects (bucket_id, name) values ('ri-tenant-evidence', $1)`;
  const sView = await attempt(adminUrl, VIEW, objIns, [`${PILOT}/viewer.pdf`]);
  const sAna = await attempt(adminUrl, ANA, objIns, [`${PILOT}/analyst.pdf`]);
  const sCross = await attempt(adminUrl, ANA, objIns, [`${UAT}/cross.pdf`]);
  const sViewDel = await attempt(adminUrl, VIEW, `delete from storage.objects where name = $1`, [`${PILOT}/seed.pdf`]);
  const sViewRead = await attempt(adminUrl, VIEW, `select name from storage.objects where bucket_id = 'ri-tenant-evidence'`);
  if (isRls(sView)) pass('storage: VIEWER cannot upload evidence files');
  else fail(`storage: viewer upload ${JSON.stringify(sView)}`);
  if (sAna.ok) pass('storage: ANALYST can upload evidence files');
  else fail(`storage: analyst upload ${JSON.stringify(sAna)}`);
  if (isRls(sCross)) pass('storage: analyst cannot upload into another organisation\'s folder');
  else fail(`storage: cross-tenant upload ${JSON.stringify(sCross)}`);
  if (sViewDel.ok && sViewDel.rowCount === 0) pass('storage: VIEWER cannot delete evidence files');
  else fail(`storage: viewer delete ${JSON.stringify(sViewDel)}`);
  if (sViewRead.ok && sViewRead.rows.length === 1 && sViewRead.rows[0].name === `${PILOT}/seed.pdf`) pass('storage: VIEWER still reads own-organisation evidence only');
  else fail(`storage: viewer read ${JSON.stringify(sViewRead)}`);

  // ---- AI publication-to-obligation workflow by role (committed, as the app would perform it) ----
  const change = await commitAs(adminUrl, ANA, async (c) => {
    const id = (await c.query(
      `insert into regulatory_changes (organisation_id, publication_id, title, change_type, status, created_by_user_id)
       values ($1, $2, 'UAT change', 'TEST', 'OPEN', $3) returning id`, [PILOT, pubId, ANA])).rows[0].id;
    await c.query(wfInsert, [PILOT, id, 'CHANGE_CREATED', ANA]);
    return id;
  });
  const applicability = await commitAs(adminUrl, ANA, async (c) =>
    (await c.query(`insert into applicability_assessments (organisation_id, publication_id) values ($1, $2) returning id`, [PILOT, pubId])).rows[0].id);
  const appApproved = await attempt(adminUrl, REV, `update applicability_assessments set updated_at = now() where id = $1`, [applicability]);
  if (appApproved.ok && appApproved.rowCount === 0) pass('workflow: REVIEWER cannot decide applicability');
  else fail(`workflow: reviewer applicability ${JSON.stringify(appApproved)}`);
  await commitAs(adminUrl, CMG, (c) => c.query(`update applicability_assessments set updated_at = now() where id = $1`, [applicability]));
  pass('workflow: ANALYST creates change + applicability; Compliance Manager updates applicability');

  const run = await commitAs(adminUrl, ANA, async (c) => {
    const id = (await c.query(
      `insert into ai_analysis_runs (organisation_id, use_case_id, publication_id, publication_version_id, provider, prompt_version, requested_by)
       values ($1, 'UC-RI-005', $2, $3, 'AIPROV-FIXTURE-001', 'v1', $4) returning id`, [PILOT, pubId, verId, ANA])).rows[0].id;
    await c.query(`insert into ai_analysis_citations (organisation_id, analysis_run_id, claim_index, claim_text) values ($1, $2, 0, 'Firms must test.')`, [PILOT, id]);
    await c.query(`update ai_analysis_runs set execution_status = 'COMPLETED' where id = $1`, [id]);
    await c.query(wfInsert, [PILOT, id, 'AI_ANALYSIS_REQUESTED', ANA]);
    return id;
  });
  pass('workflow: ANALYST requests UC-RI-005 run, stores citation, completes run');
  const viewRun = await attempt(adminUrl, VIEW, `insert into ai_analysis_runs (organisation_id, use_case_id, publication_id, publication_version_id, provider, prompt_version, requested_by)
       values ($1, 'UC-RI-005', $2, $3, 'AIPROV-FIXTURE-001', 'v1', $4)`, [PILOT, pubId, verId, VIEW]);
  if (isRls(viewRun)) pass('workflow: VIEWER cannot request an AI analysis');
  else fail(`workflow: viewer run request ${JSON.stringify(viewRun)}`);

  const { review, obligation } = await commitAs(adminUrl, CMG, async (c) => {
    const reviewId = (await c.query(
      `insert into ai_analysis_reviews (organisation_id, analysis_run_id, decision, reviewer_user_id) values ($1, $2, 'ACCEPTED', $3) returning id`,
      [PILOT, run, CMG])).rows[0].id;
    await c.query(`update ai_analysis_runs set review_status = 'ACCEPTED' where id = $1`, [run]);
    await c.query(wfInsert, [PILOT, run, 'AI_REVIEW_ACCEPTED', CMG]);
    const oblId = (await c.query(
      `insert into regulatory_obligations (organisation_id, regulatory_change_id, publication_id, obligation_statement, status, origin, ai_analysis_run_id, ai_analysis_review_id, created_by_user_id)
       values ($1, $2, $3, 'Firms must test.', 'DRAFT', 'AI_ASSISTED', $4, $5, $6) returning id`,
      [PILOT, change, pubId, run, reviewId, CMG])).rows[0].id;
    await c.query(
      `insert into ai_claim_materialisations (organisation_id, analysis_run_id, analysis_review_id, claim_index, entity_type, entity_id)
       values ($1, $2, $3, 0, 'regulatory_obligation', $4)`, [PILOT, run, reviewId, oblId]);
    await c.query(wfInsert, [PILOT, oblId, 'AI_OBLIGATION_MATERIALISED', CMG]);
    await c.query(`update regulatory_obligations set status = 'IN_REVIEW' where id = $1`, [oblId]);
    await c.query(wfInsert, [PILOT, oblId, 'OBLIGATION_STATUS_CHANGED', CMG]);
    return { review: reviewId, obligation: oblId };
  });
  pass('workflow: Compliance Manager accepts, materialises DRAFT AI obligation, submits for review');

  const setStatus = `update regulatory_obligations set status = $2::obligation_status where id = $1`;
  const refusals = [
    ['VIEWER approval matches no rows', VIEW, (r) => r.ok && r.rowCount === 0],
    ['AI requester approval refused', ANA, (r) => !r.ok && /segregation_of_duties/.test(r.message)],
    ['acceptor/submitter approval refused', CMG, (r) => !r.ok && /segregation_of_duties/.test(r.message)],
    ['other-tenant owner approval matches no rows', UAT_OWNER, (r) => r.ok && r.rowCount === 0],
  ];
  for (const [label, user, ok] of refusals) {
    const r = await attempt(adminUrl, user, setStatus, [obligation, 'OPEN']);
    if (ok(r)) pass(`workflow: ${label}`);
    else fail(`workflow: ${label} — got ${JSON.stringify(r)}`);
  }
  const revSmuggle = await attempt(adminUrl, REV,
    `update regulatory_obligations set status = 'OPEN', obligation_statement = 'Edited by reviewer' where id = $1`, [obligation]);
  if (!revSmuggle.ok && /insufficient_role/.test(revSmuggle.message)) pass('workflow: REVIEWER cannot change obligation content alongside the decision');
  else fail(`workflow: reviewer content edit ${JSON.stringify(revSmuggle)}`);
  await commitAs(adminUrl, REV, async (c) => {
    const r = await c.query(setStatus, [obligation, 'OPEN']);
    if (r.rowCount !== 1) throw new Error(`approve rowCount ${r.rowCount}`);
    await c.query(wfInsert, [PILOT, obligation, 'OBLIGATION_STATUS_CHANGED', REV]);
  });
  pass('workflow: independent REVIEWER approves IN_REVIEW → OPEN');

  const revRisk = await attempt(adminUrl, REV, `insert into risks (organisation_id, title) values ($1, 'Reviewer risk')`, [PILOT]);
  const revLink = await attempt(adminUrl, REV, `insert into obligation_risk_links (organisation_id, obligation_id, risk_id) values ($1, $2, $3)`, [PILOT, obligation, pilotSeed.risk]);
  if (isRls(revRisk) && isRls(revLink)) pass('workflow: REVIEWER cannot create risks or mappings');
  else fail(`workflow: reviewer risk ${JSON.stringify(revRisk)} link ${JSON.stringify(revLink)}`);

  const mapped = await commitAs(adminUrl, ANA, async (c) => {
    const riskId = (await c.query(`insert into risks (organisation_id, title) values ($1, 'UAT risk') returning id`, [PILOT])).rows[0].id;
    const controlId = (await c.query(`insert into controls (organisation_id, name) values ($1, 'UAT control') returning id`, [PILOT])).rows[0].id;
    await c.query(`insert into obligation_risk_links (organisation_id, obligation_id, risk_id) values ($1, $2, $3)`, [PILOT, obligation, riskId]);
    await c.query(`insert into obligation_control_links (organisation_id, obligation_id, control_id) values ($1, $2, $3)`, [PILOT, obligation, controlId]);
    await c.query(`insert into risk_control_links (organisation_id, risk_id, control_id) values ($1, $2, $3)`, [PILOT, riskId, controlId]);
    await c.query(wfInsert, [PILOT, obligation, 'RISK_LINKED', ANA]);
    await c.query(wfInsert, [PILOT, obligation, 'CONTROL_LINKED', ANA]);
    return { riskId, controlId };
  });
  const final = (await db.query(
    `select o.status, o.ai_submitted_by_user_id, o.created_by_user_id,
            (select count(*)::int from obligation_risk_links where obligation_id = o.id) risks,
            (select count(*)::int from obligation_control_links where obligation_id = o.id) controls,
            (select count(*)::int from risk_control_links where risk_id = $2 and control_id = $3) rc,
            (select string_agg(event_type || '@' || actor_user_id, ',' order by occurred_at, event_type)
               from workflow_events where entity_id in (o.id, $4, $5)) events
       from regulatory_obligations o where o.id = $1`,
    [obligation, mapped.riskId, mapped.controlId, run, change])).rows[0];
  if (final.status === 'OPEN' && final.ai_submitted_by_user_id === CMG && final.created_by_user_id === CMG
      && final.risks === 1 && final.controls === 1 && final.rc === 1) {
    pass('workflow: obligation OPEN in the existing register with risk/control mapping persisted');
  } else fail(`workflow: final state ${JSON.stringify(final)}`);
  const expectedEvents = ['CHANGE_CREATED@' + ANA, 'AI_ANALYSIS_REQUESTED@' + ANA, 'AI_REVIEW_ACCEPTED@' + CMG,
    'AI_OBLIGATION_MATERIALISED@' + CMG, 'OBLIGATION_STATUS_CHANGED@' + CMG, 'OBLIGATION_STATUS_CHANGED@' + REV,
    'RISK_LINKED@' + ANA, 'CONTROL_LINKED@' + ANA];
  const got = (final.events || '').split(',');
  if (expectedEvents.every((e) => got.includes(e))) pass(`workflow: complete audit trail recorded (${got.length} events, each attributed to its actor)`);
  else fail(`workflow: audit trail ${final.events}`);

  // ---- REVIEWER as the AI acceptor (alternative path) and its limits; rolled back ----
  const run2 = await commitAs(adminUrl, ANA, async (c) => (await c.query(
    `insert into ai_analysis_runs (organisation_id, use_case_id, publication_id, publication_version_id, provider, prompt_version, requested_by)
     values ($1, 'UC-RI-005', $2, $3, 'AIPROV-FIXTURE-001', 'v1', $4) returning id`, [PILOT, pubId, verId, ANA])).rows[0].id);
  const revAccept = await attempt(adminUrl, REV, `with r as (
      insert into ai_analysis_reviews (organisation_id, analysis_run_id, decision, reviewer_user_id) values ($1, $2, 'ACCEPTED', $3) returning id)
    select id from r`, [PILOT, run2, REV]);
  if (revAccept.ok) pass('REVIEWER may record an AI review decision');
  else fail(`REVIEWER review insert ${JSON.stringify(revAccept)}`);
  const revFlow = await withRlsSession(adminUrl, REV, async (c) => {
    const out = {};
    const rid = (await c.query(
      `insert into ai_analysis_reviews (organisation_id, analysis_run_id, decision, reviewer_user_id) values ($1, $2, 'ACCEPTED', $3) returning id`,
      [PILOT, run2, REV])).rows[0].id;
    out.status = (await c.query(`update ai_analysis_runs set review_status = 'ACCEPTED' where id = $1`, [run2])).rowCount;
    await c.query('savepoint s1');
    try {
      await c.query(`update ai_analysis_runs set review_status = 'REJECTED' where id = $1`, [run2]);
      out.mismatch = 'allowed';
    } catch (e) {
      out.mismatch = e.message;
      await c.query('rollback to savepoint s1');
    }
    await c.query('savepoint s2');
    try {
      await c.query(`update ai_analysis_runs set execution_status = 'FAILED' where id = $1`, [run2]);
      out.otherColumn = 'allowed';
    } catch (e) {
      out.otherColumn = e.message;
      await c.query('rollback to savepoint s2');
    }
    const oid = (await c.query(
      `insert into regulatory_obligations (organisation_id, regulatory_change_id, publication_id, obligation_statement, status, origin, ai_analysis_run_id, ai_analysis_review_id, created_by_user_id)
       values ($1, $2, $3, 'Firms must record.', 'DRAFT', 'AI_ASSISTED', $4, $5, $6) returning id`,
      [PILOT, change, pubId, run2, rid, REV])).rows[0].id;
    await c.query(
      `insert into ai_claim_materialisations (organisation_id, analysis_run_id, analysis_review_id, claim_index, entity_type, entity_id)
       values ($1, $2, $3, 0, 'regulatory_obligation', $4)`, [PILOT, run2, rid, oid]);
    await c.query(wfInsert, [PILOT, oid, 'AI_OBLIGATION_MATERIALISED', REV]);
    out.materialised = true;
    await c.query('savepoint s3');
    try {
      await c.query(setStatus, [oid, 'IN_REVIEW']);
      out.submit = 'allowed';
    } catch (e) {
      out.submit = e.message;
      await c.query('rollback to savepoint s3');
    }
    await c.query('savepoint s4');
    try {
      await c.query(`insert into regulatory_obligations (organisation_id, publication_id, obligation_statement, status) values ($1, $2, 'Manual by reviewer', 'DRAFT')`, [PILOT, pubId]);
      out.manual = 'allowed';
    } catch (e) {
      out.manual = e.message;
    }
    return out;
  });
  if (revFlow.status === 1) pass('REVIEWER sets the run review status matching their own review');
  else fail(`REVIEWER review status ${JSON.stringify(revFlow)}`);
  if (/insufficient_role/.test(revFlow.mismatch)) pass('REVIEWER cannot set a review status that differs from their review');
  else fail(`REVIEWER status mismatch ${revFlow.mismatch}`);
  if (/insufficient_role/.test(revFlow.otherColumn)) pass('REVIEWER cannot change other AI run fields');
  else fail(`REVIEWER other run column ${revFlow.otherColumn}`);
  if (revFlow.materialised) pass('REVIEWER may materialise DRAFT AI obligations from their accepted review');
  if (/insufficient_role/.test(revFlow.submit)) pass('REVIEWER cannot submit obligations (DRAFT → IN_REVIEW needs ANALYST)');
  else fail(`REVIEWER submit ${revFlow.submit}`);
  if (/row-level security/.test(revFlow.manual)) pass('REVIEWER cannot create manual obligations');
  else fail(`REVIEWER manual obligation ${revFlow.manual}`);

  // ---- tenant isolation and unchanged manual workflows ----
  const crossUpd = await attempt(adminUrl, UAT_OWNER, `update regulatory_obligations set obligation_statement = 'x' where organisation_id = $1`, [PILOT]);
  const crossIns = await attempt(adminUrl, UAT_OWNER, `insert into risks (organisation_id, title) values ($1, 'cross')`, [PILOT]);
  const crossAdm = await attempt(adminUrl, ADM, `delete from risks where organisation_id = $1`, [UAT]);
  const crossMove = await attempt(adminUrl, ANA, `update risks set organisation_id = $2 where id = $1`, [pilotSeed.risk, UAT]);
  if (crossUpd.ok && crossUpd.rowCount === 0 && isRls(crossIns) && crossAdm.ok && crossAdm.rowCount === 0 && isRls(crossMove)) {
    pass('tenant isolation: no cross-organisation update, insert, delete or move');
  } else fail(`tenant isolation: ${JSON.stringify({ crossUpd, crossIns, crossAdm, crossMove })}`);

  const manual = await attempt(adminUrl, UAT_OWNER, `
    with c as (insert into regulatory_changes (organisation_id, publication_id, title, change_type, status, created_by_user_id)
               values ($1, $2, 'Manual change', 'TEST', 'OPEN', $3) returning id),
         o as (insert into regulatory_obligations (organisation_id, regulatory_change_id, publication_id, obligation_statement, status, created_by_user_id)
               select $1, c.id, $2, 'Manual obligation', 'OPEN', $3 from c returning id)
    select id from o`, [UAT, pubId, UAT_OWNER]);
  const manualEdit = await attempt(adminUrl, ANA, `update regulatory_obligations set obligation_statement = 'Edited', status = 'CLOSED' where id = $1`, [pilotSeed.obligation]);
  const unlink = await attempt(adminUrl, ANA, `delete from obligation_risk_links where obligation_id = $1`, [pilotSeed.obligation]);
  const anaDeleteObl = await attempt(adminUrl, ANA, `delete from regulatory_obligations where id = $1`, [pilotSeed.obligation]);
  const cmAssurance = await attempt(adminUrl, CMG, `insert into assurance_reviews (organisation_id, review_type, result, review_date) values ($1, 'TEST', 'PASS', current_date)`, [PILOT]);
  const anaAssurance = await attempt(adminUrl, ANA, `insert into assurance_reviews (organisation_id, review_type, result, review_date) values ($1, 'TEST', 'PASS', current_date)`, [PILOT]);
  if (manual.ok && manual.rows.length === 1) pass('manual workflow: owner creates manual change + OPEN obligation');
  else fail(`manual create ${JSON.stringify(manual)}`);
  if (manualEdit.ok && manualEdit.rowCount === 1) pass('manual workflow: ANALYST edits and closes a manual obligation');
  else fail(`manual edit ${JSON.stringify(manualEdit)}`);
  if (unlink.ok && unlink.rowCount === 1) pass('manual workflow: ANALYST unlinks obligation risk (app delete path)');
  else fail(`unlink ${JSON.stringify(unlink)}`);
  if (anaDeleteObl.ok && anaDeleteObl.rowCount === 0) pass('ANALYST cannot delete obligations (not an application action)');
  else fail(`analyst obligation delete ${JSON.stringify(anaDeleteObl)}`);
  if (cmAssurance.ok && isRls(anaAssurance)) pass('assurance reviews: Compliance Manager yes, ANALYST no');
  else fail(`assurance ${JSON.stringify({ cmAssurance, anaAssurance })}`);
  const uatUntouched = (await db.query(
    `select count(*)::int n from regulatory_obligations where organisation_id = $1`, [UAT])).rows[0].n;
  if (uatUntouched === 1) pass('Partner UAT unchanged by the AI Development workflow');
  else fail(`Partner UAT obligations ${uatUntouched}`);

  // ---- rollback and re-apply ----
  const beforeDown = await snapshot(db);
  await applySqlFile(db, RLS_DOWN);
  if ((await snapshot(db)) === beforeDown) pass('rollback modifies no table data');
  else fail('rollback changed table data');
  if ((await policySig(db)) === policiesBefore) pass('rollback restores the exact pre-migration policy set (public + storage)');
  else fail('rollback policy set differs from the pre-migration set');
  const truncBack = await db.query(`select has_table_privilege('authenticated', 'public.workflow_events', 'TRUNCATE') t`);
  if (truncBack.rows[0].t) pass('rollback restores TRUNCATE grants');
  else fail('rollback did not restore TRUNCATE grants');
  const viewerAgain = await attempt(adminUrl, VIEW, `insert into risks (organisation_id, title) values ($1, 'viewer risk')`, [PILOT]);
  if (viewerAgain.ok) pass('after rollback the previous (membership-only) behaviour returns');
  else fail(`after rollback viewer insert ${JSON.stringify(viewerAgain)}`);
  await applySqlFile(db, RLS_UP);
  if ((await policySig(db)) === policiesAfter) pass('re-apply after rollback restores the role-aware policy set');
  else fail('re-apply policy set differs');
  if ((await snapshot(db)) === beforeDown) pass('re-apply modifies no table data');
  else fail('re-apply changed table data');
} catch (e) {
  fail(`unexpected error: ${e.stack || e.message}`);
} finally {
  await db.end();
  await stopEmbedded(embedded);
}

console.log(`\nRole-aware RLS local DB acceptance: ${failures ? `FAIL (${failures})` : 'PASS'} — ${passes} passed`);
process.exit(failures ? 1 : 0);
