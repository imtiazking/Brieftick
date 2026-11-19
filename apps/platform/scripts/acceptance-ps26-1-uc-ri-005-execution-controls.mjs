#!/usr/bin/env node
/**
 * UC-RI-005 execution controls integration (offline): spend guard + idempotency + no auto-materialisation signals.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { REPO_ROOT } from '../lib/ri/eval/eval-paths.mjs';

const platformRoot = join(REPO_ROOT, 'apps/platform');
const failures = [];
const ok = (m) => console.log(`OK: ${m}`);
const fail = (m) => {
  failures.push(m);
  console.error(`FAIL: ${m}`);
};

const {
  resolveLabAnthropicBudgetConfig,
  acquireLabTrialSlot,
  releaseLabTrialSlot,
  resetLabTrialSlotsForTests,
  assertUcRi005LiveTrialIdempotency,
} = await import(pathToFileURL(join(platformRoot, 'lib/ri/ai/lab-anthropic-spend-guard.mjs')).href);

const ucPath = join(REPO_ROOT, 'docs/eval/UC-RI-005-PS26-1-CONTROLLED-EXTRACTION-TEST.json');
const uc = JSON.parse(readFileSync(ucPath, 'utf8'));
if (uc.executionAuthorization?.authorized === true) fail('executionAuthorization must not be true offline');
else ok('executionAuthorization not granted in eval artefact');

if (uc.obligationMaterialisationExecuted === true) fail('obligationMaterialisationExecuted must be false');
else ok('no obligation materialisation executed (offline artefact)');

function withEnv(patch, fn) {
  const prev = { ...process.env };
  Object.assign(process.env, patch);
  try {
    return fn();
  } finally {
    process.env = prev;
  }
}

const missing = withEnv(
  { RI_AI_EXECUTION_ENABLED: 'true', RI_LAB_ANTHROPIC_MAX_USD: '' },
  () => resolveLabAnthropicBudgetConfig('UC-RI-005', { executionEnabled: true }),
);
if (!(missing.failClosed && missing.code === 'LAB_ANTHROPIC_BUDGET_NOT_CONFIGURED')) {
  fail('missing budget');
} else ok('missing budget fail-closed');

const trial = withEnv(
  {
    RI_AI_EXECUTION_ENABLED: 'true',
    RI_LAB_ANTHROPIC_MAX_USD: '1.00',
    FORGENIQ_PS26_LIVE_TRIAL: '1',
  },
  () => resolveLabAnthropicBudgetConfig('UC-RI-005', { executionEnabled: true }),
);
if (trial.budgetUsd !== 1) fail('trial budget parse');
else ok('USD 1.00 trial budget config (estimate guard — not invoice cap)');

resetLabTrialSlotsForTests();
const dup = acquireLabTrialSlot('UC-RI-005:dup', 0.5);
const dup2 = acquireLabTrialSlot('UC-RI-005:dup', 0.5);
if (dup.ok && dup2.ok && dup2.reused) ok('duplicate request reuses in-flight slot (same process idempotency)');
else fail('duplicate same-key slot reuse');
releaseLabTrialSlot('UC-RI-005:dup');

const concA = acquireLabTrialSlot('UC-RI-005:org-a', 0.5);
const concB = acquireLabTrialSlot('UC-RI-005:org-b', 0.5);
if (concA.ok && !concB.ok) ok('concurrent second org rejected (single in-process trial slot)');
else fail('concurrent overlap');
releaseLabTrialSlot('UC-RI-005:org-a');

const limitsPath = join(REPO_ROOT, 'docs/eval/LAB-ANTHROPIC-BUDGET-GUARD-LIMITATIONS.json');
const limits = JSON.parse(readFileSync(limitsPath, 'utf8'));
if (!limits.remaining?.multiInstanceServerlessRace) fail('limitations must document multi-instance race');
else ok('multi-instance concurrency risk documented');

const out = join(REPO_ROOT, 'docs/eval/PS26-1-UC-RI-005-EXECUTION-CONTROLS.json');
writeFileSync(
  out,
  JSON.stringify(
    {
      capturedAt: new Date().toISOString(),
      programmePass: failures.length === 0,
      budgetNote: 'RI_LAB_ANTHROPIC_MAX_USD is an estimate guard — not a guaranteed Anthropic invoice ceiling',
      operatorControlWhenMultiInstance:
        'Single concurrent UC-RI-005 trial per deployment — scale to one instance or operator-enforced pause',
      failures,
    },
    null,
    2,
  ),
);
console.log(JSON.stringify({ ok: failures.length === 0, failures }, null, 2));
process.exit(failures.length ? 1 : 0);