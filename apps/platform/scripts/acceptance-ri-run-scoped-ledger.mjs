#!/usr/bin/env node
/**
 * Run-reference-scoped AI execution ledger (Production Readiness Phase 2).
 * Embedded Postgres, deterministic, no provider calls.
 *
 * Proves: a new authorised run never inherits request or spend consumption from an unrelated historical run;
 * historical FCA-EVAL-style rows stay byte-identical; counters cannot be reduced or rows deleted;
 * request, budget, tenant, platform, window and revocation limits; concurrency; idempotency; retry accounting;
 * interrupted-execution recovery; operator recovery; audit events; grants; guard integration (fail closed).
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { resetAndStartEmbedded, stopEmbedded } from './local-db/harness.mjs';
import { reserveSharedLabSpend, settleSharedLabSpend } from '../lib/ri/ai/lab-shared-spend.mjs';
import {
  finalizeLabSpendAfterCall,
  guardLabAnthropicSpendBeforeCall,
} from '../lib/ri/ai/lab-anthropic-spend-guard.mjs';

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'supabase', 'migrations');
const readMigration = (name) => readFileSync(join(migrationsDir, name), 'utf8');
const runMigration = readMigration('20261126180000_ai_execution_run_ledger.sql');
const sql = [
  '20261126013000_lab_ai_shared_spend_guard.sql',
  '20261126020000_lab_ai_spend_reservation_recovery.sql',
  '20261126120000_lab_ai_spend_usage_categories_and_recovery_v2.sql',
  '20261126180000_ai_execution_run_ledger.sql',
  '20261126190000_ai_execution_run_ledger_inflight_guard.sql',
].map(readMigration).join('\n');

let fail = 0;
const pass = (id) => console.log(`PASS: ${id}`);
const failTest = (id, detail) => {
  fail += 1;
  console.error(`FAIL: ${id} — ${detail}`);
};
const check = (id, ok, detail) => (ok ? pass(id) : failTest(id, typeof detail === 'string' ? detail : JSON.stringify(detail)));

for (const needle of ['to service_role', "from anon", "from authenticated", 'force row level security']) {
  if (!runMigration.includes(needle)) failTest('static_grants', `migration lacks ${needle}`);
}
pass('static_grants');

for (const k of [
  'RI_LAB_SPEND_GUARD_MODE', 'RI_LAB_SPEND_DATABASE_URL', 'DATABASE_URL', 'SUPABASE_DB_URL', 'POSTGRES_URL',
  'SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'RI_AI_EXECUTION_RUN_REFERENCE',
  'RI_LAB_TRIAL_IDEMPOTENCY_SUFFIXES', 'RI_LAB_TRIAL_IDEMPOTENCY_SUFFIX', 'RI_LAB_SPEND_LEDGER_MODE',
]) delete process.env[k];
delete globalThis.__forgeniqLabSpendQuery;

const started = await resetAndStartEmbedded({ port: 54371 });
const embedded = started.embedded;
const admin = new pg.Client({ connectionString: started.adminUrl });
await admin.connect();
await admin.query(sql);
const one = async (text, params) => (await admin.query(text, params)).rows[0];
const all = async (text, params) => (await admin.query(text, params)).rows;

const clients = [];
for (let i = 0; i < 6; i += 1) {
  const c = new pg.Client({ connectionString: started.adminUrl });
  await c.connect();
  clients.push(c);
}
const queryOf = (client) => async (text, params) => (await client.query(text, params)).rows[0];
const rpc = async (client, fn, args) => {
  const placeholders = args.map((_, i) => `$${i + 1}`).join(', ');
  const { rows } = await client.query(`select public.${fn}(${placeholders}) as r`, args);
  return rows[0].r;
};

const MIN = 60_000;
const iso = (offsetMs) => new Date(Date.now() + offsetMs).toISOString();
const authorise = (ref, org, budget, maxReq, startOff = -MIN, endOff = 60 * MIN, by = 'uat-authoriser') =>
  rpc(admin, 'authorise_ai_execution_run', [ref, org, budget, maxReq, iso(startOff), iso(endOff), by, 'acceptance']);
const reserve = (client, ref, org, usd, key, retryOf = null, windowSecs = 420) =>
  rpc(client, 'reserve_ai_execution_run', [ref, org, usd, 'UC-RI-004', key, 'claude-sonnet-5-5', 'test', JSON.stringify({ t: 1 }), windowSecs, retryOf]);
const settle = (client, id, usd, ok = true, known = true) =>
  rpc(client, 'settle_ai_execution_run', [id, usd, known ? 100 : 0, known ? 50 : 0, ok, 0, 0, 0, 'req_x', known, null]);

try {
  // ------------------------------------------------------------ historical shared-account rows (FCA-EVAL-001/002 shape)
  const legacyScope = { scopeKey: 'forgeniq-lab-anthropic', budgetUsd: 0.75, maxRequests: 8, useCaseId: 'UC-RI-004', organisationId: 'org-hist' };
  for (let i = 1; i <= 8; i += 1) {
    const r = await reserveSharedLabSpend(queryOf(clients[0]), { ...legacyScope, reserveUsd: 0.02, idempotencyKey: `hist-${i}` });
    if (!r?.ok) throw new Error(`legacy seed reserve failed ${JSON.stringify(r)}`);
    await settleSharedLabSpend(queryOf(clients[0]), { reservationId: r.reservationId, actualUsd: 0.0189, inputTokens: 1000, outputTokens: 500, providerOk: true });
  }
  const snapshot = async () => {
    const accounts = await all(`select * from public.lab_ai_spend_accounts order by scope_key`);
    const rows = await all(`select * from public.lab_ai_spend_reservations where run_reference is null order by idempotency_key`);
    return createHash('sha256').update(JSON.stringify({ accounts, rows })).digest('hex');
  };
  const histBefore = await snapshot();
  const histAcct = await one(`select request_count, settled_usd from public.lab_ai_spend_accounts where scope_key = 'forgeniq-lab-anthropic'`);
  check('legacy_account_exhausted_by_history', histAcct.request_count === 8, histAcct);

  // ------------------------------------------------------------ 1. new run does not inherit history
  const auth1 = await authorise('run-eval-0003', 'org-a', 0.75, 8);
  check('authorise_run', auth1.ok === true, auth1);
  const r1 = await reserve(clients[1], 'run-eval-0003', 'org-a', 0.05, 'k1');
  check('new_run_not_blocked_by_history', r1.ok === true && r1.requestCount === 1 && Number(r1.settledUsd) === 0, r1);
  const s1 = await settle(clients[1], r1.reservationId, 0.03);
  check('settle_run', s1.ok === true && Number(s1.settledUsd) === 0.03 && s1.requestCount === 1, s1);
  check('historical_rows_unchanged', (await snapshot()) === histBefore, 'legacy account/reservation rows changed');

  // ------------------------------------------------------------ 2. immutability, no manual reset
  const attempts = [
    ['reduce_legacy_request_count', `update public.lab_ai_spend_accounts set request_count = 0 where scope_key = 'forgeniq-lab-anthropic'`],
    ['reduce_legacy_settled_usd', `update public.lab_ai_spend_accounts set settled_usd = 0 where scope_key = 'forgeniq-lab-anthropic'`],
    ['delete_legacy_account', `delete from public.lab_ai_spend_accounts where scope_key = 'forgeniq-lab-anthropic'`],
    ['reduce_run_request_count', `update public.ai_execution_runs set request_count = 0 where run_reference = 'run-eval-0003'`],
    ['reduce_run_settled', `update public.ai_execution_runs set settled_usd = 0 where run_reference = 'run-eval-0003'`],
    ['raise_run_budget', `update public.ai_execution_runs set budget_usd = 99 where run_reference = 'run-eval-0003'`],
    ['raise_run_max_requests', `update public.ai_execution_runs set max_requests = 99 where run_reference = 'run-eval-0003'`],
    ['extend_run_expiry', `update public.ai_execution_runs set expires_at = expires_at + interval '1 day' where run_reference = 'run-eval-0003'`],
    ['delete_run', `delete from public.ai_execution_runs where run_reference = 'run-eval-0003'`],
    ['rewrite_settled_reservation', `update public.lab_ai_spend_reservations set actual_usd = 0 where idempotency_key = 'k1'`],
    ['delete_settled_reservation', `delete from public.lab_ai_spend_reservations where idempotency_key = 'k1'`],
    ['delete_historical_reservation', `delete from public.lab_ai_spend_reservations where idempotency_key = 'hist-1'`],
    ['update_ledger_event', `update public.ai_execution_ledger_events set event_type = 'X' where id = 1`],
    ['delete_ledger_event', `delete from public.ai_execution_ledger_events where id = 1`],
  ];
  for (const [id, stmt] of attempts) {
    let blocked = false;
    try { await admin.query(stmt); } catch { blocked = true; }
    check(`immutable_${id}`, blocked, 'statement was permitted');
  }
  check('history_still_unchanged_after_attack', (await snapshot()) === histBefore, 'legacy rows changed');

  // ------------------------------------------------------------ 3. authorisation validity
  check('duplicate_reference_rejected', (await authorise('run-eval-0003', 'org-a', 1, 1)).code === 'AI_RUN_REFERENCE_EXISTS', 'dup');
  check('invalid_authorisation_rejected', (await authorise('short', 'org-a', 1, 1)).code === 'AI_RUN_AUTHORISATION_INVALID', 'short ref');
  check('zero_budget_rejected', (await authorise('run-zero-budget', 'org-a', 0, 1)).code === 'AI_RUN_AUTHORISATION_INVALID', 'budget');
  check('missing_authoriser_rejected', (await authorise('run-no-authoriser', 'org-a', 1, 1, -MIN, MIN, '')).code === 'AI_RUN_AUTHORISATION_INVALID', 'by');
  check('unknown_run_denied', (await reserve(clients[0], 'run-unknown-01', 'org-a', 0.01, 'x')).code === 'AI_RUN_NOT_AUTHORISED', 'unknown');
  check('tenant_mismatch_denied', (await reserve(clients[0], 'run-eval-0003', 'org-b', 0.01, 'x')).code === 'AI_RUN_TENANT_MISMATCH', 'tenant');
  await authorise('run-expired-01', 'org-a', 1, 2, -120 * MIN, -60 * MIN);
  const exp = await reserve(clients[0], 'run-expired-01', 'org-a', 0.01, 'x');
  check('expired_run_denied', exp.code === 'AI_RUN_EXPIRED', exp);
  const expAgain = await reserve(clients[0], 'run-expired-01', 'org-a', 0.01, 'y');
  check('expired_run_stays_expired', expAgain.code === 'AI_RUN_EXPIRED', expAgain);
  await authorise('run-future-01', 'org-a', 1, 2, 30 * MIN, 90 * MIN);
  check('not_started_run_denied', (await reserve(clients[0], 'run-future-01', 'org-a', 0.01, 'x')).code === 'AI_RUN_NOT_STARTED', 'future');

  // ------------------------------------------------------------ 4. request limit
  await authorise('run-two-req-01', 'org-a', 1, 2);
  for (const k of ['a', 'b']) {
    const r = await reserve(clients[0], 'run-two-req-01', 'org-a', 0.01, k);
    await settle(clients[0], r.reservationId, 0.005);
  }
  const third = await reserve(clients[0], 'run-two-req-01', 'org-a', 0.01, 'c');
  const runTwo = await one(`select status, terminated_reason, request_count from public.ai_execution_runs where run_reference = 'run-two-req-01'`);
  // The run is closed automatically when the second settlement reaches the cap, so the denial is AI_RUN_EXHAUSTED.
  check('request_limit_enforced', third.ok === false && ['AI_RUN_EXHAUSTED', 'LAB_ANTHROPIC_BUDGET_EXCEEDED'].includes(third.code), third);
  check('run_exhausted_status', runTwo.status === 'EXHAUSTED' && runTwo.request_count === 2, runTwo);

  // ------------------------------------------------------------ 5. budget limit with two concurrent clients
  await authorise('run-budget-01', 'org-a', 0.1, 8);
  const [b1, b2] = await Promise.all([
    reserve(clients[0], 'run-budget-01', 'org-a', 0.06, 'b1'),
    reserve(clients[1], 'run-budget-01', 'org-a', 0.06, 'b2'),
  ]);
  check('budget_race_single_winner', [b1, b2].filter((x) => x.ok).length === 1, { b1: b1.code ?? 'ok', b2: b2.code ?? 'ok' });

  // ------------------------------------------------------------ 6. concurrency on request cap
  await authorise('run-conc-0005', 'org-a', 5, 5);
  const results = await Promise.all(
    Array.from({ length: 18 }, (_, i) => reserve(clients[i % clients.length], 'run-conc-0005', 'org-a', 0.01, `c${i}`)),
  );
  const okN = results.filter((r) => r.ok).length;
  const concRow = await one(`select request_count, reserved_usd from public.ai_execution_runs where run_reference = 'run-conc-0005'`);
  check('concurrent_request_cap_exact', okN === 5 && concRow.request_count === 5, { okN, concRow });

  // ------------------------------------------------------------ 7. idempotency
  await authorise('run-idem-0001', 'org-a', 1, 5);
  const i1 = await reserve(clients[0], 'run-idem-0001', 'org-a', 0.02, 'same');
  const i2 = await reserve(clients[1], 'run-idem-0001', 'org-a', 0.02, 'same');
  check('inflight_duplicate_denied_no_second_provider_call', i1.ok === true && i2.ok === false && i2.code === 'AI_RESERVATION_IN_FLIGHT', { i1: i1.ok, i2 });
  check('inflight_duplicate_request_count', (await one(`select request_count from public.ai_execution_runs where run_reference = 'run-idem-0001'`)).request_count === 1, 'count');
  check('inflight_duplicate_audited', (await one(`select count(*)::int n from public.ai_execution_ledger_events where run_reference = 'run-idem-0001' and event_type = 'DUPLICATE_BLOCKED_IN_FLIGHT'`)).n === 1, 'audit');
  await authorise('run-race-0001', 'org-a', 1, 5);
  const race = await Promise.all(clients.map((c) => reserve(c, 'run-race-0001', 'org-a', 0.02, 'double-click')));
  check('same_key_race_single_winner', race.filter((x) => x.ok).length === 1 && race.filter((x) => x.code === 'AI_RESERVATION_IN_FLIGHT').length === race.length - 1, race.map((x) => x.code ?? 'ok'));
  check('same_key_race_counts_one_request', (await one(`select request_count from public.ai_execution_runs where run_reference = 'run-race-0001'`)).request_count === 1, 'count');
  await settle(clients[0], i1.reservationId, 0.01);
  const i3 = await reserve(clients[0], 'run-idem-0001', 'org-a', 0.02, 'same');
  check('settled_key_cannot_be_reused', i3.ok === false && i3.code === 'LAB_SPEND_ALREADY_SETTLED', i3);
  const settleAgain = await settle(clients[0], i1.reservationId, 0.5);
  check('double_settle_is_noop', settleAgain.reused === true && Number((await one(`select settled_usd from public.ai_execution_runs where run_reference = 'run-idem-0001'`)).settled_usd) === 0.01, settleAgain);

  // ------------------------------------------------------------ 8. retry accounting
  await authorise('run-retry-0001', 'org-a', 1, 4);
  const f1 = await reserve(clients[0], 'run-retry-0001', 'org-a', 0.04, 'stage4');
  const failed = await settle(clients[0], f1.reservationId, 0, false, false);
  check('unknown_usage_charged_at_reserve', failed.ok && Number(failed.actualUsd) === 0.04 && failed.usageKnown === false, failed);
  check('retry_requires_failed_origin', (await reserve(clients[0], 'run-retry-0001', 'org-a', 0.04, 'x1', 'does-not-exist')).code === 'AI_RETRY_ORIGIN_INVALID', 'missing origin');
  const retry = await reserve(clients[0], 'run-retry-0001', 'org-a', 0.04, 'stage4-retry', 'stage4');
  const retryRow = await one(`select request_count, retry_count, failed_count from public.ai_execution_runs where run_reference = 'run-retry-0001'`);
  check('retry_counts_as_request', retry.ok && retryRow.request_count === 2 && retryRow.retry_count === 1 && retryRow.failed_count === 1, retryRow);
  await settle(clients[0], retry.reservationId, 0.02);
  check('retry_of_settled_origin_rejected', (await reserve(clients[0], 'run-retry-0001', 'org-a', 0.04, 'x2', 'stage4-retry')).code === 'AI_RETRY_ORIGIN_INVALID', 'settled origin');

  // ------------------------------------------------------------ 9. interrupted execution + operator recovery
  await authorise('run-crash-0001', 'org-a', 1, 5);
  const crash = await reserve(clients[0], 'run-crash-0001', 'org-a', 0.05, 'crash', null, 60);
  const early = await rpc(clients[1], 'recover_ai_execution_reservation', [crash.reservationId, 'uat-operator', 'x'.repeat(30), 'ASSUME_MAX', null, null]);
  check('recovery_unregistered_operator_denied', early.code === 'LAB_SPEND_RECOVERY_NOT_AUTHORISED', early);
  await admin.query(`insert into public.lab_ai_spend_operators (actor, authorised_by) values ('uat-operator', 'uat-admin') on conflict do nothing`);
  const tooEarly = await rpc(clients[1], 'recover_ai_execution_reservation', [crash.reservationId, 'uat-operator', 'x'.repeat(30), 'ASSUME_MAX', null, null]);
  check('recovery_blocked_while_provider_may_run', tooEarly.code === 'LAB_SPEND_RECOVERY_PROVIDER_MAY_BE_ACTIVE', tooEarly);
  await admin.query(`update public.lab_ai_spend_reservations set provider_deadline_at = now() - interval '1 minute' where id = $1`, [crash.reservationId]);
  const rec = await rpc(clients[1], 'recover_ai_execution_reservation', [crash.reservationId, 'uat-operator', 'provider window ended; no response seen', 'ASSUME_MAX', null, null]);
  const crashRun = await one(`select settled_usd, reserved_usd, failed_count from public.ai_execution_runs where run_reference = 'run-crash-0001'`);
  check('operator_recovery_assume_max', rec.ok && Number(crashRun.settled_usd) === 0.05 && Number(crashRun.reserved_usd) === 0, { rec, crashRun });
  check('recovery_one_per_reservation', (await rpc(clients[1], 'recover_ai_execution_reservation', [crash.reservationId, 'uat-operator', 'provider window ended; again', 'ASSUME_MAX', null, null])).code === 'LAB_SPEND_RECOVERY_NOT_OPEN', 'twice');

  await authorise('run-crash-0002', 'org-a', 1, 5);
  const crash2 = await reserve(clients[0], 'run-crash-0002', 'org-a', 0.07, 'crash2', null, 60);
  await admin.query(`update public.lab_ai_spend_reservations set provider_deadline_at = now() - interval '1 minute' where id = $1`, [crash2.reservationId]);
  const next = await reserve(clients[0], 'run-crash-0002', 'org-a', 0.01, 'after');
  const auto = await one(`select status, actual_usd, usage_known from public.lab_ai_spend_reservations where id = $1`, [crash2.reservationId]);
  check('interrupted_run_auto_reconciled', next.ok && auto.status === 'FAILED' && Number(auto.actual_usd) === 0.07 && auto.usage_known === false, { next: next.code ?? 'ok', auto });

  // ------------------------------------------------------------ 10. tenant and platform limits
  await authorise('run-tenant-0001', 'org-lim', 5, 9);
  await rpc(admin, 'set_ai_execution_limit', ['tenant', 'org-lim', 0.05, null, iso(-MIN), iso(60 * MIN), 'uat-authoriser']);
  const t1 = await reserve(clients[0], 'run-tenant-0001', 'org-lim', 0.03, 't1');
  const t2 = await reserve(clients[0], 'run-tenant-0001', 'org-lim', 0.03, 't2');
  check('tenant_limit_enforced', t1.ok && t2.code === 'AI_TENANT_LIMIT_EXCEEDED', { t1: t1.ok, t2 });
  check('other_tenant_unaffected_by_tenant_limit', (await reserve(clients[0], 'run-eval-0003', 'org-a', 0.01, 'other-tenant')).ok === true, 'org-a blocked');
  const platformUsed = await one(`select spend from public.ai_exec_window_usage(null, now() - interval '1 hour', now() + interval '1 hour')`);
  await rpc(admin, 'set_ai_execution_limit', ['platform', null, Number(platformUsed.spend) + 0.01, null, iso(-MIN), iso(60 * MIN), 'uat-authoriser']);
  const p1 = await reserve(clients[0], 'run-eval-0003', 'org-a', 0.02, 'platform-over');
  check('platform_limit_enforced', p1.code === 'AI_PLATFORM_LIMIT_EXCEEDED', p1);
  const badLimit = await rpc(admin, 'set_ai_execution_limit', ['tenant', null, 1, null, iso(-MIN), iso(MIN), 'uat-authoriser']);
  check('invalid_limit_rejected', badLimit.ok === false, badLimit);
  let limitUpdateBlocked = false;
  try { await admin.query(`update public.ai_execution_limits set max_spend_usd = 999`); } catch { limitUpdateBlocked = true; }
  check('limit_cannot_be_raised_in_place', limitUpdateBlocked, 'limit raised');
  await admin.query(`update public.ai_execution_limits set revoked_at = now() where limit_scope = 'platform'`);
  check('revoked_limit_ignored', (await reserve(clients[0], 'run-eval-0003', 'org-a', 0.02, 'platform-after-revoke')).ok === true, 'still blocked');

  // ------------------------------------------------------------ 11. revoke / close
  await authorise('run-revoke-0001', 'org-a', 1, 5);
  const open = await reserve(clients[0], 'run-revoke-0001', 'org-a', 0.01, 'open');
  const term = await rpc(admin, 'terminate_ai_execution_run', ['run-revoke-0001', 'uat-authoriser', 'revoked by acceptance test', 'REVOKED']);
  check('terminate_run', term.ok && term.status === 'REVOKED', term);
  check('revoked_run_denied', (await reserve(clients[0], 'run-revoke-0001', 'org-a', 0.01, 'late')).code === 'AI_RUN_REVOKED', 'revoked');
  const lateSettle = await settle(clients[0], open.reservationId, 0.005);
  check('in_flight_call_can_still_settle_after_revoke', lateSettle.ok === true && Number(lateSettle.settledUsd) === 0.005, lateSettle);
  check('terminate_rejects_weak_reason', (await rpc(admin, 'terminate_ai_execution_run', ['run-eval-0003', 'uat-authoriser', 'short', 'CLOSED'])).ok === false, 'weak');

  // ------------------------------------------------------------ 12. audit trail
  const events = (await all(`select event_type from public.ai_execution_ledger_events where run_reference = 'run-eval-0003' order by id`)).map((e) => e.event_type);
  check('audit_events_recorded', events[0] === 'RUN_AUTHORISED' && events.includes('RESERVED') && events.includes('SETTLED'), events);
  const denied = await one(`select count(*)::int as n from public.ai_execution_ledger_events where event_type like 'RESERVE_DENIED%'`);
  check('denials_audited', denied.n >= 3, denied);

  // ------------------------------------------------------------ 13. totals reconcile with immutable reservation rows
  const drift = await all(`
    select r.run_reference from public.ai_execution_runs r
    left join (
      select run_reference, count(*) n,
             sum(case when status = 'RESERVED' then reserve_usd else coalesce(actual_usd, reserve_usd) end) spend
      from public.lab_ai_spend_reservations where run_reference is not null group by run_reference) x using (run_reference)
    where coalesce(x.n, 0) <> r.request_count
       or abs(coalesce(x.spend, 0) - (r.settled_usd + r.reserved_usd)) > 0.000001`);
  check('run_counters_reconcile_with_reservations', drift.length === 0, drift);

  // ------------------------------------------------------------ 14. grants
  const exec = await one(
    `select count(*)::int as n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
      where ns.nspname = 'public' and p.proname like '%ai_execution%' and has_function_privilege('public', p.oid, 'execute')`,
  );
  check('run_functions_not_public_executable', exec.n === 0, exec);
  const rls = await one(
    `select bool_and(c.relforcerowsecurity and c.relrowsecurity) as forced from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname in ('ai_execution_runs','ai_execution_limits','ai_execution_ledger_events')`,
  );
  check('run_tables_forced_rls', rls.forced === true, rls);

  // ------------------------------------------------------------ 15. guard integration (no provider)
  globalThis.__forgeniqLabSpendQuery = queryOf(clients[2]);
  process.env.RI_AI_EXECUTION_ENABLED = 'true';
  process.env.RI_LAB_ANTHROPIC_MAX_USD = '0.75';
  const guardArgs = (key, org = 'org-g') => ({
    useCaseId: 'UC-RI-005', system: 's', user: 'short prompt', idempotencyKey: key, organisationId: org, model: 'claude-sonnet-5-5', timeoutMs: 60_000,
  });
  const noRun = await guardLabAnthropicSpendBeforeCall(guardArgs('g0'));
  check('guard_fails_closed_without_run_reference', noRun.ok === false && noRun.code === 'AI_RUN_NOT_AUTHORISED' && noRun.failClosed === true, noRun);

  process.env.RI_LAB_TRIAL_IDEMPOTENCY_SUFFIXES = 'closed-old-run-0001,run-guard-0001';
  await authorise('run-guard-0001', 'org-g', 0.75, 3);
  const g1 = await guardLabAnthropicSpendBeforeCall(guardArgs('g1'));
  check('guard_resolves_single_open_run', g1.ok === true && g1.runScoped === true && g1.runReference === 'run-guard-0001', { ok: g1.ok, code: g1.code });
  const fin = await finalizeLabSpendAfterCall(g1, g1.slotKey, {
    ok: true, text: '{}', requestId: 'req_g1', responseReceived: true, usageKnown: true,
    usage: { standardInputTokens: 500, outputTokens: 200, cacheWrite5mTokens: 0, cacheWrite1hTokens: 0, cacheReadTokens: 0 },
  }, g1.reserveUsd);
  const gRow = await one(`select status, actual_usd, run_reference from public.lab_ai_spend_reservations where id = $1`, [g1.reservationId]);
  check('guard_finalize_settles_run', fin.ok === true && gRow.status === 'SETTLED' && gRow.run_reference === 'run-guard-0001' && Number(gRow.actual_usd) === 0.003, { fin, gRow });
  const gWrongTenant = await guardLabAnthropicSpendBeforeCall(guardArgs('g2', 'org-other'));
  check('guard_denies_wrong_tenant', gWrongTenant.ok === false && gWrongTenant.code === 'AI_RUN_TENANT_MISMATCH', gWrongTenant);
  const g3 = await guardLabAnthropicSpendBeforeCall(guardArgs('g3'));
  const timedOut = await finalizeLabSpendAfterCall(g3, g3.slotKey, { ok: false, code: 'AI_TIMEOUT', usageKnown: false }, g3.reserveUsd);
  const g3Row = await one(`select status, actual_usd, reserve_usd from public.lab_ai_spend_reservations where id = $1`, [g3.reservationId]);
  check('guard_timeout_assumes_max_in_run', timedOut.ok && g3Row.status === 'FAILED' && Number(g3Row.actual_usd) === Number(g3Row.reserve_usd), { timedOut, g3Row });
  const g4 = await guardLabAnthropicSpendBeforeCall({ ...guardArgs('g3-retry'), retryOf: 'g3' });
  check('guard_retry_references_failed_origin', g4.ok === true && g4.spendAudit.retryOf === 'g3', { ok: g4.ok, code: g4.code });
  await finalizeLabSpendAfterCall(g4, g4.slotKey, { ok: true, text: '{}', requestId: 'r4', responseReceived: true, usageKnown: true, usage: { standardInputTokens: 10, outputTokens: 10, cacheWrite5mTokens: 0, cacheWrite1hTokens: 0, cacheReadTokens: 0 } }, g4.reserveUsd);
  const g5 = await guardLabAnthropicSpendBeforeCall(guardArgs('g5'));
  check('guard_run_request_cap', g5.ok === false && ['AI_RUN_EXHAUSTED', 'LAB_ANTHROPIC_BUDGET_EXCEEDED'].includes(g5.code), g5);

  process.env.RI_LAB_TRIAL_IDEMPOTENCY_SUFFIXES = 'run-guard-0001,run-guard-0002';
  const ambiguous = await guardLabAnthropicSpendBeforeCall(guardArgs('g6'));
  check('guard_ambiguous_reference_fails_closed', ambiguous.ok === false && ambiguous.code === 'AI_RUN_NOT_AUTHORISED', ambiguous);
  process.env.RI_LAB_TRIAL_IDEMPOTENCY_SUFFIXES = 'closed-everything-done';
  check('guard_only_closed_references_fails_closed', (await guardLabAnthropicSpendBeforeCall(guardArgs('g7'))).code === 'AI_RUN_NOT_AUTHORISED', 'closed');
  delete process.env.RI_LAB_TRIAL_IDEMPOTENCY_SUFFIXES;
  process.env.RI_AI_EXECUTION_RUN_REFERENCE = 'run-eval-0003';
  const explicit = await guardLabAnthropicSpendBeforeCall(guardArgs('g8', 'org-a'));
  check('guard_explicit_run_reference', explicit.ok === true && explicit.runReference === 'run-eval-0003', { ok: explicit.ok, code: explicit.code });
  if (explicit.ok) await finalizeLabSpendAfterCall(explicit, explicit.slotKey, { ok: false, code: 'AI_TIMEOUT', usageKnown: false }, explicit.reserveUsd);
  delete process.env.RI_AI_EXECUTION_RUN_REFERENCE;

  // Everything done in run mode (above) left the historical rows byte-identical.
  check('history_unchanged_after_all_run_activity', (await snapshot()) === histBefore, 'legacy rows changed during run activity');

  // Legacy mode is an explicit opt-in and still sees the exhausted historical account.
  // (The legacy reserve function upserts updated_at on its own account, so it is probed after the snapshot.)
  process.env.RI_LAB_SPEND_LEDGER_MODE = 'legacy';
  const legacyGuard = await guardLabAnthropicSpendBeforeCall({ ...guardArgs('legacy-1', 'org-hist') });
  check('legacy_mode_still_exhausted_by_history', legacyGuard.ok === false && legacyGuard.code === 'LAB_ANTHROPIC_BUDGET_EXCEEDED', legacyGuard);
  delete process.env.RI_LAB_SPEND_LEDGER_MODE;
  delete globalThis.__forgeniqLabSpendQuery;
  const histCounters = await one(`select request_count, settled_usd from public.lab_ai_spend_accounts where scope_key = 'forgeniq-lab-anthropic'`);
  check('legacy_counters_unchanged_at_end', histCounters.request_count === 8 && Number(histCounters.settled_usd) === Number(histAcct.settled_usd), histCounters);
} catch (err) {
  failTest('unexpected_error', err?.stack || String(err));
} finally {
  for (const c of clients) await c.end().catch(() => {});
  await admin.end().catch(() => {});
  await stopEmbedded(embedded).catch(() => {});
}

if (fail > 0) {
  console.error(`\n${fail} run-scoped ledger check(s) failed.`);
  process.exit(1);
}
console.log('\nPASS: run-scoped ledger acceptance');
