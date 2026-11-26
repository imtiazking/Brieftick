#!/usr/bin/env node
/**
 * Lifecycle stages 2–5 live provider wiring — mocked providers only. No paid AI.
 */
import { register } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const platformRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const hook = `
export async function resolve(specifier, context, next) {
  if (specifier === 'server-only') return { url: 'data:text/javascript,export {}', shortCircuit: true };
  if (specifier.startsWith('@/')) {
    const rel = specifier.slice(2);
    const root = ${JSON.stringify(pathToFileURL(platformRoot + '/').href)};
    return next(root + (/\\.(m?js|ts|json)$/.test(rel) ? rel : rel + '.ts'), context);
  }
  return next(specifier, context);
}`;
register(`data:text/javascript,${encodeURIComponent(hook)}`, import.meta.url);

const { runLifecycleStageAnalysis, resolveLifecycleExecutionMode } = await import(
  '../lib/ri/ai/lifecycle-stage-ai.ts'
);
const { buildAnthropicPrompts } = await import('../lib/ri/ai/anthropic-prompts-core.mjs');
const {
  resolveLabAnthropicBudgetConfig,
  guardLabAnthropicSpendBeforeCall,
  finalizeLabSpendAfterCall,
  resetLabTrialSlotsForTests,
  readPilotCalculatedUsd,
  buildLabSpendScopeKey,
} = await import('../lib/ri/ai/lab-anthropic-spend-guard.mjs');

let fail = 0;
const pass = (id) => console.log(`PASS: ${id}`);
const failTest = (id, detail) => {
  fail += 1;
  console.error(`FAIL: ${id} — ${detail}`);
};

const prev = { ...process.env };
function restore() {
  for (const key of Object.keys(process.env)) {
    if (!(key in prev)) delete process.env[key];
  }
  Object.assign(process.env, prev);
}

process.env.FORGENIQ_STAGE2_AI = 'FIXTURE';
process.env.FORGENIQ_STAGE3_AI = 'FIXTURE';
process.env.RI_AI_PROVIDER_MODE = 'FIXTURE';
process.env.RI_AI_EXECUTION_ENABLED = 'false';

if (resolveLifecycleExecutionMode(2) !== 'fixture') failTest('default_fixture', resolveLifecycleExecutionMode(2));
else pass('default_fixture');

const fixtureRun = await runLifecycleStageAnalysis({
  stage: 2,
  organisationId: 'org-test',
  idempotencyKey: 'stage2:test',
  sourceSections: [{ sourceSectionId: 'OBL-1', citation: 'CONC 7.20.1R', text: 'A firm must contact the customer.' }],
});
if (!fixtureRun.ok || fixtureRun.executionMode !== 'fixture' || fixtureRun.model !== 'fixture-ri') {
  failTest('fixture_execute', JSON.stringify(fixtureRun));
} else if (!fixtureRun.structured?.dimensions) {
  failTest('fixture_schema', 'missing dimensions');
} else pass('fixture_execute');

process.env.FORGENIQ_STAGE3_AI = 'ANTHROPIC';
process.env.RI_AI_EXECUTION_ENABLED = 'false';
const disabled = await runLifecycleStageAnalysis({
  stage: 3,
  organisationId: 'org-test',
  idempotencyKey: 'stage3:test',
  sourceSections: [{ sourceSectionId: 'IMP-1', citation: 'impact', text: 'Operational change.' }],
  providerOverride: {
    id: 'mock',
    async execute() {
      throw new Error('provider_should_not_run');
    },
  },
});
if (disabled.ok || disabled.code !== 'AI_EXTERNAL_PROCESSING_DISABLED' || !disabled.failClosed) {
  failTest('execution_disabled', JSON.stringify(disabled));
} else pass('execution_disabled');

process.env.RI_AI_EXECUTION_ENABLED = 'true';
process.env.FORGENIQ_STAGE4_AI = 'LIVE';
const invalid = await runLifecycleStageAnalysis({
  stage: 4,
  organisationId: 'org-test',
  idempotencyKey: 'stage4:test',
  sourceSections: [{ sourceSectionId: 'RISK-1', citation: 'risk', text: 'Conduct risk.' }],
  providerOverride: {
    id: 'mock-live',
    async execute() {
      return { ok: true, structured: { confidence: 40 }, latencyMs: 5, inputTokenEstimate: 10, outputTokenEstimate: 4 };
    },
  },
});
if (invalid.ok || invalid.code !== 'AI_OUTPUT_SCHEMA_INVALID') {
  failTest('reject_invalid', JSON.stringify(invalid));
} else pass('reject_invalid');

