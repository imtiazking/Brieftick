#!/usr/bin/env node
/**
 * Isolated embedded Postgres (never staging): migration 20261121010000.
 * AI analysis runs cannot be deleted (no delete policy, delete-refusing trigger), at most one RUNNING
 * UC-RI-005 run per organisation, one run per idempotency key, existing data preserved.
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
} from './local-db/harness.mjs';

const PILOT = 'b8f5e3a1-00ad-4000-8000-000000000001';
const CMG = 'user_compliance_manager';
const ANA = 'user_analyst';
const MIGRATION = '20261121010000_ai_runs_retention_and_single_running.sql';
const migrationsDir = join(platformRoot, 'supabase', 'migrations');

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

async function attempt(adminUrl, sub, sql, params = []) {
  try {
    const res = await withRlsSession(adminUrl, sub, (c) => c.query(sql, params));
    return { ok: true, rowCount: res.rowCount, rows: res.rows };
  } catch (e) {
    return { ok: false, code: e.code, message: e.message, constraint: e.constraint };
  }
}

const { embedded, adminUrl } = await resetAndStartEmbedded({ port: 54351 });
const db = new pg.Client({ connectionString: adminUrl });
await db.connect();

try {
  await applySqlFile(db, join(platformRoot, 'scripts', 'local-db', 'auth-jwt-shim.sql'));
  await db.query(`
    do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
    do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
    create schema if not exists storage;
    create table if not exists storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table if not exists storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
    alter table storage.objects enable row level security;
  `);
  const files = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql') && f < MIGRATION).sort();
  for (const f of files) await applySqlFile(db, join(migrationsDir, f));
  await ensureAppRole(db);
  await db.query(`grant all on all tables in schema public to anon, authenticated; grant authenticated to forgeniq_app;`);
  await applyReferenceSeed(db);

  const pubId = await insertTestPublication(db);
  const verId = (
    await db.query(
      `insert into regulatory_publication_versions (publication_id, version_number, source_hash, canonical_url, retrieved_at)
       values ($1, 1, 'hash-1', 'https://example.test/pub', now()) returning id`,
      [pubId],
    )
  ).rows[0].id;
  await db.query(`insert into organisations (id, name, slug) values ($1, 'AI Development (test)', 'ai-dev-test')`, [PILOT]);
  for (const [user, role] of [[CMG, 'COMPLIANCE_MANAGER'], [ANA, 'ANALYST']]) {
    await db.query(
      `insert into organisation_memberships (organisation_id, clerk_user_id, role, status) values ($1, $2, $3::platform_role, 'active')`,
      [PILOT, user, role],
    );
  }
  const insertRun = (status, key, useCase = 'UC-RI-005', requestedBy = CMG) =>
    db.query(
      `insert into ai_analysis_runs (organisation_id, use_case_id, publication_id, publication_version_id, provider, prompt_version, requested_by, execution_status, idempotency_key)
       values ($1, $2, $3, $4, 'ANTHROPIC', 'v1', $5, $6, $7) returning id`,
      [PILOT, useCase, pubId, verId, requestedBy, status, key],
    );
  const failedRun = (await insertRun('FAILED', `UC-RI-005:${verId}:${PILOT}:uat-old`)).rows[0].id;
  const completedRun = (await insertRun('COMPLETED', `UC-RI-005:${verId}:${PILOT}:uat-done`)).rows[0].id;
  // Pre-existing state the migration must tolerate: one RUNNING UC-RI-005 run.
  const runningRun = (await insertRun('RUNNING', `UC-RI-005:${verId}:${PILOT}:uat-running`)).rows[0].id;

  const countSql = `select count(*)::int n, md5(string_agg(t::text, '|' order by id)) h from ai_analysis_runs t`;
  const before = (await db.query(countSql)).rows[0];
  await applySqlFile(db, join(migrationsDir, MIGRATION));
  const after = (await db.query(countSql)).rows[0];
  if (before.n === after.n && before.h === after.h) pass(`migration applies over existing runs without modifying them (${after.n} rows)`);
  else fail('migration changed existing runs');

  const policies = (await db.query(`select polname from pg_policy where polrelid = 'public.ai_analysis_runs'::regclass and polcmd = 'd'`)).rows;
  if (!policies.length) pass('no delete policy remains on ai_analysis_runs');
  else fail(`delete policies remain: ${policies.map((p) => p.polname).join(', ')}`);

  for (const user of [CMG, ANA]) {
    const del = await attempt(adminUrl, user, `delete from ai_analysis_runs where id = $1`, [failedRun]);
    if (del.ok && del.rowCount === 0) pass(`${user} cannot delete a FAILED run (RLS: 0 rows)`);
    else fail(`${user} delete ${JSON.stringify(del)}`);
  }
  try {
    await db.query(`delete from ai_analysis_runs where id = $1`, [failedRun]);
    fail('privileged delete of a FAILED run succeeded');
  } catch (e) {
    if (/retained for audit/.test(e.message)) pass('privileged (service-level) delete refused by trigger');
    else fail(`privileged delete error: ${e.message}`);
  }
  const stillThere = (await db.query(`select count(*)::int n from ai_analysis_runs where id in ($1, $2)`, [failedRun, completedRun])).rows[0].n;
  if (stillThere === 2) pass('FAILED and COMPLETED runs retained');
  else fail(`retained ${stillThere}/2`);

  const dupKey = await attempt(
    adminUrl,
    CMG,
    `insert into ai_analysis_runs (organisation_id, use_case_id, publication_id, publication_version_id, provider, prompt_version, requested_by, execution_status, idempotency_key)
     values ($1, 'UC-RI-005', $2, $3, 'ANTHROPIC', 'v1', $4, 'RUNNING', $5)`,
    [PILOT, pubId, verId, CMG, `UC-RI-005:${verId}:${PILOT}:uat-old`],
  );
  if (!dupKey.ok && dupKey.code === '23505' && dupKey.constraint === 'ai_analysis_runs_idempotency') {
    pass('same idempotency key as a FAILED run refused (unique, 23505)');
  } else fail(`duplicate key ${JSON.stringify(dupKey)}`);

  const secondRunning = await attempt(
    adminUrl,
    CMG,
    `insert into ai_analysis_runs (organisation_id, use_case_id, publication_id, publication_version_id, provider, prompt_version, requested_by, execution_status, idempotency_key)
     values ($1, 'UC-RI-005', $2, $3, 'ANTHROPIC', 'v1', $4, 'RUNNING', $5)`,
    [PILOT, pubId, verId, CMG, `UC-RI-005:${verId}:${PILOT}:uat-new`],
  );
  if (!secondRunning.ok && secondRunning.code === '23505' && secondRunning.constraint === 'ai_analysis_runs_uc_ri_005_one_running') {
    pass('second concurrent RUNNING UC-RI-005 run (different key) refused by the database');
  } else fail(`second running ${JSON.stringify(secondRunning)}`);

  // Concurrent inserts from two sessions: exactly one wins.
  await db.query(`update ai_analysis_runs set execution_status = 'FAILED' where id = $1`, [runningRun]);
  const raceKeyA = `UC-RI-005:${verId}:${PILOT}:race-a`;
  const raceKeyB = `UC-RI-005:${verId}:${PILOT}:race-b`;
  const racers = [raceKeyA, raceKeyB, raceKeyA].map(async (key) => {
    const c = new pg.Client({ connectionString: adminUrl });
    await c.connect();
    try {
      await c.query(
        `insert into ai_analysis_runs (organisation_id, use_case_id, publication_id, publication_version_id, provider, prompt_version, requested_by, execution_status, idempotency_key)
         values ($1, 'UC-RI-005', $2, $3, 'ANTHROPIC', 'v1', $4, 'RUNNING', $5)`,
        [PILOT, pubId, verId, CMG, key],
      );
      return 'inserted';
    } catch (e) {
      return e.code;
    } finally {
      await c.end();
    }
  });
  const outcomes = await Promise.all(racers);
  const inserted = outcomes.filter((o) => o === 'inserted').length;
  if (inserted === 1 && outcomes.filter((o) => o === '23505').length === 2) {
    pass(`three concurrent RUNNING inserts (two keys): exactly one created (${outcomes.join(', ')})`);
  } else fail(`race outcomes ${outcomes.join(', ')}`);

  const otherUseCase = await attempt(
    adminUrl,
    CMG,
    `insert into ai_analysis_runs (organisation_id, use_case_id, publication_id, publication_version_id, provider, prompt_version, requested_by, execution_status, idempotency_key)
     values ($1, 'UC-RI-001', $2, $3, 'ANTHROPIC', 'v1', $4, 'RUNNING', 'uc1-a'), ($1, 'UC-RI-001', $2, $3, 'ANTHROPIC', 'v1', $4, 'RUNNING', 'uc1-b')`,
    [PILOT, pubId, verId, CMG],
  );
  if (otherUseCase.ok) pass('other use cases are not limited to one RUNNING run');
  else fail(`other use case ${JSON.stringify(otherUseCase)}`);

  const beforeDown = (await db.query(countSql)).rows[0];
  await applySqlFile(db, join(platformRoot, 'supabase', 'rollbacks', MIGRATION.replace('.sql', '.down.sql')));
  const afterDown = (await db.query(countSql)).rows[0];
  const downState = (
    await db.query(`select
      (select count(*)::int from pg_policy where polrelid = 'public.ai_analysis_runs'::regclass and polname = 'ai_analysis_runs_delete_role') policy,
      (select count(*)::int from pg_indexes where indexname = 'ai_analysis_runs_uc_ri_005_one_running') idx,
      (select count(*)::int from pg_trigger where tgname = 'ri_refuse_ai_analysis_run_delete') trg`)
  ).rows[0];
  if (beforeDown.h === afterDown.h && downState.policy === 1 && downState.idx === 0 && downState.trg === 0) {
    pass('rollback restores the delete policy, drops trigger and index, modifies no rows');
  } else fail(`rollback ${JSON.stringify({ downState, same: beforeDown.h === afterDown.h })}`);
  await applySqlFile(db, join(migrationsDir, MIGRATION));
  const reState = (await db.query(`select count(*)::int n from pg_policy where polrelid = 'public.ai_analysis_runs'::regclass and polcmd = 'd'`)).rows[0];
  if (reState.n === 0 && (await db.query(countSql)).rows[0].h === beforeDown.h) pass('re-apply after rollback succeeds with data unchanged');
  else fail('re-apply after rollback');
} catch (e) {
  fail(`unexpected error: ${e.stack || e.message}`);
} finally {
  await db.end();
  await stopEmbedded(embedded);
}

console.log(`\nAI run retention local DB acceptance: ${failures ? `FAIL (${failures})` : 'PASS'} — ${passes} passed`);
process.exit(failures ? 1 : 0);
