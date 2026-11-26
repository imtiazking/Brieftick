#!/usr/bin/env node
/**
 * Shared spend ledger across two database clients (simulated serverless instances).
 * No provider calls.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { resetAndStartEmbedded, stopEmbedded } from './local-db/harness.mjs';
import { reserveSharedLabSpend, settleSharedLabSpend } from '../lib/ri/ai/lab-shared-spend.mjs';
import { guardLabAnthropicSpendBeforeCall } from '../lib/ri/ai/lab-anthropic-spend-guard.mjs';

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'supabase', 'migrations');
const sql = [
  '20261126013000_lab_ai_shared_spend_guard.sql',
  '20261126020000_lab_ai_spend_reservation_recovery.sql',
].map((name) => readFileSync(join(migrationsDir, name), 'utf8')).join('\n');
if (
  !sql.includes('from anon') ||
  !sql.includes('from authenticated') ||
  !sql.includes('force row level security')
) {
  console.error('FAIL: client_execute_revoked — ledger functions must be withheld from anon and authenticated');
  process.exit(1);
}

let fail = 0;
const pass = (id) => console.log(`PASS: ${id}`);
const failTest = (id, detail) => {
  fail += 1;
  console.error(`FAIL: ${id} — ${detail}`);
};

delete process.env.RI_LAB_SPEND_GUARD_MODE;
delete process.env.RI_LAB_SPEND_DATABASE_URL;
delete process.env.DATABASE_URL;
delete process.env.SUPABASE_DB_URL;
delete process.env.POSTGRES_URL;
delete process.env.SUPABASE_URL;
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
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

const a = new pg.Client({ connectionString: adminUrl });
const b = new pg.Client({ connectionString: adminUrl });
await a.connect();
await b.connect();

try {
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

  const third = await reserveSharedLabSpend(clientQuery(b), {
    ...scope,
    reserveUsd: 0.03,
    idempotencyKey: 'instance-c',
  });
  if (!third?.ok) failTest('remaining_after_reconcile', JSON.stringify(third));
  else pass('remaining_after_reconcile');

  const again = await reserveSharedLabSpend(clientQuery(a), {
    ...scope,
    reserveUsd: 0.03,
    idempotencyKey: 'instance-c',
  });
  if (!again?.ok || again.reused !== true) failTest('idempotent_reuse', JSON.stringify(again));
  else pass('idempotent_reuse');

  await settleSharedLabSpend(clientQuery(b), {
    reservationId: third.reservationId,
    actualUsd: 0.03,
    inputTokens: 10,
    outputTokens: 10,
    providerOk: true,
  });
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

  const held = await reserveSharedLabSpend(clientQuery(a), {
    scopeKey: 'recovery-probe',
    budgetUsd: 0.2,
    maxRequests: 4,
    reserveUsd: 0.05,
    useCaseId: 'UC-RI-005',
    idempotencyKey: 'crashed-call',
    organisationId: 'org-a',
  });
  const tooSoon = await clientQuery(b)(
    `select public.release_abandoned_lab_ai_reservation($1, $2, $3, $4) as result`,
    [held.reservationId, 'uat-operator', 'Process terminated before settle. No provider usage was observed.', 180],
  );
  if (tooSoon?.result?.code !== 'LAB_SPEND_RECOVERY_TOO_RECENT') {
    failTest('recovery_inflight', JSON.stringify(tooSoon));
  } else pass('recovery_inflight');

  await clientQuery(a)(`update public.lab_ai_spend_reservations set created_at = now() - interval '10 minutes' where id = $1`, [
    held.reservationId,
  ]);
  const released = await clientQuery(b)(
    `select public.release_abandoned_lab_ai_reservation($1, $2, $3, $4) as result`,
    [held.reservationId, 'uat-operator', 'Process terminated before settle. No provider usage was observed.', 180],
  );
  const secondRelease = await clientQuery(a)(
    `select public.release_abandoned_lab_ai_reservation($1, $2, $3, $4) as result`,
    [held.reservationId, 'uat-operator', 'Process terminated before settle. No provider usage was observed.', 180],
  );
  const audit = await clientQuery(a)(
    `select count(*)::int as n from public.lab_ai_spend_recoveries where reservation_id = $1`,
    [held.reservationId],
  );
  const account = await clientQuery(b)(
    `select reserved_usd, request_count from public.lab_ai_spend_accounts where scope_key = 'recovery-probe'`,
  );
  if (!released?.result?.ok || Number(released.result.requestCount) !== 1 || Number(released.result.reservedUsd) !== 0) {
    failTest('recovery_releases_hold', JSON.stringify(released));
  } else if (secondRelease?.result?.code !== 'LAB_SPEND_RECOVERY_NOT_OPEN' || Number(audit?.n) !== 1) {
    failTest('recovery_audit_once', JSON.stringify({ secondRelease, audit }));
  } else if (Number(account?.request_count) !== 1 || Number(account?.reserved_usd) !== 0) {
    failTest('recovery_keeps_request', JSON.stringify(account));
  } else pass('recovery_audited');
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