const timeout = await runLifecycleStageAnalysis({
  stage: 4,
  organisationId: 'org-test',
  idempotencyKey: 'stage4:timeout',
  sourceSections: [{ sourceSectionId: 'RISK-1', citation: 'risk', text: 'Conduct risk.' }],
  providerOverride: {
    id: 'mock-live',
    async execute() {
      return { ok: false, code: 'AI_PROVIDER_TIMEOUT', message: 'timed out' };
    },
  },
});
if (timeout.ok || !timeout.failClosed || timeout.executionMode !== 'live') {
  failTest('timeout', JSON.stringify(timeout));
} else pass('timeout_fail_closed');

process.env.FORGENIQ_STAGE5_AI = 'ANTHROPIC';
const liveOk = await runLifecycleStageAnalysis({
  stage: 5,
  organisationId: 'org-test',
  idempotencyKey: 'stage5:ok',
  sourceSections: [{ sourceSectionId: 'CTRL-1', citation: 'control', text: 'Monitoring control.' }],
  providerOverride: {
    id: 'mock-live',
    async execute(request) {
      if (request.useCaseId !== 'UC-RI-008') return { ok: false, code: 'wrong_use_case' };
      return {
        ok: true,
        structured: {
          confidence: 70,
          testPlan: { reviewType: 'control_test', objective: 'Sample the control.', procedure: 'Inspect evidence.' },
          claims: [{ text: 'Grounded', confidence: 70, sourceSectionIds: ['CTRL-1'] }],
        },
        latencyMs: 12,
        inputTokenEstimate: 100,
        outputTokenEstimate: 40,
      };
    },
  },
});
if (!liveOk.ok || liveOk.executionMode !== 'live' || liveOk.model !== 'mock-live-provider') {
  failTest('mock_live', JSON.stringify(liveOk));
} else pass('mock_live_stage5');

const prompt = buildAnthropicPrompts({
  useCaseId: 'UC-RI-006',
  analysisType: 'Risk Mapping',
  sourceSections: [{ sourceSectionId: 'IMP-1', citation: 'impact', text: 'Impact text' }],
  regulatoryAnalysis: { existingRisks: [{ id: 'risk-1', title: 'Known risk' }] },
});
if (
  !prompt.user.includes('RiskMappingResult') ||
  !prompt.user.includes('risk-1') ||
  !/never invent/i.test(prompt.user)
) {
  failTest('prompt_grounding', prompt.user.slice(0, 400));
} else pass('prompt_grounding');

resetLabTrialSlotsForTests();
process.env.RI_LAB_SPEND_GUARD_MODE = 'memory';
process.env.RI_AI_EXECUTION_ENABLED = 'true';
process.env.RI_LAB_ANTHROPIC_MAX_USD = '0.000001';
process.env.RI_LAB_ANTHROPIC_MAX_OUTPUT_TOKENS = '4096';
const tiny = resolveLabAnthropicBudgetConfig('UC-RI-004', { executionEnabled: true });
if (!tiny.enforced || tiny.budgetUsd !== 0.000001) failTest('budget_scope', JSON.stringify(tiny));
else pass('budget_covers_stage2');

const blocked = await guardLabAnthropicSpendBeforeCall({
  useCaseId: 'UC-RI-004',
  system: 'system',
  user: 'user prompt '.repeat(40),
  idempotencyKey: 'stage2:budget',
  organisationId: 'org-test',
});
if (blocked.ok) failTest('budget_exhausted', JSON.stringify(blocked));
else pass('budget_exhausted');

resetLabTrialSlotsForTests();
process.env.RI_LAB_ANTHROPIC_MAX_USD = '5';
process.env.RI_LAB_ANTHROPIC_MAX_OUTPUT_TOKENS = '256';
process.env.RI_LAB_ANTHROPIC_MAX_REQUESTS = '1';
const first = await guardLabAnthropicSpendBeforeCall({
  useCaseId: 'UC-RI-006',
  system: 's',
  user: 'short',
  idempotencyKey: 'stage3:one',
  organisationId: 'org-test',
});
if (!first.ok) failTest('budget_reserve', JSON.stringify(first));
else {
  await finalizeLabSpendAfterCall(first.tracker, first.slotKey, { ok: true, inputTokens: 20, outputTokens: 10, text: '{}' }, first.reserveUsd);
  const second = await guardLabAnthropicSpendBeforeCall({
    useCaseId: 'UC-RI-007',
    system: 's',
    user: 'short',
    idempotencyKey: 'stage4:two',
    organisationId: 'org-test',
  });
  if (second.ok) failTest('request_cap', 'second request should stop');
  else pass('request_cap');
  const scope = buildLabSpendScopeKey(first.config);
  if (readPilotCalculatedUsd(scope) <= 0) failTest('aggregate_ledger', String(readPilotCalculatedUsd(scope)));
  else pass('aggregate_ledger');
}

restore();
resetLabTrialSlotsForTests();
if (fail) {
  console.error(`\nacceptance-ri-lifecycle-live-ai: FAIL (${fail})\n`);
  process.exit(1);
}
console.log('\nacceptance-ri-lifecycle-live-ai: PASS\n');
