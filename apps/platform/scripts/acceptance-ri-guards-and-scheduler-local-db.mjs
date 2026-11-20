#!/usr/bin/env node
/**
 * Isolated embedded Postgres (never staging): all migrations, pilot guard triggers, rollback/re-apply,
 * compatibility with pre-existing rows, and hosted-scheduler database behaviour.
 * Requires: npm run sync:reference-catalogue
 */
import pg from 'pg';
import { join } from 'node:path';
import {
  applyAllMigrations,
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
import {
  recoverStaleRunningRuns,
  runSchedulerTick,
  selectDueSources,
} from '../lib/ri/ingestion/ops/scheduler.mjs';
import { tryStartRun } from '../lib/ri/ingestion/ops/executor.mjs';

const PILOT = 'b8f5e3a1-00ad-4000-8000-000000000001';
const UAT = '4d871541-e0d4-4581-828d-72073f763f85';
const ORG_A = 'cd25bb17-d575-4109-8432-4b63c75f9617';
const REQ = 'user_ai_requester';
const ACC = 'user_compliance_manager';
const CHK = 'user_independent_checker';
const SRC = 'SRC-FCA-PUBLICATIONS-RSS';

const migrationsDir = join(platformRoot, 'supabase', 'migrations');
const GUARD_UP = join(migrationsDir, '20261119150000_ri_ai_obligation_pilot_db_guards.sql');
const GUARD_DOWN = join(platformRoot, 'supabase', 'rollbacks', '20261119150000_ri_ai_obligation_pilot_db_guards.down.sql');
const UNAPPLIED = [
  join(migrationsDir, '20261027153000_ri_extraction_revisions_pdf_primary_profile.sql'),
  join(migrationsDir, '20261105230000_impact_assessment_metadata_provenance.sql'),
];

let failures = 0;
const pass = (m) => console.log(`PASS: ${m}`);
const fail = (m) => {
  failures += 1;
  console.error(`FAIL: ${m}`);
};

/** Run fn inside a transaction as a simulated Clerk user (auth-jwt-shim), always rolled back. */
async function asUser(client, sub, fn) {
  await client.query('begin');
  try {
    if (sub) await client.query(`select set_config('app.test_jwt', $1, true)`, [JSON.stringify({ sub })]);
    return await fn();
  } finally {
    await client.query('rollback');
  }
}

async function expectOk(label, client, sub, sql, params) {
  try {
    await asUser(client, sub, () => client.query(sql, params));
    pass(label);
  } catch (e) {
    fail(`${label} — unexpected error ${e.message}`);
  }
}

async function expectError(label, client, sub, sql, params, expected) {
  try {
    await asUser(client, sub, () => client.query(sql, params));
    fail(`${label} — expected ${expected}, got success`);
  } catch (e) {
    if (e.message.startsWith(expected)) pass(label);
    else fail(`${label} — expected ${expected}, got ${e.message}`);
  }
}

async function guardObjects(client) {
  const t = await client.query(`select count(*)::int n from pg_trigger where tgname like 'ri_guard_ai%'`);
  const f = await client.query(
    `select count(*)::int n from pg_proc where proname like 'ri_guard_ai%' or proname = 'ri_ai_pilot_org_id'`,
  );
  return { triggers: t.rows[0].n, functions: f.rows[0].n };
}

const { embedded, adminUrl } = await resetAndStartEmbedded({ port: 54342 });
const db = new pg.Client({ connectionString: adminUrl });
await db.connect();

try {
  await applyAllMigrations(db);
  pass('all migrations apply in order on a clean UTF8 database (incl. guard + 2 staging-unapplied)');
  await ensureAppRole(db);
  await applyReferenceSeed(db);

  let g = await guardObjects(db);
  if (g.triggers === 9 && g.functions === 8) pass('guard migration installs 9 triggers / 8 functions');
  else fail(`guard objects after up: ${JSON.stringify(g)}`);
  const unpinned = await db.query(
    `select proname from pg_proc
      where (proname like 'ri_guard_ai%' or proname = 'ri_ai_pilot_org_id')
        and not coalesce(proconfig, '{}') @> array['search_path=""']`,
  );
  if (unpinned.rows.length === 0) pass('every guard function pins search_path to empty');
  else fail(`guard functions without pinned search_path: ${unpinned.rows.map((r) => r.proname).join(', ')}`);

  // ---- compatibility: rows that exist in staging before the guard is applied ----
  await applySqlFile(db, GUARD_DOWN);
  g = await guardObjects(db);
  if (g.triggers === 0 && g.functions === 0) pass('rollback removes every guard trigger and function');
  else fail(`guard objects after down: ${JSON.stringify(g)}`);

  const pubId = await insertTestPublication(db);
  const ver = await db.query(
    `insert into regulatory_publication_versions (publication_id, version_number, source_hash, canonical_url, retrieved_at)
     values ($1, 1, 'hash-1', 'https://example.test/pub', now()) returning id`,
    [pubId],
  );
  const verId = ver.rows[0].id;
  await db.query(
    `insert into organisations (id, name, slug) values
       ($1, 'AI Development (test)', 'ai-dev-test'),
       ($2, 'Partner UAT (test)', 'partner-uat-test'),
       ($3, 'Org A (test)', 'org-a-test')`,
    [PILOT, UAT, ORG_A],
  );
  for (const [org, user, role] of [
    [PILOT, REQ, 'ANALYST'],
    [PILOT, ACC, 'COMPLIANCE_MANAGER'],
    [PILOT, CHK, 'REVIEWER'],
    [UAT, 'user_uat', 'OWNER'],
    [ORG_A, 'user_org_a', 'OWNER'],
  ]) {
    await db.query(
      `insert into organisation_memberships (organisation_id, clerk_user_id, role, status) values ($1, $2, $3::platform_role, 'active')`,
      [org, user, role],
    );
  }

  const newRun = async (org, useCase, requestedBy = REQ) =>
    (
      await db.query(
        `insert into ai_analysis_runs (organisation_id, use_case_id, publication_id, publication_version_id, provider, prompt_version, requested_by)
         values ($1, $2, $3, $4, 'AIPROV-FIXTURE-001', 'v1', $5) returning id`,
        [org, useCase, pubId, verId, requestedBy],
      )
    ).rows[0].id;

  // Legacy rows like staging's Org A history (UC-RI-002/005 runs, AI_ASSISTED change) — inserted pre-guard.
  const legacyRun = await newRun(ORG_A, 'UC-RI-005', 'user_org_a');
  const legacyReview = (
    await db.query(
      `insert into ai_analysis_reviews (organisation_id, analysis_run_id, decision, reviewer_user_id)
       values ($1, $2, 'ACCEPTED', 'user_org_a') returning id`,
      [ORG_A, legacyRun],
    )
  ).rows[0].id;
  const legacyChange = (
    await db.query(
      `insert into regulatory_changes (organisation_id, publication_id, title, change_type, status, origin, ai_analysis_review_id)
       values ($1, $2, 'Legacy AI change', 'TEST', 'DRAFT', 'AI_ASSISTED', $3) returning id`,
      [ORG_A, pubId, legacyReview],
    )
  ).rows[0].id;

  await applySqlFile(db, GUARD_UP);
  pass('guard migration applies over pre-existing cross-org AI rows (insert-only triggers; no backfill/validation)');
  await applySqlFile(db, GUARD_UP);
  pass('guard migration is idempotent (re-apply succeeds)');

  await expectOk('legacy Org A AI change: non-status update still allowed', db, 'user_org_a',
    `update regulatory_changes set title = 'Legacy AI change (edited)' where id = $1`, [legacyChange]);

  for (const f of UNAPPLIED) await applySqlFile(db, f);
  pass('the 2 staging-unapplied migrations are idempotent on a schema that already has them');
  const meta = await db.query(
    `select count(*)::int n from information_schema.columns where table_name = 'impact_assessments' and column_name = 'metadata'`,
  );
  if (meta.rows[0].n === 1) pass('impact_assessments.metadata present (matches staging)');
  else fail('impact_assessments.metadata missing');

  // ---- run insert guard ----
  const runInsert = `insert into ai_analysis_runs (organisation_id, use_case_id, publication_id, publication_version_id, provider, prompt_version, requested_by)
                     values ($1, $2, $3, $4, 'AIPROV-FIXTURE-001', 'v1', $5)`;
  await expectError('UC-RI-005 run for Partner UAT blocked at DB', db, 'user_uat', runInsert, [UAT, 'UC-RI-005', pubId, verId, 'user_uat'], 'experimental_ai_wrong_organisation');
  await expectError('UC-RI-002 run for Org A blocked at DB', db, 'user_org_a', runInsert, [ORG_A, 'UC-RI-002', pubId, verId, 'user_org_a'], 'experimental_ai_wrong_organisation');
  await expectOk('UC-RI-005 run for AI Development allowed', db, REQ, runInsert, [PILOT, 'UC-RI-005', pubId, verId, REQ]);
  await expectOk('UC-RI-001 (non-materialising) run for Partner UAT unaffected', db, 'user_uat', runInsert, [UAT, 'UC-RI-001', pubId, verId, 'user_uat']);

  // ---- review SoD ----
  const run005 = await newRun(PILOT, 'UC-RI-005');
  const reviewInsert = `insert into ai_analysis_reviews (organisation_id, analysis_run_id, decision, reviewer_user_id) values ($1, $2, $3::ai_review_status, $4)`;
  await expectError('requester cannot ACCEPT own AI run', db, REQ, reviewInsert, [PILOT, run005, 'ACCEPTED', REQ], 'segregation_of_duties');
  await expectError('requester cannot PARTIALLY_ACCEPT own AI run', db, REQ, reviewInsert, [PILOT, run005, 'PARTIALLY_ACCEPTED', REQ], 'segregation_of_duties');
  await expectOk('requester may REJECT own AI run', db, REQ, reviewInsert, [PILOT, run005, 'REJECTED', REQ]);
  await expectError('review referencing a run in another organisation blocked', db, ACC, reviewInsert, [PILOT, legacyRun, 'ACCEPTED', ACC], 'ai_review_run_not_found');
  const review = (
    await db.query(
      `insert into ai_analysis_reviews (organisation_id, analysis_run_id, decision, reviewer_user_id) values ($1, $2, 'ACCEPTED', $3) returning id`,
      [PILOT, run005, ACC],
    )
  ).rows[0].id;
  pass('independent Compliance Manager may ACCEPT');

  // ---- AI-assisted record inserts ----
  const changeInsert = `insert into regulatory_changes (organisation_id, publication_id, title, change_type, status, origin, ai_analysis_review_id)
                        values ($1, $2, 'AI change', 'TEST', 'DRAFT', $3, $4)`;
  await expectError('AI_ASSISTED change in Partner UAT blocked', db, 'user_uat', changeInsert, [UAT, pubId, 'AI_ASSISTED', review], 'experimental_ai_wrong_organisation');
  await expectError('AI_ASSISTED change without review blocked', db, ACC, changeInsert, [PILOT, pubId, 'AI_ASSISTED', null], 'ai_assisted_record_requires_review');
  await expectOk('MANUAL change in Partner UAT unaffected', db, 'user_uat', changeInsert, [UAT, pubId, 'MANUAL', null]);
  const change = (
    await db.query(
      `insert into regulatory_changes (organisation_id, publication_id, title, change_type, status, origin, ai_analysis_review_id)
       values ($1, $2, 'AI change', 'TEST', 'DRAFT', 'AI_ASSISTED', $3) returning id`,
      [PILOT, pubId, review],
    )
  ).rows[0].id;

  const oblInsert = `insert into regulatory_obligations (organisation_id, regulatory_change_id, publication_id, obligation_statement, status, origin, ai_analysis_run_id, ai_analysis_review_id, created_by_user_id)
                     values ($1, $2, $3, 'Firms must test.', 'DRAFT', $4, $5, $6, $7)`;
  await expectError('AI_ASSISTED obligation in Org A blocked', db, 'user_org_a', oblInsert, [ORG_A, legacyChange, pubId, 'AI_ASSISTED', legacyRun, legacyReview, 'user_org_a'], 'experimental_ai_wrong_organisation');
  await expectError('AI_ASSISTED obligation without review blocked', db, ACC, oblInsert, [PILOT, change, pubId, 'AI_ASSISTED', run005, null, ACC], 'ai_assisted_record_requires_review');

  const obl = (
    await db.query(
      `insert into regulatory_obligations (organisation_id, regulatory_change_id, publication_id, obligation_statement, status, origin, ai_analysis_run_id, ai_analysis_review_id, created_by_user_id)
       values ($1, $2, $3, 'Firms must test.', 'DRAFT', 'AI_ASSISTED', $4, $5, $6) returning id`,
      [PILOT, change, pubId, run005, review, ACC],
    )
  ).rows[0].id;
  pass('AI_ASSISTED DRAFT obligation materialises in AI Development with review lineage');

  // ---- AI obligation status workflow ----
  const setStatus = `update regulatory_obligations set status = $2::obligation_status where id = $1`;
  await expectError('AI DRAFT → OPEN directly blocked', db, CHK, setStatus, [obl, 'OPEN'], 'ai_obligation_invalid_transition');
  await expectError('AI DRAFT → COMPLETE blocked', db, CHK, setStatus, [obl, 'COMPLETE'], 'ai_obligation_invalid_transition');
  await db.query('begin');
  await db.query(`select set_config('app.test_jwt', $1, true)`, [JSON.stringify({ sub: ACC })]);
  await db.query(setStatus, [obl, 'IN_REVIEW']);
  await db.query('commit');
  pass('AI DRAFT → IN_REVIEW by Compliance Manager');
  await expectError('IN_REVIEW → OPEN by acceptor blocked (maker-checker)', db, ACC, setStatus, [obl, 'OPEN'], 'segregation_of_duties');
  await expectError('IN_REVIEW → OPEN by AI requester blocked', db, REQ, setStatus, [obl, 'OPEN'], 'segregation_of_duties');
  await expectError('IN_REVIEW → OPEN with no user identity blocked', db, null, setStatus, [obl, 'OPEN'], 'ai_obligation_approval_requires_user');
  await expectOk('IN_REVIEW → OPEN by independent checker allowed', db, CHK, setStatus, [obl, 'OPEN']);
  await expectOk('IN_REVIEW → DRAFT (return) allowed', db, ACC, setStatus, [obl, 'DRAFT']);

  const manualObl = (
    await db.query(
      `insert into regulatory_obligations (organisation_id, publication_id, obligation_statement, status) values ($1, $2, 'Manual', 'DRAFT') returning id`,
      [UAT, pubId],
    )
  ).rows[0].id;
  await expectOk('MANUAL obligation DRAFT → OPEN unaffected (Partner UAT unchanged)', db, 'user_uat', setStatus, [manualObl, 'OPEN']);

  // ---- direct Supabase API access: non-superuser role under RLS with the caller's Clerk identity ----
  const CHK2 = 'user_second_checker';
  const VIEWER = 'user_pilot_viewer';
  for (const [user, role] of [[CHK2, 'REVIEWER'], [VIEWER, 'VIEWER']]) {
    await db.query(
      `insert into organisation_memberships (organisation_id, clerk_user_id, role, status) values ($1, $2, $3::platform_role, 'active')`,
      [PILOT, user, role],
    );
  }
  const rejected = (
    await db.query(
      `insert into ai_analysis_reviews (organisation_id, analysis_run_id, decision, reviewer_user_id) values ($1, $2, 'REJECTED', $3) returning id`,
      [PILOT, run005, ACC],
    )
  ).rows[0].id;
  const otherRun = await newRun(PILOT, 'UC-RI-005');
  const newAiObligation = async () =>
    (
      await db.query(
        `insert into regulatory_obligations (organisation_id, regulatory_change_id, publication_id, obligation_statement, status, origin, ai_analysis_run_id, ai_analysis_review_id, created_by_user_id)
         values ($1, $2, $3, 'Firms must test.', 'DRAFT', 'AI_ASSISTED', $4, $5, $6) returning id`,
        [PILOT, change, pubId, run005, review, ACC],
      )
    ).rows[0].id;

  async function rls(label, sub, fn, expected) {
    try {
      const out = await withRlsSession(adminUrl, sub, fn);
      if (expected) fail(`${label} — expected ${expected}, got success`);
      else pass(label);
      return out;
    } catch (e) {
      if (expected && e.message.startsWith(expected)) pass(label);
      else fail(`${label} — ${expected ? `expected ${expected}, got` : 'unexpected error'} ${e.message}`);
      return null;
    }
  }
  const upd = (c, sql, params) => c.query(sql, params);

  const oblApi = await newAiObligation();
  await rls('API: submitter cannot then approve (submitter recorded on row)', CHK, async (c) => {
    await upd(c, setStatus, [oblApi, 'IN_REVIEW']);
    await upd(c, setStatus, [oblApi, 'OPEN']);
  }, 'segregation_of_duties');
  await rls('API: submitter cannot overwrite the recorded submitter before approving', CHK, async (c) => {
    await upd(c, setStatus, [oblApi, 'IN_REVIEW']);
    await upd(c, `update regulatory_obligations set ai_submitted_by_user_id = 'user_someone_else' where id = $1`, [oblApi]);
    await upd(c, setStatus, [oblApi, 'OPEN']);
  }, 'segregation_of_duties');
  await rls('API: deleting the submission workflow event does not hide the submitter', CHK, async (c) => {
    await upd(c, setStatus, [oblApi, 'IN_REVIEW']);
    await upd(c, `delete from workflow_events where entity_id = $1`, [oblApi]);
    await upd(c, setStatus, [oblApi, 'OPEN']);
  }, 'segregation_of_duties');
  const preset = await rls('API: client-supplied submitter is replaced by the caller', CHK, async (c) => {
    await upd(c, `update regulatory_obligations set status = 'IN_REVIEW', ai_submitted_by_user_id = 'user_forged' where id = $1`, [oblApi]);
    return (await c.query(`select ai_submitted_by_user_id from regulatory_obligations where id = $1`, [oblApi])).rows[0];
  });
  if (preset?.ai_submitted_by_user_id === CHK) pass('API: recorded submitter is the authenticated caller');
  else fail(`API: recorded submitter ${JSON.stringify(preset)}`);
  await rls('API: relabelling an AI obligation MANUAL is blocked', CHK, (c) =>
    upd(c, `update regulatory_obligations set origin = 'MANUAL' where id = $1`, [oblApi]), 'ai_assisted_provenance_immutable');
  await rls('API: rewriting created_by_user_id (acceptor) is blocked', ACC, (c) =>
    upd(c, `update regulatory_obligations set created_by_user_id = 'user_other' where id = $1`, [oblApi]), 'ai_assisted_provenance_immutable');
  await rls('API: swapping the AI run reference is blocked', ACC, (c) =>
    upd(c, `update regulatory_obligations set ai_analysis_run_id = $2 where id = $1`, [oblApi, otherRun]), 'ai_assisted_provenance_immutable');
  await rls('API: moving an AI obligation to another organisation is blocked', ACC, (c) =>
    upd(c, `update regulatory_obligations set organisation_id = $2 where id = $1`, [oblApi, UAT]), 'ai_assisted_provenance_immutable');
  await rls('API: relabelling a MANUAL obligation AI_ASSISTED is blocked', 'user_uat', (c) =>
    upd(c, `update regulatory_obligations set origin = 'AI_ASSISTED' where id = $1`, [manualObl]), 'ai_assisted_provenance_immutable');

  const apiObl = `insert into regulatory_obligations (organisation_id, regulatory_change_id, publication_id, obligation_statement, status, origin, ai_analysis_run_id, ai_analysis_review_id, created_by_user_id)
                  values ($1, $2, $3, 'Firms must test.', $4::obligation_status, 'AI_ASSISTED', $5, $6, $7)`;
  await rls('API: AI obligation cannot be inserted already OPEN', ACC, (c) =>
    upd(c, apiObl, [PILOT, change, pubId, 'OPEN', run005, review, ACC]), 'ai_obligation_must_start_draft');
  await rls('API: AI obligation creator must be the caller', REQ, (c) =>
    upd(c, apiObl, [PILOT, change, pubId, 'DRAFT', run005, review, ACC]), 'ai_assisted_record_creator_mismatch');
  await rls('API: AI obligation backed by a REJECTED review is blocked', ACC, (c) =>
    upd(c, apiObl, [PILOT, change, pubId, 'DRAFT', run005, rejected, ACC]), 'ai_assisted_record_review_not_accepted');
  await rls('API: AI obligation whose run differs from the review run is blocked', ACC, (c) =>
    upd(c, apiObl, [PILOT, change, pubId, 'DRAFT', otherRun, review, ACC]), 'ai_assisted_record_run_mismatch');
  await rls('API: AI obligation with the caller as creator materialises as DRAFT', ACC, (c) =>
    upd(c, apiObl, [PILOT, change, pubId, 'DRAFT', run005, review, ACC]));

  await rls('API: requester cannot accept own run by naming another reviewer', REQ, (c) =>
    upd(c, `insert into ai_analysis_reviews (organisation_id, analysis_run_id, decision, reviewer_user_id) values ($1, $2, 'ACCEPTED', $3)`, [PILOT, otherRun, ACC]),
    'ai_review_reviewer_mismatch');
  await rls('API: UC-RI-005 run cannot be requested in another user\'s name', ACC, (c) =>
    upd(c, runInsert, [PILOT, 'UC-RI-005', pubId, verId, REQ]), 'ai_run_requester_mismatch');
  await rls('API: run requester cannot be rewritten after the fact', REQ, (c) =>
    upd(c, `update ai_analysis_runs set requested_by = 'user_other' where id = $1`, [otherRun]), 'ai_run_provenance_immutable');
  await rls('API: run status updates (app path) still allowed', REQ, (c) =>
    upd(c, `update ai_analysis_runs set execution_status = 'FAILED' where id = $1`, [otherRun]));
  await rls('API: review decision cannot be changed after the fact', ACC, (c) =>
    upd(c, `update ai_analysis_reviews set decision = 'ACCEPTED' where id = $1`, [rejected]), 'ai_review_immutable');

  const oblSubmitted = await newAiObligation();
  await withRlsSessionCommit(adminUrl, ACC, (c) => c.query(setStatus, [oblSubmitted, 'IN_REVIEW']));
  pass('API: acceptor submits AI obligation (DRAFT → IN_REVIEW, committed)');
  await rls('API: VIEWER cannot approve', VIEWER, (c) => upd(c, setStatus, [oblSubmitted, 'OPEN']), 'ai_obligation_review_role_required');
  await rls('API: acceptor/submitter cannot approve', ACC, (c) => upd(c, setStatus, [oblSubmitted, 'OPEN']), 'segregation_of_duties');
  const crossTenant = await rls('API: Org A user cannot see or approve an AI Development obligation', 'user_org_a', (c) =>
    upd(c, setStatus, [oblSubmitted, 'OPEN']));
  if (crossTenant?.rowCount === 0) pass('API: cross-tenant approval matched no rows (RLS)');
  else fail(`API: cross-tenant update rowCount ${crossTenant?.rowCount}`);
  const approved = await rls('API: independent REVIEWER approves', CHK2, async (c) => {
    await upd(c, setStatus, [oblSubmitted, 'OPEN']);
    return (await c.query(`select status, ai_submitted_by_user_id from regulatory_obligations where id = $1`, [oblSubmitted])).rows[0];
  });
  if (approved?.status === 'OPEN' && approved.ai_submitted_by_user_id === ACC) pass('API: approved row is OPEN and keeps the submitter');
  else fail(`API: approved row ${JSON.stringify(approved)}`);

  await rls('API: manual obligation edit + status change unaffected', 'user_uat', async (c) => {
    await upd(c, `update regulatory_obligations set obligation_statement = 'Manual (edited)', status = 'CLOSED' where id = $1`, [manualObl]);
  });
  await rls('API: manual obligation may be created OPEN (manual workflow unchanged)', 'user_uat', (c) =>
    upd(c, `insert into regulatory_obligations (organisation_id, publication_id, obligation_statement, status, created_by_user_id) values ($1, $2, 'Manual open', 'OPEN', 'user_uat')`, [UAT, pubId]));
  const manualChange = (
    await db.query(
      `insert into regulatory_changes (organisation_id, publication_id, title, change_type, status, origin) values ($1, $2, 'Manual change', 'TEST', 'DRAFT', 'MANUAL') returning id`,
      [UAT, pubId],
    )
  ).rows[0].id;
  const manualEdit = await rls('API: manual change edit unaffected', 'user_uat', (c) =>
    upd(c, `update regulatory_changes set title = 'Manual change (edited)' where id = $1`, [manualChange]));
  if (manualEdit?.rowCount === 1) pass('API: manual change edit applied to one row');
  else fail(`API: manual change edit rowCount ${manualEdit?.rowCount}`);

  const regs = await db.query(`select count(*)::int n from information_schema.tables where table_schema = 'public' and table_name like '%obligation%register%'`);
  if (regs.rows[0].n === 0) pass('no second obligations register table exists');
  else fail('unexpected obligations register table');

  // ---- scheduler database behaviour ----
  const src = await db.query(`select id from regulatory_sources where external_key = $1`, [SRC]);
  const sourceUuid = src.rows[0].id;
  await db.query(`update regulatory_sources set ingestion_mode = 'ENABLED'::source_ingestion_mode where id = $1`, [sourceUuid]);
  await db.query(
    `insert into regulatory_source_operations (source_id, enabled, ingestion_mode) values ($1, true, 'ENABLED'::source_ingestion_mode)
     on conflict (source_id) do update set enabled = true, ingestion_mode = 'ENABLED'::source_ingestion_mode, next_run_at = null`,
    [sourceUuid],
  );

  const runCols = `(source_id, run_type, status, trigger_type, attempt_number, queued_at, started_at, initiated_by, environment)`;
  await db.query(
    `insert into ingestion_runs ${runCols} values ($1, 'SCHEDULED', 'RUNNING', 'SCHEDULED', 1, now(), now(), 'test', 'local')`,
    [sourceUuid],
  );
  try {
    await db.query(
      `insert into ingestion_runs ${runCols} values ($1, 'SCHEDULED', 'RUNNING', 'SCHEDULED', 1, now(), now(), 'test', 'local')`,
      [sourceUuid],
    );
    fail('second concurrent RUNNING run accepted');
  } catch (e) {
    if (e.code === '23505') pass('database refuses a second concurrent RUNNING run per source');
    else fail(`unexpected error ${e.message}`);
  }
  const lock = await tryStartRun(db, {
    sourceUuid,
    triggerType: 'SCHEDULED',
    runType: 'SCHEDULED',
    attemptNumber: 1,
    initiatedBy: 'test',
    environment: 'local',
  });
  if (!lock.started && lock.reason === 'ALREADY_RUNNING') pass('executor records SKIPPED/ALREADY_RUNNING when a run is in progress');
  else fail(`tryStartRun: ${JSON.stringify(lock)}`);

  if ((await recoverStaleRunningRuns(db)) === 0) pass('a fresh RUNNING run is not treated as stale');
  else fail('fresh RUNNING run was recovered');
  await db.query(`update ingestion_runs set started_at = now() - interval '2 hours' where status = 'RUNNING' and source_id = $1`, [sourceUuid]);
  const recovered = await recoverStaleRunningRuns(db);
  const stuck = await db.query(`select count(*)::int n from ingestion_runs where status = 'RUNNING' and source_id = $1`, [sourceUuid]);
  const audit = await db.query(`select count(*)::int n from ingestion_operational_events where event_type = 'SCHEDULER_STALE_RUNS_RECOVERED'`);
  if (recovered === 1 && stuck.rows[0].n === 0 && audit.rows[0].n === 1) {
    pass('killed (>30 min) RUNNING run recovered as FAILED with audit event');
  } else fail(`stale recovery: recovered=${recovered} stuck=${stuck.rows[0].n} audit=${audit.rows[0].n}`);

  await db.query('begin transaction read only');
  const due = await selectDueSources(db, { maxSourcesPerTick: 50 });
  let readOnlyWriteBlocked = false;
  try {
    await db.query(`insert into ingestion_operational_events (event_type, actor_user_id) values ('X', 'x')`);
  } catch {
    readOnlyWriteBlocked = true;
  }
  await db.query('rollback');
  if (due.some((r) => r.external_key === SRC) && readOnlyWriteBlocked) {
    pass('dry-run due-source query works inside a READ ONLY transaction, which rejects writes');
  } else fail(`dry-run: due=${due.length} writeBlocked=${readOnlyWriteBlocked}`);

  const tick = await runSchedulerTick(db, {
    environment: 'local',
    liveAllowed: false,
    maxSourcesPerTick: 50,
    allowSource: (k) => k === SRC,
    simulateErrorBySource: { [SRC]: 'HTTP 503 simulated' },
  });
  const outcome = tick.outcomes.find((o) => o.source === SRC);
  const failedRun = await db.query(
    `select status, error_summary, failure_class, next_retry_at is not null as retry from ingestion_runs where id = $1`,
    [outcome?.runId],
  );
  const op = await db.query(`select consecutive_failures, next_run_at is not null as scheduled from regulatory_source_operations where source_id = $1`, [sourceUuid]);
  const alert = await db.query(`select count(*)::int n from operational_alerts where source_id = $1 and category = 'INGESTION_FAILURE'`, [sourceUuid]);
  const fr = failedRun.rows[0];
  if (fr?.status === 'FAILED' && fr.failure_class === 'SERVER_ERROR' && fr.retry && op.rows[0].consecutive_failures === 1 && op.rows[0].scheduled && alert.rows[0].n === 1) {
    pass('failed scheduled run is logged (FAILED run, failure class, retry, consecutive_failures, alert, next_run_at)');
  } else fail(`failure logging: ${JSON.stringify({ fr, op: op.rows[0], alerts: alert.rows[0].n })}`);
  const skippedNonAllowlisted = tick.outcomes.filter((o) => o.errorSummary === 'hosted_scheduler_source_not_allowlisted').length;
  if (tick.outcomes.length === 1 + skippedNonAllowlisted) pass('allowSource filter: only allowlisted sources executed');
  else fail(`unexpected outcomes ${JSON.stringify(tick.outcomes)}`);

  // ---- final rollback check ----
  const aiRowsBefore = (await db.query(`select count(*)::int n from regulatory_obligations where origin = 'AI_ASSISTED'`)).rows[0].n;
  await applySqlFile(db, GUARD_DOWN);
  g = await guardObjects(db);
  const rows = await db.query(`select count(*)::int n from regulatory_obligations where origin = 'AI_ASSISTED'`);
  const col = await db.query(
    `select count(*)::int n from information_schema.columns where table_name = 'regulatory_obligations' and column_name = 'ai_submitted_by_user_id'`,
  );
  if (g.triggers === 0 && g.functions === 0 && col.rows[0].n === 0 && aiRowsBefore === 3 && rows.rows[0].n === aiRowsBefore) {
    pass('rollback after use: guard objects and submitter column removed, obligation rows untouched');
  } else fail(`final rollback: ${JSON.stringify(g)} column=${col.rows[0].n} rows ${aiRowsBefore} → ${rows.rows[0].n}`);
} catch (e) {
  fail(`unhandled: ${e.stack || e.message}`);
} finally {
  await db.end().catch(() => {});
  await stopEmbedded(embedded);
}

if (failures) {
  console.error(`\nguards + scheduler (local DB): ${failures} FAILED`);
  process.exit(1);
}
console.log('\nguards + scheduler (local DB): ALL PASS');
