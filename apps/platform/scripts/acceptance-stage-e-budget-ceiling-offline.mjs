#!/usr/bin/env node
/**
 * Stage E — offline budget ceiling and override precedence (no live Anthropic).
 */
import { EvalSpendTracker, V2_EVAL_BUDGET_USD, estimateEvalCaseReserveUsd } from '../lib/ri/reasoner/anthropic-eval-budget.mjs';

const failures = [];
const ok = (m) => console.log(`OK: ${m}`);
const fail = (m) => {
  failures.push(m);
  console.error(`FAIL: ${m}`);
};

const defaultTracker = new EvalSpendTracker({ budgetUsd: V2_EVAL_BUDGET_USD });
if (defaultTracker.budgetUsd !== 10) fail(`default budget expected 10 got ${defaultTracker.budgetUsd}`);
else ok('default V2_EVAL_BUDGET_USD is 10');

const overrideTracker = new EvalSpendTracker({ budgetUsd: 0.05 });
if (overrideTracker.budgetUsd !== 0.05) fail('constructor budgetUsd override not honoured');
else ok('run options budgetUsd override honoured via EvalSpendTracker');

const reserve = estimateEvalCaseReserveUsd('claude-haiku-5-5', 8000, { maxOutputTokens: 8192, maxRetryOutputTokens: 16384 });
const tight = new EvalSpendTracker({ budgetUsd: reserve * 0.5 });
const allowed = tight.reserveEstimate(reserve);
if (allowed) fail('reserve should fail when budget below single-case reserve');
else {
  ok('budget_ceiling stops reserve when case exceeds ceiling');
  if (tight.stopReason !== 'budget_ceiling') fail(`stopReason expected budget_ceiling got ${tight.stopReason}`);
  else ok('stopReason is budget_ceiling');
}

const capped = new EvalSpendTracker({ budgetUsd: 10, model: 'claude-haiku-5-5' });
capped.inputTokens = 50_000_000;
capped.outputTokens = 50_000_000;
capped.finalizeCalculated();
if (capped.calculatedUsd <= 10) fail('finalizeCalculated should exceed budget for extreme token counts');
else ok(`finalizeCalculated reflects usage (${capped.calculatedUsd})`);
const remainder = new EvalSpendTracker({ budgetUsd: 10, model: 'claude-haiku-5-5' });
remainder.calculatedUsd = 9.99;
remainder.estimatedUsd = 9.99;
if (remainder.reserveEstimate(0.05)) fail('should not reserve above ceiling');
else ok('reserveEstimate honours remaining ceiling');

console.log(
  JSON.stringify(
    {
      ok: failures.length === 0,
      liveExecutionAuthorized: false,
      budgetControl: 'options.budgetUsd → EvalSpendTracker (default V2_EVAL_BUDGET_USD=10)',
      envNote: 'No env var override for budget; per-run options take precedence over default constant',
      failures,
    },
    null,
    2,
  ),
);
process.exit(failures.length ? 1 : 0);