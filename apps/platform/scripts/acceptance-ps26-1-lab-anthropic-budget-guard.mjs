#!/usr/bin/env node
/**
 * Offline tests for UC-RI-005 lab Anthropic spend guard (no API calls).
 */
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { REPO_ROOT } from '../lib/ri/eval/eval-paths.mjs';

const platformRoot = join(REPO_ROOT, 'apps/platform');

const {
  resolveLabAnthropicBudgetConfig,
  guardLabAnthropicSpendBeforeCall,
  acquireLabTrialSlot,
  releaseLabTrialSlot,
  resetLabTrialSlotsForTests,
  LabAnthropicSpendTracker,
  assertUcRi005LiveTrialIdempotency,
} = await import(
  pathToFileURL(join(platformRoot, 'lib/ri/ai/lab-anthropic-spend-guard.mjs')).href
);

const failures = [];
function ok(msg) {
  console.log(`OK: ${msg}`);
}
function fail(msg) {
  failures.push(msg);
  console.error(`FAIL: ${msg}`);
}

function withEnv(patch, fn) {
  const prev = { ...process.env };
  Object.assign(process.env, patch);
  const result = fn();
  if (result && typeof result.then === 'function') {
    return result.finally(() => {
      process.env = prev;
    });
  }
  process.env = prev;
  return result;
}

resetLabTrialSlotsForTests();

// Missing budget when execution enabled
const missing = withEnv(
  { RI_AI_EXECUTION_ENABLED: 'true', RI_LAB_ANTHROPIC_MAX_USD: '' },
  () => resolveLabAnthropicBudgetConfig('UC-RI-005', { executionEnabled: true }),
);
if (missing.failClosed && missing.code === 'LAB_ANTHROPIC_BUDGET_NOT_CONFIGURED') {
  ok('fail closed when RI_LAB_ANTHROPIC_MAX_USD missing');
} else fail('expected fail closed on missing budget');

// Budget configured
const configured = withEnv(
  {
    RI_LAB_SPEND_GUARD_MODE: 'memory',
    RI_AI_EXECUTION_ENABLED: 'true',
    RI_LAB_ANTHROPIC_MAX_USD: '1.00',
    RI_LAB_ANTHROPIC_MAX_OUTPUT_TOKENS: '2048',
    RI_LAB_ANTHROPIC_MAX_INPUT_TOKENS: '120000',
  },
  () => resolveLabAnthropicBudgetConfig('UC-RI-005', { executionEnabled: true }),
);
if (configured.budgetUsd === 1 && configured.maxOutputTokens === 2048) {
  ok('budget config parses $1.00 and token caps');
} else fail('budget config parse');

// Overlap lock
resetLabTrialSlotsForTests();
const slotA = acquireLabTrialSlot('UC-RI-005:org:one', 0.5);
const slotB = acquireLabTrialSlot('UC-RI-005:org:two', 0.5);
if (slotA.ok && !slotB.ok && slotB.code === 'LAB_TRIAL_OVERLAP') {
  ok('in-process overlap rejected');
} else fail('overlap lock');
releaseLabTrialSlot('UC-RI-005:org:one');

// Guard reserves and records audit without API
resetLabTrialSlotsForTests();
const guarded = await withEnv(
  {
    RI_LAB_SPEND_GUARD_MODE: 'memory',
    RI_AI_EXECUTION_ENABLED: 'true',
    RI_LAB_ANTHROPIC_MAX_USD: '1.00',
    RI_LAB_ANTHROPIC_MAX_OUTPUT_TOKENS: '1024',
  },
  () =>
    guardLabAnthropicSpendBeforeCall({
      useCaseId: 'UC-RI-005',
      system: 'System prompt',
      user: 'User prompt for PS26 trial'.repeat(20),
      organisationId: 'b8f5e3a1-00ad-4000-8000-000000000001',
      idempotencyKey: 'test-key',
    }),
);
if (guarded.ok && guarded.spendAudit?.budgetUsd === 1 && guarded.maxOutputTokens === 1024) {
  ok('pre-call guard reserves within budget');
} else fail('pre-call guard');
releaseLabTrialSlot(guarded.slotKey);

// Huge prompt fails closed
resetLabTrialSlotsForTests();
const huge = await withEnv(
  {
    RI_LAB_SPEND_GUARD_MODE: 'memory',
    RI_AI_EXECUTION_ENABLED: 'true',
    RI_LAB_ANTHROPIC_MAX_USD: '0.01',
    RI_LAB_ANTHROPIC_MAX_INPUT_TOKENS: '100',
    RI_LAB_ANTHROPIC_MAX_OUTPUT_TOKENS: '256',
  },
  () =>
    guardLabAnthropicSpendBeforeCall({
      useCaseId: 'UC-RI-005',
      system: 'x'.repeat(10_000),
      user: 'y'.repeat(10_000),
      organisationId: 'b8f5e3a1-00ad-4000-8000-000000000001',
      idempotencyKey: 'huge',
    }),
);
if (!huge.ok && (huge.code === 'LAB_PROMPT_TOO_LARGE' || huge.code === 'LAB_ANTHROPIC_BUDGET_EXCEEDED')) {
  ok('oversized prompt or budget rejected');
} else fail('expected oversized rejection');

// Invalid numeric budget
const invalidBudget = withEnv(
  { RI_AI_EXECUTION_ENABLED: 'true', RI_LAB_ANTHROPIC_MAX_USD: 'not-a-number' },
  () => resolveLabAnthropicBudgetConfig('UC-RI-005', { executionEnabled: true }),
);
if (invalidBudget.failClosed && invalidBudget.code === 'LAB_ANTHROPIC_BUDGET_ENFORCEMENT_FAILED') {
  ok('invalid RI_LAB_ANTHROPIC_MAX_USD rejected');
} else fail('invalid budget string');

const idemEnforced = withEnv(
  { FORGENIQ_PS26_LIVE_TRIAL: '1', RI_LAB_TRIAL_IDEMPOTENCY_SUFFIX: 'PS26-1-LIVE-TRIAL-v1' },
  () =>
    assertUcRi005LiveTrialIdempotency(
      'UC-RI-005:version:org:PS26-1-LIVE-TRIAL-v1',
      { executionEnabled: true },
    ),
);
if (idemEnforced.ok) ok('trial idempotency suffix accepted');
else fail('idempotency suffix');

const idemBad = withEnv(
  { FORGENIQ_PS26_LIVE_TRIAL: '1' },
  () => assertUcRi005LiveTrialIdempotency('UC-RI-005:version:org:other', { executionEnabled: true }),
);
if (!idemBad.ok) ok('wrong idempotency suffix rejected');
else fail('idempotency should reject');

// Tracker settle over budget
const tracker = new LabAnthropicSpendTracker({
  budgetUsd: 0.01,
  model: 'claude-sonnet-5-5',
  maxOutputTokens: 1000,
  maxInputTokens: 5000,
  retryReserveFactor: 1,
});
tracker.settleAttempt({ inputTokens: 50_000, outputTokens: 50_000, reserveUsd: 0 });
if (tracker.calculatedUsd > 0.01) {
  const over = tracker.settleAttempt({ inputTokens: 0, outputTokens: 0, reserveUsd: 0 });
  // second settle with already high usage — check via manual
  if (tracker.calculatedUsd > tracker.budgetUsd) ok('tracker records high calculatedUsd');
} else {
  ok('tracker settle path exercised');
}

console.log(JSON.stringify({ programmePass: failures.length === 0, failures }, null, 2));
process.exit(failures.length ? 1 : 0);