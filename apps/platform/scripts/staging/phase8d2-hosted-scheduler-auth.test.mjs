#!/usr/bin/env node
/**
 * Phase 8D.2 — hosted scheduler auth (fail-closed, CRON_SECRET Bearer only).
 */
import { assertHostedSchedulerRequestAuth } from '../../lib/ri/ingestion/ops/hosted-scheduler-run.mjs';

const secret = 'test-cron-secret-min-16-chars';

function run(label, fn) {
  try {
    fn();
    console.log(`PASS: ${label}`);
    return true;
  } catch (e) {
    console.error(`FAIL: ${label} — ${e.message}`);
    return false;
  }
}

function expectUnauthorized(fn) {
  let threw = false;
  try {
    fn();
  } catch (e) {
    threw = e.message === 'hosted_scheduler_unauthorized' || e.message === 'hosted_scheduler_cron_secret_missing_or_weak';
  }
  if (!threw) throw new Error('expected fail-closed');
}

let ok = true;

ok =
  run('missing server CRON_SECRET fails closed', () => {
    delete process.env.CRON_SECRET;
    try {
      assertHostedSchedulerRequestAuth({
        invocationKind: 'VERCEL_CRON',
        cronSecretFromRequest: secret,
      });
      throw new Error('expected missing secret error');
    } catch (e) {
      if (e.message !== 'hosted_scheduler_cron_secret_missing_or_weak') throw e;
    }
    process.env.CRON_SECRET = secret;
  }) && ok;

ok =
  run('unauthenticated request rejected', () => {
    expectUnauthorized(() =>
      assertHostedSchedulerRequestAuth({ invocationKind: 'MANUAL_HOSTED' }),
    );
  }) && ok;

ok =
  run('incorrect Bearer rejected', () => {
    expectUnauthorized(() =>
      assertHostedSchedulerRequestAuth({
        invocationKind: 'MANUAL_HOSTED',
        cronSecretFromRequest: 'wrong-bearer-token-value',
      }),
    );
  }) && ok;

ok =
  run('spoofed x-vercel-cron label without Bearer rejected (VERCEL_CRON kind)', () => {
    expectUnauthorized(() =>
      assertHostedSchedulerRequestAuth({ invocationKind: 'VERCEL_CRON' }),
    );
  }) && ok;

ok =
  run('valid Bearer succeeds for MANUAL_HOSTED', () => {
    assertHostedSchedulerRequestAuth({
      invocationKind: 'MANUAL_HOSTED',
      cronSecretFromRequest: secret,
    });
  }) && ok;

ok =
  run('valid Bearer succeeds for VERCEL_CRON audit label', () => {
    assertHostedSchedulerRequestAuth({
      invocationKind: 'VERCEL_CRON',
      cronSecretFromRequest: secret,
    });
  }) && ok;

process.exit(ok ? 0 : 1);
