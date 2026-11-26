#!/usr/bin/env node
/**
 * Shared spend ledger across database clients (simulated serverless instances).
 * Covers reservation, settlement with Sonnet 5.5 usage categories, concurrency, request caps,
 * unknown-outcome settlement, historical rows, operator recovery and grants.
 * No provider calls.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { resetAndStartEmbedded, stopEmbedded } from './local-db/harness.mjs';
import { reserveSharedLabSpend, settleSharedLabSpend } from '../lib/ri/ai/lab-shared-spend.mjs';
import {
  finalizeLabSpendAfterCall,
  guardLabAnthropicSpendBeforeCall,
} from '../lib/ri/ai/lab-anthropic-spend-guard.mjs';
import { ANTHROPIC_PRICING_VERSION, estimateUsageCostUsd } from '../lib/ri/reasoner/anthropic-eval-budget.mjs';

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'supabase', 'migrations');
const readMigration = (name) => readFileSync(join(migrationsDir, name), 'utf8');
const v2 = readMigration('20261126120000_lab_ai_spend_usage_categories_and_recovery_v2.sql');
const sql = [
  '20261126013000_lab_ai_shared_spend_guard.sql',
  '20261126020000_lab_ai_spend_reservation_recovery.sql',
  '20261126120000_lab_ai_spend_usage_categories_and_recovery_v2.sql',
].map(readMigration).join('\n');

let fail = 0;
const pass = (id) => console.log(`PASS: ${id}`);
const failTest = (id, detail) => {
  fail += 1;
  console.error(`FAIL: ${id} — ${detail}`);
};

if (
  !v2.includes('from anon') ||
  !v2.includes('from authenticated') ||
  !v2.includes('to service_role') ||
  !v2.includes('alter table public.lab_ai_spend_operators force row level security')
) {
  failTest('client_execute_revoked', 'ledger functions must be withheld from anon and authenticated');
} else pass('client_execute_revoked_static');

delete process.env.RI_LAB_SPEND_GUARD_MODE;
delete process.env.RI_LAB_SPEND_DATABASE_URL;
delete process.env.DATABASE_URL;
delete process.env.SUPABASE_DB_URL;
delete process.env.POSTGRES_URL;
delete process.env.SUPABASE_URL;
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
delete globalThis.__forgeniqLabSpendQuery;
process.env.RI_AI_EXECUTION_ENABLED = 'true';
process.env.RI_LAB_ANTHROPIC_MAX_USD = '0.75';
const closed = await guardLabAnthropicSpendBeforeCall({
  useCaseId: 'UC-RI-004',
  system: 's',
  user: 'short prompt',
  idempotencyKey: 'no-db',
  organisationId: 'org',
});
if (closed.ok || closed.code !== 'LAB_ANTHROPIC_BUDGET_ENFORCEMENT_FAILED') {
  failTest('fail_closed_without_ledger', JSON.stringify(closed));
} else pass('fail_closed_without_ledger');

const started = await resetAndStartEmbedded({ port: 54367 });
const adminUrl = started.adminUrl;
const embedded = started.embedded;
const admin = new pg.Client({ connectionString: adminUrl });
await admin.connect();
await admin.query(sql);

function clientQuery(client) {
  return async (text, params) => {
    const { rows } = await client.query(text, params);
    return rows[0];
  };
}
const one = async (text, params) => (await admin.query(text, params)).rows[0];

const a = new pg.Client({ connectionString: adminUrl });
const b = new pg.Client({ connectionString: adminUrl });
await a.connect();
await b.connect();

try {
  // ---------------------------------------------------------------- budget race, reconcile, idempotency
  const scope = {
    scopeKey: 'forgeniq-lab-anthropic',
    budgetUsd: 0.05,
    maxRequests: 8,
    reserveUsd: 0.04,
    useCaseId: 'UC-RI-004',
    organisationId: 'org-a',
  };
  const [first, second] = await Promise.all([
    reserveSharedLabSpend(clientQuery(a), { ...scope, idempotencyKey: 'instance-a' }),
    reserveSharedLabSpend(clientQuery(b), { ...scope, idempotencyKey: 'instance-b' }),
  ]);
  const oks = [first, second].filter((row) => row?.ok);
  const denied = [first, second].filter((row) => row && !row.ok);
  if (oks.length !== 1 || denied.length !== 1 || denied[0].code !== 'LAB_ANTHROPIC_BUDGET_EXCEEDED') {
    failTest('cross_instance_budget', JSON.stringify({ first, second }));
  } else pass('cross_instance_budget');

  const settled = await settleSharedLabSpend(clientQuery(a), {
    reservationId: oks[0].reservationId,
    actualUsd: 0.01,
    inputTokens: 100,
    outputTokens: 20,
    providerOk: false,
  });
  if (!settled?.ok || Math.abs(Number(settled.settledUsd) - 0.01) > 0.000001) {
    failTest('reconcile_failed_call', JSON.stringify(settled));
  } else pass('reconcile_failed_call');

  const third = await reserveSharedLabSpend(clientQuery(b), { ...scope, reserveUsd: 0.03, idempotencyKey: 'instance-c' });
  if (!third?.ok) failTest('remaining_after_reconcile', JSON.stringify(third));
  else pass('remaining_after_reconcile');

  const again = await reserveSharedLabSpend(clientQuery(a), { ...scope, reserveUsd: 0.03, idempotencyKey: 'instance-c' });
  if (!again?.ok || again.reused !== true) failTest('idempotent_reuse', JSON.stringify(again));
  else pass('idempotent_reuse');

  await settleSharedLabSpend(clientQuery(b), {
    reservationId: third.reservationId,
    actualUsd: 0.03,
    inputTokens: 10,
    outputTokens: 10,
    providerOk: true,
  });
  const afterSettle = await reserveSharedLabSpend(clientQuery(a), { ...scope, reserveUsd: 0.001, idempotencyKey: 'instance-c' });
  if (afterSettle?.code !== 'LAB_SPEND_ALREADY_SETTLED') failTest('duplicate_workflow_blocked', JSON.stringify(afterSettle));
  else pass('duplicate_workflow_blocked');

  const capped = await reserveSharedLabSpend(clientQuery(a), {
    scopeKey: 'request-cap',
    budgetUsd: 5,
    maxRequests: 1,
    reserveUsd: 0.01,
    useCaseId: 'UC-RI-008',
    idempotencyKey: 'req-1',
    organisationId: 'org-a',
  });
  const capped2 = await reserveSharedLabSpend(clientQuery(b), {
    scopeKey: 'request-cap',
    budgetUsd: 5,
    maxRequests: 1,
    reserveUsd: 0.01,
    useCaseId: 'UC-RI-008',
    idempotencyKey: 'req-2',
    organisationId: 'org-a',
  });
  if (!capped?.ok || capped2?.ok || capped2?.code !== 'LAB_ANTHROPIC_BUDGET_EXCEEDED') {
    failTest('shared_request_cap', JSON.stringify({ capped, capped2 }));
  } else pass('shared_request_cap');

  // ---------------------------------------------------------------- concurrency: 12 racers
  const racers = [];
  for (let i = 0; i < 12; i += 1) {
    const c = new pg.Client({ connectionString: adminUrl });
    await c.connect();
    racers.push(c);
  }
  try {
    const raceBudget = await Promise.all(
      racers.map((c, i) =>
        reserveSharedLabSpend(clientQuery(c), {
          scopeKey: 'race-budget',
          budgetUsd: 0.75,
          maxRequests: 50,
          reserveUsd: 0.1,
          useCaseId: 'UC-RI-005',
          idempotencyKey: `race-${i}`,
          organisationId: 'org-a',
        }),
      ),
    );
    const won = raceBudget.filter((r) => r?.ok).length;
    const acc = await one(`select reserved_usd, request_count from public.lab_ai_spend_accounts where scope_key='race-budget'`);
    if (won !== 7 || Number(acc.reserved_usd) > 0.75 + 1e-9 || Number(acc.request_count) !== 7) {
      failTest('concurrent_reservations_budget', JSON.stringify({ won, acc }));
    } else pass('concurrent_reservations_budget');

    const raceCount = await Promise.all(
      racers.map((c, i) =>
        reserveSharedLabSpend(clientQuery(c), {
          scopeKey: 'race-requests',
          budgetUsd: 5,
          maxRequests: 8,
          reserveUsd: 0.01,
          useCaseId: 'UC-RI-005',
          idempotencyKey: `race-${i}`,
          organisationId: 'org-a',
        }),
      ),
    );
    const wonCount = raceCount.filter((r) => r?.ok).length;
    if (wonCount !== 8) failTest('concurrent_reservations_request_cap', String(wonCount));
    else pass('max_request_count_enforced_under_race');
  } finally {
    await Promise.all(racers.map((c) => c.end()));
  }

  // ---------------------------------------------------------------- usage categories (Sonnet 5.5)
  const usage = {
    standardInputTokens: 1000,
    outputTokens: 500,
    cacheWrite5mTokens: 200,
    cacheWrite1hTokens: 100,
    cacheReadTokens: 4000,
  };
  const cost = estimateUsageCostUsd('claude-sonnet-5-5', usage);
  // 1000*2 + 500*10 + 200*2.5 + 100*4 + 4000*0.1 = 2000+5000+500+400+400 = 8300 -> $0.0083
  if (Math.abs(cost.totalUsd - 0.0083) > 1e-9) failTest('usage_cost_categories', JSON.stringify(cost));
  else pass('usage_cost_categories');

  const cat = await reserveSharedLabSpend(clientQuery(a), {
    scopeKey: 'pilot-cats',
    budgetUsd: 0.75,
    maxRequests: 8,
    reserveUsd: 0.09,
    useCaseId: 'UC-RI-005',
    idempotencyKey: 'cat-1',
    organisationId: 'org-a',
    model: 'claude-sonnet-5-5',
    pricingVersion: ANTHROPIC_PRICING_VERSION,
    reserveBasis: { inputTokensEstimate: 5000, maxOutputTokens: 8192 },
    providerWindowSeconds: 420,
  });
  const catSettled = await settleSharedLabSpend(clientQuery(b), {
    reservationId: cat.reservationId,
    actualUsd: cost.totalUsd,
    inputTokens: usage.standardInputTokens,
    outputTokens: usage.outputTokens,
    cacheWrite5mTokens: usage.cacheWrite5mTokens,
    cacheWrite1hTokens: usage.cacheWrite1hTokens,
    cacheReadTokens: usage.cacheReadTokens,
    providerRequestId: 'req_test_1',
    usageKnown: true,
    costBreakdown: cost,
    providerOk: true,
  });
  const catRow = await one(`select * from public.lab_ai_spend_reservations where id = $1`, [cat.reservationId]);
  const catAcc = await one(`select * from public.lab_ai_spend_accounts where scope_key='pilot-cats'`);
  const catOk =
    catSettled?.ok &&
    catRow.model === 'claude-sonnet-5-5' &&
    catRow.pricing_version === ANTHROPIC_PRICING_VERSION &&
    Number(catRow.reserve_usd) === 0.09 &&
    Number(catRow.actual_usd) === 0.0083 &&
    catRow.input_tokens === 1000 &&
    catRow.output_tokens === 500 &&
    catRow.cache_write_5m_tokens === 200 &&
    catRow.cache_write_1h_tokens === 100 &&
    catRow.cache_read_tokens === 4000 &&
    catRow.provider_request_id === 'req_test_1' &&
    catRow.usage_known === true &&
    catRow.cost_breakdown?.cacheReadUsd === 0.0004 &&
    catRow.reserve_basis?.maxOutputTokens === 8192 &&
    catRow.provider_deadline_at != null &&
    Number(catAcc.settled_usd) === 0.0083 &&
    Number(catAcc.reserved_usd) === 0 &&
    Number(catAcc.cache_write_tokens) === 300 &&
    Number(catAcc.cache_read_tokens) === 4000 &&
    Number(catSettled.releasedUnusedUsd) === 0.0817;
  if (!catOk) failTest('ledger_usage_categories', JSON.stringify({ catSettled, catRow, catAcc }));
  else pass('ledger_usage_categories');

  // ---------------------------------------------------------------- historical rows are not repriced
  await admin.query(
    `insert into public.lab_ai_spend_accounts (scope_key, budget_usd, max_requests) values ('hist', 0.75, 8)
       on conflict do nothing`,
  );
  await admin.query(
    `insert into public.lab_ai_spend_reservations (scope_key, use_case_id, idempotency_key, status, reserve_usd, actual_usd, input_tokens, output_tokens, provider_ok, settled_at)
     values ('hist', 'UC-RI-005', 'pre-migration', 'SETTLED', 0.05, 0.0300, 2000, 1500, true, now())`,
  );
  const legacy = await reserveSharedLabSpend(clientQuery(a), {
    scopeKey: 'hist',
    budgetUsd: 0.75,
    maxRequests: 8,
    reserveUsd: 0.08,
    useCaseId: 'UC-RI-005',
    idempotencyKey: 'legacy-45',
    organisationId: 'org-a',
    model: 'claude-sonnet-4-5',
    pricingVersion: 'legacy-sonnet-4-5-list',
  });
  await settleSharedLabSpend(clientQuery(a), {
    reservationId: legacy.reservationId,
    actualUsd: 0.0105,
    inputTokens: 1000,
    outputTokens: 500,
    providerOk: true,
  });
  const modern = await reserveSharedLabSpend(clientQuery(b), {
    scopeKey: 'hist',
    budgetUsd: 0.75,
    maxRequests: 8,
    reserveUsd: 0.08,
    useCaseId: 'UC-RI-005',
    idempotencyKey: 'modern-55',
    organisationId: 'org-a',
    model: 'claude-sonnet-5-5',
    pricingVersion: ANTHROPIC_PRICING_VERSION,
  });
  await settleSharedLabSpend(clientQuery(b), {
    reservationId: modern.reservationId,
    actualUsd: 0.007,
    inputTokens: 1000,
    outputTokens: 500,
    providerOk: true,
  });
  const histRows = (await admin.query(`select idempotency_key, model, pricing_version, actual_usd from public.lab_ai_spend_reservations where scope_key='hist' order by idempotency_key`)).rows;
  const byKey = Object.fromEntries(histRows.map((r) => [r.idempotency_key, r]));
  if (
    byKey['pre-migration'].model !== null ||
    Number(byKey['pre-migration'].actual_usd) !== 0.03 ||
    byKey['legacy-45'].model !== 'claude-sonnet-4-5' ||
    Number(byKey['legacy-45'].actual_usd) !== 0.0105 ||
    byKey['modern-55'].model !== 'claude-sonnet-5-5'
  ) {
    failTest('historical_not_repriced', JSON.stringify(histRows));
  } else pass('historical_not_repriced');

  // ---------------------------------------------------------------- unknown provider outcome charges the full reserve
  const unk = await reserveSharedLabSpend(clientQuery(a), {
    scopeKey: 'unknown-outcome',
    budgetUsd: 0.75,
    maxRequests: 8,
    reserveUsd: 0.09,
    useCaseId: 'UC-RI-005',
    idempotencyKey: 'timeout-1',
    organisationId: 'org-a',
    model: 'claude-sonnet-5-5',
  });
  const unkSettled = await settleSharedLabSpend(clientQuery(a), {
    reservationId: unk.reservationId,
    actualUsd: 0,
    inputTokens: 0,
    outputTokens: 0,
    usageKnown: false,
    providerOk: false,
  });
  const unkRow = await one(`select status, actual_usd, usage_known, input_tokens from public.lab_ai_spend_reservations where id=$1`, [unk.reservationId]);
  if (!unkSettled?.ok || Number(unkSettled.actualUsd) !== 0.09 || unkRow.usage_known !== false || unkRow.status !== 'FAILED' || unkRow.input_tokens !== null) {
    failTest('unknown_outcome_charges_reserve', JSON.stringify({ unkSettled, unkRow }));
  } else pass('unknown_outcome_charges_reserve');

  // ---------------------------------------------------------------- spend guard end to end (ledger-backed)
  globalThis.__forgeniqLabSpendQuery = clientQuery(a);
  process.env.RI_LAB_SPEND_SCOPE = 'guard-e2e';
  process.env.RI_LAB_ANTHROPIC_MAX_REQUESTS = '8';
  process.env.RI_LAB_ANTHROPIC_MAX_USD = '0.75';
  const guard = await guardLabAnthropicSpendBeforeCall({
    useCaseId: 'UC-RI-005',
    system: 'system prompt',
    user: 'x'.repeat(30_000),
    idempotencyKey: 'guard-1',
    organisationId: 'org-a',
    model: 'claude-sonnet-5-5',
    timeoutMs: 120_000,
  });
  const guardRow = guard.ok ? await one(`select * from public.lab_ai_spend_reservations where id=$1`, [guard.reservationId]) : null;
  // 30,013 chars / 3 = 10,005 tokens; 10,005 * $4/M + 8192 * $10/M = 0.04002 + 0.08192
  if (!guard.ok || Math.abs(guard.reserveUsd - 0.12194) > 0.0001 || guardRow.model !== 'claude-sonnet-5-5' || guardRow.reserve_basis?.maxOutputTokens !== 8192) {
    failTest('guard_reserves_worst_case', JSON.stringify({ guard: { ok: guard.ok, reserveUsd: guard.reserveUsd, code: guard.code }, guardRow }));
  } else pass('guard_reserves_worst_case');
  const finalized = await finalizeLabSpendAfterCall(
    guard,
    guard.slotKey,
    {
      ok: true,
      text: '{}',
      requestId: 'req_guard_1',
      responseReceived: true,
      usageKnown: true,
      usage: { standardInputTokens: 9000, outputTokens: 2000, cacheWrite5mTokens: 0, cacheWrite1hTokens: 0, cacheReadTokens: 0 },
    },
    guard.reserveUsd,
  );
  const finRow = await one(`select * from public.lab_ai_spend_reservations where id=$1`, [guard.reservationId]);
  if (
    !finalized.ok ||
    Number(finRow.actual_usd) !== 0.038 ||
    finRow.provider_request_id !== 'req_guard_1' ||
    finalized.spendAudit.settledEstimatedUsd !== 0.038 ||
    finalized.spendAudit.pricingVersion !== ANTHROPIC_PRICING_VERSION
  ) {
    failTest('guard_settles_actual_usage', JSON.stringify({ finalized, finRow }));
  } else pass('guard_settles_actual_usage');

  const guardTimeout = await guardLabAnthropicSpendBeforeCall({
    useCaseId: 'UC-RI-005',
    system: 's',
    user: 'short',
    idempotencyKey: 'guard-timeout',
    organisationId: 'org-a',
    model: 'claude-sonnet-5-5',
    timeoutMs: 60_000,
  });
  const timedOut = await finalizeLabSpendAfterCall(
    guardTimeout,
    guardTimeout.slotKey,
    { ok: false, code: 'AI_TIMEOUT', usageKnown: false },
    guardTimeout.reserveUsd,
  );
  const toRow = await one(`select actual_usd, reserve_usd, usage_known from public.lab_ai_spend_reservations where id=$1`, [guardTimeout.reservationId]);
  if (!timedOut.ok || Number(toRow.actual_usd) !== Number(toRow.reserve_usd) || toRow.usage_known !== false) {
    failTest('guard_timeout_assumes_max', JSON.stringify({ timedOut, toRow }));
  } else pass('guard_timeout_assumes_max');

  const unpriced = await guardLabAnthropicSpendBeforeCall({
    useCaseId: 'UC-RI-005',
    system: 's',
    user: 'short',
    idempotencyKey: 'guard-unpriced',
    organisationId: 'org-a',
    model: 'claude-future-9',
    timeoutMs: 60_000,
  });
  if (unpriced.ok || unpriced.failClosed !== true) failTest('unpriced_model_fails_closed', JSON.stringify(unpriced));
  else pass('unpriced_model_fails_closed');
  delete globalThis.__forgeniqLabSpendQuery;
  delete process.env.RI_LAB_SPEND_SCOPE;

  // ---------------------------------------------------------------- operator recovery
  const recover = (client, id, args) =>
    clientQuery(client)(
      `select public.release_abandoned_lab_ai_reservation($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) as result`,
      [id, args.actor ?? 'uat-operator', args.reason ?? 'Process terminated before settle; provider outcome unknown.', args.minAge ?? 180,
        args.resolution ?? 'ASSUME_MAX', args.actualUsd ?? null, args.evidence ?? null, args.input ?? null, args.output ?? null, null, null],
    );
  const hold = async (key, reserveUsd = 0.05, scopeKey = 'recovery-probe') =>
    reserveSharedLabSpend(clientQuery(a), {
      scopeKey,
      budgetUsd: 0.5,
      maxRequests: 8,
      reserveUsd,
      useCaseId: 'UC-RI-005',
      idempotencyKey: key,
      organisationId: 'org-a',
      model: 'claude-sonnet-5-5',
      providerWindowSeconds: 420,
    });
  const age = (id, { createdAgo = '30 minutes', deadlineAgo = '20 minutes' } = {}) =>
    admin.query(
      `update public.lab_ai_spend_reservations set created_at = now() - $2::interval, provider_deadline_at = now() - $3::interval where id = $1`,
      [id, createdAgo, deadlineAgo],
    );

  const held = await hold('crashed-call');
  const unauth = await recover(b, held.reservationId, {});
  if (unauth?.result?.code !== 'LAB_SPEND_RECOVERY_NOT_AUTHORISED') failTest('recovery_requires_operator', JSON.stringify(unauth));
  else pass('recovery_requires_operator');

  await admin.query(`insert into public.lab_ai_spend_operators (actor, authorised_by) values ('uat-operator', 'uat-admin')`);
  const tooSoon = await recover(b, held.reservationId, {});
  if (tooSoon?.result?.code !== 'LAB_SPEND_RECOVERY_TOO_RECENT') failTest('recovery_inflight', JSON.stringify(tooSoon));
  else pass('recovery_inflight');

  await admin.query(`update public.lab_ai_spend_reservations set created_at = now() - interval '10 minutes' where id = $1`, [held.reservationId]);
  const windowOpen = await recover(b, held.reservationId, {});
  if (windowOpen?.result?.code !== 'LAB_SPEND_RECOVERY_PROVIDER_MAY_BE_ACTIVE') failTest('recovery_provider_window', JSON.stringify(windowOpen));
  else pass('recovery_provider_window');

  await age(held.reservationId);
  const badReason = await recover(b, held.reservationId, { reason: 'too short' });
  const noEvidence = await recover(b, held.reservationId, { resolution: 'VERIFIED_USAGE', actualUsd: 0.01 });
  if (badReason?.result?.code !== 'LAB_SPEND_RECOVERY_REJECTED' || noEvidence?.result?.code !== 'LAB_SPEND_RECOVERY_REJECTED') {
    failTest('recovery_needs_reason_and_evidence', JSON.stringify({ badReason, noEvidence }));
  } else pass('recovery_needs_reason_and_evidence');

  const released = await recover(b, held.reservationId, {});
  const secondRecovery = await recover(a, held.reservationId, {});
  const audit = await one(`select count(*)::int as n, max(resolution) as resolution, max(provider_deadline_at) is not null as has_deadline from public.lab_ai_spend_recoveries where reservation_id = $1`, [held.reservationId]);
  const account = await one(`select reserved_usd, settled_usd, request_count from public.lab_ai_spend_accounts where scope_key = 'recovery-probe'`);
  if (!released?.result?.ok || released.result.resolution !== 'ASSUME_MAX' || Number(released.result.settledActualUsd) !== 0.05 || Number(released.result.releasedReserveUsd) !== 0) {
    failTest('recovery_assume_max', JSON.stringify(released));
  } else if (secondRecovery?.result?.code !== 'LAB_SPEND_RECOVERY_NOT_OPEN' || audit.n !== 1 || audit.resolution !== 'ASSUME_MAX' || !audit.has_deadline) {
    failTest('recovery_audit_once', JSON.stringify({ secondRecovery, audit }));
  } else if (account.request_count !== 1 || Number(account.reserved_usd) !== 0 || Number(account.settled_usd) !== 0.05) {
    failTest('recovery_keeps_request_and_spend', JSON.stringify(account));
  } else pass('recovery_audited');

  const held2 = await hold('crashed-call-2', 0.06);
  await age(held2.reservationId);
  const verified = await recover(b, held2.reservationId, {
    resolution: 'VERIFIED_USAGE',
    actualUsd: 0.011,
    evidence: 'Anthropic Console usage export shows no billed request for this id.',
    input: 0,
    output: 0,
  });
  const account2 = await one(`select reserved_usd, settled_usd, request_count from public.lab_ai_spend_accounts where scope_key = 'recovery-probe'`);
  if (!verified?.result?.ok || Number(verified.result.releasedReserveUsd) !== 0.049 || Number(account2.settled_usd) !== 0.061 || Number(account2.reserved_usd) !== 0 || account2.request_count !== 2) {
    failTest('recovery_verified_usage', JSON.stringify({ verified, account2 }));
  } else pass('recovery_verified_usage');

  const held3 = await hold('crashed-call-3', 0.04);
  await age(held3.reservationId);
  const legacyCall = await clientQuery(b)(
    `select public.release_abandoned_lab_ai_reservation($1, $2, $3, $4) as result`,
    [held3.reservationId, 'uat-operator', 'Four-argument call from the previous release; must not return money.', 180],
  );
  if (!legacyCall?.result?.ok || legacyCall.result.resolution !== 'ASSUME_MAX' || Number(legacyCall.result.releasedReserveUsd) !== 0) {
    failTest('recovery_default_is_safe', JSON.stringify(legacyCall));
  } else pass('recovery_default_is_safe');

  await admin.query(`update public.lab_ai_spend_operators set revoked_at = now() where actor = 'uat-operator'`);
  const held4 = await hold('crashed-call-4', 0.03);
  await age(held4.reservationId);
  const revoked = await recover(b, held4.reservationId, {});
  if (revoked?.result?.code !== 'LAB_SPEND_RECOVERY_NOT_AUTHORISED') failTest('recovery_revoked_operator', JSON.stringify(revoked));
  else pass('recovery_revoked_operator');

  // ---------------------------------------------------------------- grants and forced RLS
  const rls = await one(
    `select bool_and(c.relforcerowsecurity and c.relrowsecurity) as forced
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname in ('lab_ai_spend_accounts','lab_ai_spend_reservations','lab_ai_spend_recoveries','lab_ai_spend_operators')`,
  );
  if (rls.forced !== true) failTest('forced_rls', JSON.stringify(rls));
  else pass('forced_rls');
  const publicExec = await one(
    `select count(*)::int as n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
      where ns.nspname = 'public'
        and p.proname in ('reserve_lab_ai_spend','settle_lab_ai_spend','release_abandoned_lab_ai_reservation')
        and has_function_privilege('public', p.oid, 'execute')`,
  );
  const overloads = await one(
    `select count(*)::int as n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
      where ns.nspname = 'public' and p.proname in ('reserve_lab_ai_spend','settle_lab_ai_spend','release_abandoned_lab_ai_reservation')`,
  );
  if (publicExec.n !== 0) failTest('execute_withheld_from_public', JSON.stringify(publicExec));
  else if (overloads.n !== 3) failTest('single_function_signatures', JSON.stringify(overloads));
  else pass('execute_withheld_and_single_signatures');
} finally {
  await a.end();
  await b.end();
  await admin.end();
  await stopEmbedded(embedded);
}

if (fail) {
  console.error(`\nacceptance-ri-shared-spend-guard: FAIL (${fail})\n`);
  process.exit(1);
}
console.log('\nacceptance-ri-shared-spend-guard: PASS\n');
