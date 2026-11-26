#!/usr/bin/env node
/**
 * Stage 4 (UC-RI-007) recovery and workflow reliability (Production Readiness Phase 3).
 * Real provider code and real run ledger (embedded Postgres) with a MOCKED fetch. No network, no paid AI.
 *
 * Reproduces the FCA-EVAL-002 failure shape: an earlier evaluation exhausted the shared account, a later run
 * reached Stage 4 and could not call the provider. Proves the run ledger isolates the runs, a failed attempt is
 * retried with accounting, a double click cannot double-spend, and nothing reaches the provider without an
 * authorised run.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { resetAndStartEmbedded, stopEmbedded } from './local-db/harness.mjs';
import { reserveSharedLabSpend, settleSharedLabSpend } from '../lib/ri/ai/lab-shared-spend.mjs';
import { createAnthropicProvider } from '../lib/ri/ai/anthropic-provider-core.mjs';
import {
  acceptOperatorKey,
  deriveRetryOrigin,
  nextStage4RetryKey,
} from '../lib/ri/services/control-mapping-retry.mjs';

const platformRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = join(platformRoot, 'supabase', 'migrations');
const sql = [
  '20261126013000_lab_ai_shared_spend_guard.sql',
  '20261126020000_lab_ai_spend_reservation_recovery.sql',
  '20261126120000_lab_ai_spend_usage_categories_and_recovery_v2.sql',
  '20261126180000_ai_execution_run_ledger.sql',
  '20261126190000_ai_execution_run_ledger_inflight_guard.sql',
].map((n) => readFileSync(join(migrationsDir, n), 'utf8')).join('\n');

let fail = 0;
const pass = (id) => console.log(`PASS: ${id}`);
const failTest = (id, detail) => {
  fail += 1;
  console.error(`FAIL: ${id} — ${detail}`);
};
const check = (id, ok, detail) => (ok ? pass(id) : failTest(id, typeof detail === 'string' ? detail : JSON.stringify(detail)));

// ---------------------------------------------------------------- pure retry rules
const RISK = '11111111-2222-3333-4444-555555555555';
check('retry_key_first', nextStage4RetryKey(RISK, 0) === `stage4:${RISK}:retry-1`, nextStage4RetryKey(RISK, 0));
check('retry_key_increments', nextStage4RetryKey(RISK, 2) === `stage4:${RISK}:retry-3`, nextStage4RetryKey(RISK, 2));
check('retry_key_garbage_count_safe', nextStage4RetryKey(RISK, -4) === `stage4:${RISK}:retry-1` && nextStage4RetryKey(RISK, NaN) === `stage4:${RISK}:retry-1`, 'garbage');
check('operator_key_accepts_scoped', acceptOperatorKey(`stage4:${RISK}:manual-1`, RISK) === `stage4:${RISK}:manual-1`, 'scoped');
check('operator_key_rejects_other_risk', acceptOperatorKey('stage4:99999999-aaaa:retry-1', RISK) === null, 'other risk');
check('operator_key_rejects_unscoped', acceptOperatorKey('retry-1-abcdefgh', RISK) === null, 'unscoped');
check('operator_key_rejects_injection', acceptOperatorKey(`stage4:${RISK}:x'; drop table`, RISK) === null, 'charset');
check('operator_key_rejects_non_string', acceptOperatorKey({ a: 1 }, RISK) === null && acceptOperatorKey(undefined, RISK) === null, 'type');
check('operator_key_rejects_too_long', acceptOperatorKey(`stage4:${RISK}:${'a'.repeat(200)}`, RISK) === null, 'length');

const failedAudit = {
  idempotencyKey: `stage4:${RISK}`,
  spendAudit: { runScoped: true, reconciliation: { providerOk: false, reservationId: 'r-1' } },
};
check('retry_origin_from_failed_provider_call', deriveRetryOrigin(failedAudit) === `stage4:${RISK}`, 'origin');
check('no_retry_origin_when_denied_before_reservation', deriveRetryOrigin({ idempotencyKey: 'k', spendAudit: null }) === null, 'denied');
check('no_retry_origin_for_successful_settle', deriveRetryOrigin({ idempotencyKey: 'k', spendAudit: { runScoped: true, reconciliation: { providerOk: true, reservationId: 'r' } } }) === null, 'ok');
check('no_retry_origin_for_legacy_ledger', deriveRetryOrigin({ idempotencyKey: 'k', spendAudit: { reconciliation: { providerOk: false, reservationId: 'r' } } }) === null, 'legacy');
check('no_retry_origin_for_junk', deriveRetryOrigin(null) === null && deriveRetryOrigin('x') === null && deriveRetryOrigin({}) === null, 'junk');

// ---------------------------------------------------------------- route contract (static)
const route = readFileSync(join(platformRoot, 'app', 'api', 'ri-lab', 'risks', '[id]', 'retry-control-mapping', 'route.ts'), 'utf8');
check('route_requires_risk_approve_permission', route.includes("requireRiContext('risk:approve')"), 'permission');
check('route_checks_tenant', route.includes('assertRowInOrganisation'), 'tenant');
check('route_requires_approved_risk', route.includes("risk.status !== 'APPROVED'") && route.includes('status: 409'), 'approved');
check('route_numbers_attempts_server_side', route.includes('nextStage4RetryKey'), 'numbering');
check('route_derives_retry_origin', route.includes('deriveRetryOrigin'), 'retry origin');
check('route_validates_operator_key', route.includes('acceptOperatorKey') && route.includes('invalid_idempotency_key'), 'validation');
check('route_refuses_inflight_duplicate', route.includes('AI_RESERVATION_IN_FLIGHT'), 'inflight');
check('route_has_no_fixed_recovery_key', !route.includes(':recovery`'), 'fixed key');
const downstream = readFileSync(join(platformRoot, 'lib', 'ri', 'services', 'risk-control-downstream.ts'), 'utf8');
check('downstream_records_skip_audit_event', downstream.includes('CONTROL_MAPPING_SKIPPED') && downstream.includes('recordControlMappingSkipped'), 'audit');
check('downstream_passes_retry_origin', downstream.includes('retryOfIdempotencyKey: params.retryOfIdempotencyKey'), 'pass-through');

// ---------------------------------------------------------------- provider + ledger scenarios
for (const k of [
  'RI_LAB_SPEND_GUARD_MODE', 'RI_LAB_SPEND_DATABASE_URL', 'DATABASE_URL', 'SUPABASE_DB_URL', 'POSTGRES_URL',
  'SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'RI_AI_EXECUTION_RUN_REFERENCE',
  'RI_LAB_TRIAL_IDEMPOTENCY_SUFFIX', 'RI_LAB_SPEND_LEDGER_MODE',
]) delete process.env[k];
const realFetch = globalThis.fetch;
globalThis.fetch = () => {
  throw new Error('NETWORK_FORBIDDEN_IN_TEST');
};
process.env.ANTHROPIC_API_KEY = `sk-ant-${'t'.repeat(30)}`; // obviously fake; fetch is mocked
process.env.RI_AI_EXECUTION_ENABLED = 'true';
process.env.RI_LAB_ANTHROPIC_MAX_USD = '0.75';
process.env.RI_ANTHROPIC_MODEL = 'claude-sonnet-5-5';

const started = await resetAndStartEmbedded({ port: 54373 });
const admin = new pg.Client({ connectionString: started.adminUrl });
await admin.connect();
await admin.query(sql);
const pool = [];
for (let i = 0; i < 3; i += 1) {
  const c = new pg.Client({ connectionString: started.adminUrl });
  await c.connect();
  pool.push(c);
}
const queryOf = (client) => async (text, params) => (await client.query(text, params)).rows[0];
const one = async (text, params) => (await admin.query(text, params)).rows[0];
globalThis.__forgeniqLabSpendQuery = queryOf(pool[0]);

const MIN = 60_000;
const authorise = async (ref, org, budget, maxReq) =>
  (await admin.query(
    `select public.authorise_ai_execution_run($1,$2,$3,$4,$5,$6,'uat-authoriser','phase 3') r`,
    [ref, org, budget, maxReq, new Date(Date.now() - MIN).toISOString(), new Date(Date.now() + 60 * MIN).toISOString()],
  )).rows[0].r;

const okBody = () => ({
  id: 'msg_test',
  model: 'claude-sonnet-5-5',
  stop_reason: 'end_turn',
  content: [{ type: 'text', text: JSON.stringify({ controls: [], summary: 'ok' }) }],
  usage: { input_tokens: 800, output_tokens: 300 },
});
const makeResponse = (status, body, headers = { 'request-id': 'req_test' }) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: (k) => headers[k.toLowerCase()] ?? null },
  json: async () => body,
  text: async () => JSON.stringify(body),
});

let fetchCalls = 0;
const makeProvider = (handler) => createAnthropicProvider({
  apiKeyOverride: process.env.ANTHROPIC_API_KEY,
  fetchFn: async (...args) => {
    fetchCalls += 1;
    return handler(...args);
  },
});
const stage4 = (key, retryOf = null, org = 'org-a') => ({
  useCaseId: 'UC-RI-007',
  analysisType: 'Control Mapping',
  context: { sourceSections: [{ sourceSectionId: 'RISK-1', citation: 'risk', text: 'Customers may not be contacted before debt sale.' }] },
  budgetContext: { idempotencyKey: key, organisationId: org, retryOfIdempotencyKey: retryOf },
});

try {
  // history: the shared account was exhausted by earlier evaluations (the eval-001/eval-002 shape)
  for (let i = 1; i <= 8; i += 1) {
    const r = await reserveSharedLabSpend(queryOf(pool[0]), {
      scopeKey: 'forgeniq-lab-anthropic', budgetUsd: 0.75, maxRequests: 8, reserveUsd: 0.02, useCaseId: 'UC-RI-004',
      idempotencyKey: `hist-${i}`, organisationId: 'org-hist',
    });
    await settleSharedLabSpend(queryOf(pool[0]), { reservationId: r.reservationId, actualUsd: 0.0189, inputTokens: 1000, outputTokens: 500, providerOk: true });
  }

  // 1. no authorised run: provider is never reached
  fetchCalls = 0;
  const unauth = await makeProvider(async () => makeResponse(200, okBody())).execute(stage4(`stage4:${RISK}`));
  check('no_run_authorised_blocks_provider', unauth.ok === false && unauth.code === 'AI_RUN_NOT_AUTHORISED' && fetchCalls === 0, { code: unauth.code, fetchCalls });

  // 2. authorised run is not blocked by exhausted history, and the first attempt fails at the provider
  process.env.RI_AI_EXECUTION_RUN_REFERENCE = 'run-eval-0003';
  check('authorise_run', (await authorise('run-eval-0003', 'org-a', 0.75, 8)).ok === true, 'authorise');
  fetchCalls = 0;
  const attempt1 = await makeProvider(async () => makeResponse(529, { type: 'error', error: { type: 'overloaded_error', message: 'busy' } }))
    .execute(stage4(`stage4:${RISK}`));
  check('first_attempt_reaches_provider_despite_exhausted_history', fetchCalls === 1 && attempt1.ok === false, { fetchCalls, code: attempt1.code });
  const failedRow = await one(`select status, actual_usd from public.lab_ai_spend_reservations where idempotency_key = $1`, [`stage4:${RISK}`]);
  check('failed_attempt_recorded_as_failed', failedRow?.status === 'FAILED', failedRow);

  // 3. retry: origin derived from what the first attempt recorded, key numbered by the server
  const skipMeta = { reason: attempt1.code, idempotencyKey: `stage4:${RISK}`, spendAudit: attempt1.spendAudit };
  const origin = deriveRetryOrigin(skipMeta);
  check('retry_origin_derived_from_real_failed_attempt', origin === `stage4:${RISK}`, { origin, audit: attempt1.spendAudit?.reconciliation });
  fetchCalls = 0;
  const retry1 = await makeProvider(async () => makeResponse(200, okBody()))
    .execute(stage4(nextStage4RetryKey(RISK, 1), origin));
  check('retry_succeeds_and_settles', retry1.ok === true && fetchCalls === 1, { ok: retry1.ok, code: retry1.code, fetchCalls });
  const runRow = await one(`select request_count, retry_count, failed_count, settled_usd, reserved_usd from public.ai_execution_runs where run_reference = 'run-eval-0003'`);
  check('retry_counted_in_run', runRow.request_count === 2 && runRow.retry_count === 1 && runRow.failed_count === 1 && Number(runRow.reserved_usd) === 0, runRow);

  // 4. a second recovery after a failed recovery is possible (distinct numbered keys)
  const failRetry = await makeProvider(async () => makeResponse(529, { type: 'error', error: { type: 'overloaded_error', message: 'busy' } }))
    .execute(stage4(nextStage4RetryKey(RISK, 2)));
  const origin2 = deriveRetryOrigin({ reason: failRetry.code, idempotencyKey: nextStage4RetryKey(RISK, 2), spendAudit: failRetry.spendAudit });
  const secondRecovery = await makeProvider(async () => makeResponse(200, okBody()))
    .execute(stage4(nextStage4RetryKey(RISK, 3), origin2));
  check('second_recovery_after_failed_recovery_possible', failRetry.ok === false && secondRecovery.ok === true, { a: failRetry.code, b: secondRecovery.code });

  // 5. double click: two concurrent attempts, one provider call
  fetchCalls = 0;
  let release;
  const gate = new Promise((r) => { release = r; });
  const slow = async () => { await gate; return makeResponse(200, okBody()); };
  const dupKey = nextStage4RetryKey(RISK, 4);
  const p1 = makeProvider(slow).execute(stage4(dupKey));
  await new Promise((r) => setTimeout(r, 250));
  const p2 = await makeProvider(slow).execute(stage4(dupKey));
  release();
  const first = await p1;
  check('double_click_second_call_denied_in_flight', p2.ok === false && p2.code === 'AI_RESERVATION_IN_FLIGHT', { code: p2.code });
  check('double_click_single_provider_call', fetchCalls === 1 && first.ok === true, { fetchCalls, firstOk: first.ok });

  // 6. the same key can never be spent twice after settlement
  fetchCalls = 0;
  const reuse = await makeProvider(async () => makeResponse(200, okBody())).execute(stage4(dupKey));
  check('settled_key_cannot_call_provider_again', reuse.ok === false && fetchCalls === 0, { code: reuse.code, fetchCalls });

  // 7. wrong tenant cannot use the run
  fetchCalls = 0;
  const wrongTenant = await makeProvider(async () => makeResponse(200, okBody())).execute(stage4('stage4:other-tenant-key-1', null, 'org-b'));
  check('wrong_tenant_denied_before_provider', wrongTenant.ok === false && wrongTenant.code === 'AI_RUN_TENANT_MISMATCH' && fetchCalls === 0, { code: wrongTenant.code, fetchCalls });

  // 8. timeout leaves unknown usage charged at the full reserve, never zero
  const timeoutRun = 'run-timeout-0001';
  await authorise(timeoutRun, 'org-t', 0.75, 3);
  process.env.RI_AI_EXECUTION_RUN_REFERENCE = timeoutRun;
  process.env.RI_ANTHROPIC_TIMEOUT_MS = '1';
  const slowNever = async (_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
  });
  const timedOut = await makeProvider(slowNever).execute(stage4('stage4:timeout-key-0001', null, 'org-t'));
  delete process.env.RI_ANTHROPIC_TIMEOUT_MS;
  const toRow = await one(`select status, actual_usd, reserve_usd, usage_known from public.lab_ai_spend_reservations where idempotency_key = 'stage4:timeout-key-0001'`);
  check('timeout_charged_at_full_reserve', timedOut.ok === false && toRow.status === 'FAILED' && Number(toRow.actual_usd) === Number(toRow.reserve_usd) && toRow.usage_known === false, { code: timedOut.code, toRow });

  // 9. run request cap blocks the provider; exhaustion is permanent
  const capRun = 'run-capped-0001';
  await authorise(capRun, 'org-c', 0.75, 1);
  process.env.RI_AI_EXECUTION_RUN_REFERENCE = capRun;
  await makeProvider(async () => makeResponse(200, okBody())).execute(stage4('stage4:cap-key-00000001', null, 'org-c'));
  fetchCalls = 0;
  const capped = await makeProvider(async () => makeResponse(200, okBody())).execute(stage4('stage4:cap-key-00000002', null, 'org-c'));
  check('request_cap_blocks_provider', capped.ok === false && fetchCalls === 0, { code: capped.code, fetchCalls });
  const cappedRun = await one(`select status from public.ai_execution_runs where run_reference = $1`, [capRun]);
  check('capped_run_is_exhausted', cappedRun.status === 'EXHAUSTED', cappedRun);

  // 10. nothing from any run changed the historical shared account
  const hist = await one(`select request_count, settled_usd from public.lab_ai_spend_accounts where scope_key = 'forgeniq-lab-anthropic'`);
  check('historical_account_untouched', hist.request_count === 8 && Math.abs(Number(hist.settled_usd) - 0.1512) < 0.0001, hist);

  // 11. every ledger movement is auditable per run
  const ev = await one(`select count(*)::int n from public.ai_execution_ledger_events where run_reference = 'run-eval-0003'`);
  check('run_events_recorded', ev.n >= 8, ev);
} catch (err) {
  failTest('unexpected_error', err?.stack || String(err));
} finally {
  globalThis.fetch = realFetch;
  delete globalThis.__forgeniqLabSpendQuery;
  for (const c of pool) await c.end().catch(() => {});
  await admin.end().catch(() => {});
  await stopEmbedded(started.embedded).catch(() => {});
}

if (fail > 0) {
  console.error(`\n${fail} stage 4 recovery check(s) failed.`);
  process.exit(1);
}
console.log('\nPASS: stage 4 recovery and workflow reliability');
