#!/usr/bin/env node
/**
 * Claude Sonnet 5.5 compatibility — mocked HTTP only. No billable API calls, no network.
 * Checks the exact request body, rejected parameters, usage categories, new stop reasons, timeouts,
 * pricing, legacy model support, and that bad configuration never consumes a request slot.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const aiDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'lib', 'ri', 'ai');
const imp = (p) => import(pathToFileURL(join(aiDir, p)).href);

const core = await imp('anthropic-messages-core.mjs');
const provider = await imp('anthropic-provider-core.mjs');
const modelCfg = await imp('anthropic-model-config.mjs');
const budget = await import(pathToFileURL(join(aiDir, '..', 'reasoner', 'anthropic-eval-budget.mjs')).href);
const guard = await imp('lab-anthropic-spend-guard.mjs');

let fail = 0;
const ok = (id) => console.log(`PASS: ${id}`);
const bad = (id, detail) => {
  fail += 1;
  console.error(`FAIL: ${id} — ${detail}`);
};
const check = (id, cond, detail = '') => (cond ? ok(id) : bad(id, detail));

const KEY = 'sk-ant-api03-test-key-abcdefghijklmnopqrstuvwxyz';
const ENV_KEYS = [
  'RI_ANTHROPIC_MODEL', 'ANTHROPIC_MODEL', 'RI_AI_MODEL', 'RI_ANTHROPIC_EFFORT', 'RI_ANTHROPIC_THINKING',
  'RI_ANTHROPIC_MAX_TOKENS', 'RI_ANTHROPIC_TIMEOUT_MS', 'RI_AI_EXECUTION_ENABLED', 'RI_LAB_SPEND_GUARD_MODE',
  'RI_LAB_ANTHROPIC_MAX_USD', 'RI_LAB_ANTHROPIC_MAX_REQUESTS', 'ANTHROPIC_API_KEY',
];
const resetEnv = () => {
  for (const k of ENV_KEYS) delete process.env[k];
};
resetEnv();

function recordingFetch(response, calls) {
  return async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body), headers: init.headers });
    return {
      ok: response.ok ?? true,
      status: response.status ?? 200,
      headers: { get: (h) => (h.toLowerCase() === 'request-id' ? response.requestId ?? null : null) },
      text: async () => JSON.stringify(response.body ?? {}),
    };
  };
}
const okBody = (extra = {}) => ({
  id: 'msg_01',
  model: 'claude-sonnet-5-5',
  stop_reason: 'end_turn',
  content: [{ type: 'text', text: '{"a":1}' }],
  usage: { input_tokens: 100, output_tokens: 50 },
  ...extra,
});

// ------------------------------------------------------------------ model selection
check('default_model_is_sonnet_5_5', provider.resolveAnthropicModel() === 'claude-sonnet-5-5' && modelCfg.DEFAULT_ANTHROPIC_MODEL === 'claude-sonnet-5-5');
process.env.RI_ANTHROPIC_MODEL = 'claude-sonnet-4-5';
check('legacy_model_override_supported', provider.resolveAnthropicModel() === 'claude-sonnet-4-5');
process.env.RI_ANTHROPIC_MODEL = 'gpt-4o';
check('non_anthropic_model_ignored', provider.resolveAnthropicModel() === 'claude-sonnet-5-5');
resetEnv();

// ------------------------------------------------------------------ request body for Sonnet 5.5
{
  const calls = [];
  const res = await core.callAnthropicMessages(KEY, { model: 'claude-sonnet-5-5', system: 'sys', user: 'usr', maxTokens: 2048 }, {
    fetchFn: recordingFetch({ body: okBody() }, calls),
  });
  const body = calls[0]?.body ?? {};
  const forbidden = ['temperature', 'top_p', 'top_k', 'budget_tokens'].filter((k) => k in body || k in (body.thinking || {}));
  check('request_url_and_version', calls[0]?.url === 'https://api.anthropic.com/v1/messages' && calls[0]?.headers['anthropic-version'] === '2023-06-01');
  check('request_no_sampling_params', forbidden.length === 0, JSON.stringify(forbidden));
  check('request_adaptive_thinking_and_effort', body.thinking?.type === 'adaptive' && body.output_config?.effort === 'medium', JSON.stringify(body));
  check('request_single_user_message_no_prefill', body.messages?.length === 1 && body.messages[0].role === 'user', JSON.stringify(body.messages));
  check('request_max_tokens_bounded', body.max_tokens === 2048 && body.model === 'claude-sonnet-5-5');
  check('request_no_deprecated_fields', !('output_format' in body) && !('anthropic_beta' in body) && !('stream' in body));
  check('response_usage_normalised', res.ok && res.usage.standardInputTokens === 100 && res.usage.outputTokens === 50 && res.responseModel === 'claude-sonnet-5-5');
}

// ------------------------------------------------------------------ effort / thinking policy
{
  const calls = [];
  const fetchFn = recordingFetch({ body: okBody() }, calls);
  const build = (extra, env) => core.buildAnthropicRequestBody({ model: 'claude-sonnet-5-5', system: 's', user: 'u', maxTokens: 100, ...extra }, { env });
  check('env_effort_high', build({}, { RI_ANTHROPIC_EFFORT: 'high' }).body?.output_config?.effort === 'high');
  const disabled = build({}, { RI_ANTHROPIC_THINKING: 'disabled' });
  check('thinking_disabled_sent_as_between_tools', disabled.ok && disabled.body.thinking.type === 'between_tools' && disabled.policy.notes.length === 1, JSON.stringify(disabled));
  const budgetTokens = build({ thinking: { type: 'enabled', budget_tokens: 2000 } }, {});
  check('thinking_budget_rejected', !budgetTokens.ok && budgetTokens.code === 'AI_REQUEST_CONFIG_INVALID');
  const xhighBetween = build({}, { RI_ANTHROPIC_EFFORT: 'xhigh', RI_ANTHROPIC_THINKING: 'between_tools' });
  check('between_tools_needs_low_medium_high', !xhighBetween.ok && xhighBetween.code === 'AI_REQUEST_CONFIG_INVALID');
  const bogusEffort = build({}, { RI_ANTHROPIC_EFFORT: 'turbo' });
  check('unknown_effort_rejected', !bogusEffort.ok);
  for (const field of ['temperature', 'top_p', 'top_k']) {
    const r = build({ [field]: 0.2 }, {});
    check(`sampling_${field}_rejected`, !r.ok && r.code === 'AI_REQUEST_CONFIG_INVALID');
  }
  const rejected = await core.callAnthropicMessages(KEY, { model: 'claude-sonnet-5-5', system: 's', user: 'u', temperature: 0.3 }, { fetchFn });
  check('invalid_config_makes_no_network_call', !rejected.ok && rejected.code === 'AI_REQUEST_CONFIG_INVALID' && calls.length === 0);
  const legacy = core.buildAnthropicRequestBody({ model: 'claude-sonnet-4-5', system: 's', user: 'u', maxTokens: 100 }, { env: {} });
  check('legacy_model_gets_no_effort_or_thinking', legacy.ok && !('thinking' in legacy.body) && !('output_config' in legacy.body));
}

// ------------------------------------------------------------------ usage categories and pricing
{
  const calls = [];
  const res = await core.callAnthropicMessages(KEY, { model: 'claude-sonnet-5-5', system: 's', user: 'u', maxTokens: 500 }, {
    fetchFn: recordingFetch({
      requestId: 'req_hdr_1',
      body: okBody({
        usage: {
          input_tokens: 1000,
          output_tokens: 500,
          cache_creation_input_tokens: 300,
          cache_creation: { ephemeral_5m_input_tokens: 200, ephemeral_1h_input_tokens: 100 },
          cache_read_input_tokens: 4000,
        },
      }),
    }, calls),
  });
  check('usage_cache_categories_parsed', res.usage.cacheWrite5mTokens === 200 && res.usage.cacheWrite1hTokens === 100 && res.usage.cacheReadTokens === 4000);
  check('provider_request_id_from_header', res.requestId === 'req_hdr_1' && res.messageId === 'msg_01');
  const cost = budget.estimateUsageCostUsd('claude-sonnet-5-5', res.usage);
  check('sonnet_5_5_cost_by_category', cost.totalUsd === 0.0083 && cost.cacheReadUsd === 0.0004 && cost.cacheWrite1hUsd === 0.0004, JSON.stringify(cost));
  const noTier = budget.normaliseAnthropicUsage({ input_tokens: 10, output_tokens: 5, cache_creation_input_tokens: 50 });
  check('untiered_cache_write_priced_at_1h', noTier.cacheWrite1hTokens === 50 && noTier.cacheWriteTierAssumed === '1h');
  const p = budget.MODEL_PRICING_ESTIMATE;
  check(
    'published_rates',
    p['claude-sonnet-5-5'].inputPerMtok === 2 && p['claude-sonnet-5-5'].outputPerMtok === 10 &&
      p['claude-sonnet-5-5'].cacheWrite5mPerMtok === 2.5 && p['claude-sonnet-5-5'].cacheWrite1hPerMtok === 4 &&
      p['claude-sonnet-5-5'].cacheReadPerMtok === 0.1,
  );
  const old = budget.estimateUsageCostUsd('claude-sonnet-4-5', { standardInputTokens: 1_000_000, outputTokens: 1_000_000, cacheWrite5mTokens: 0, cacheWrite1hTokens: 0, cacheReadTokens: 0 });
  check('sonnet_4_5_pricing_unchanged', old.totalUsd === 18 && budget.estimateRequestCostUsd('claude-sonnet-4-5', 1_000_000, 1_000_000) === 18);
  check('unpriced_model_has_no_cost', budget.estimateUsageCostUsd('claude-future-9', {}) === null && budget.estimateMaxRequestCostUsd('claude-future-9', 1, 1) === null);
  // 10,000 prompt tokens at the highest input-side rate ($4/M) + 8,192 output tokens at $10/M
  check('worst_case_reserve', budget.estimateMaxRequestCostUsd('claude-sonnet-5-5', 10_000, 8192) === 0.12192);
}

// ------------------------------------------------------------------ stop reasons, errors, timeouts
{
  const run = (response) => core.callAnthropicMessages(KEY, { model: 'claude-sonnet-5-5', system: 's', user: 'u', maxTokens: 100 }, { fetchFn: recordingFetch(response, []) });
  const refusal = await run({ body: okBody({ stop_reason: 'refusal', content: [{ type: 'text', text: '{"a":1}' }], usage: { input_tokens: 70, output_tokens: 3 } }) });
  check('refusal_fails_closed_with_usage', !refusal.ok && refusal.code === 'AI_PROVIDER_REFUSAL' && refusal.usage.standardInputTokens === 70 && refusal.usageKnown === true);
  const ctx = await run({ body: okBody({ stop_reason: 'model_context_window_exceeded' }) });
  check('context_window_exceeded_fails_closed', !ctx.ok && ctx.code === 'AI_CONTEXT_WINDOW_EXCEEDED');
  const truncated = await run({ body: okBody({ stop_reason: 'max_tokens', content: [{ type: 'thinking', thinking: 'x' }], usage: { input_tokens: 10, output_tokens: 100 } }) });
  check('thinking_exhausted_is_truncation', !truncated.ok && truncated.code === 'AI_OUTPUT_TRUNCATED' && truncated.usage.outputTokens === 100);
  const rate = await run({ ok: false, status: 429, body: { error: { type: 'rate_limit_error', message: 'slow down' } } });
  check('http_429_mapped_usage_known', rate.code === 'AI_PROVIDER_RATE_LIMITED' && rate.usageKnown === true && rate.requestReachedProvider === true);
  const overloaded = await run({ ok: false, status: 529, body: { error: { type: 'overloaded_error', message: 'busy' } } });
  check('http_529_mapped', overloaded.code === 'AI_PROVIDER_UNAVAILABLE' && overloaded.usageKnown === true);
  const missingModel = await run({ ok: false, status: 404, body: { error: { type: 'not_found_error', message: 'model: claude-sonnet-5-5' } } });
  check('http_404_model_not_available', missingModel.code === 'AI_PROVIDER_UNAVAILABLE' && /not available/.test(missingModel.message));
  const timedOut = await core.callAnthropicMessages(KEY, { model: 'claude-sonnet-5-5', system: 's', user: 'u', maxTokens: 100, timeoutMs: 30 }, {
    fetchFn: (_url, init) => new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(new Error('The operation was aborted (AbortError)')))),
  });
  check('timeout_is_unknown_usage', !timedOut.ok && timedOut.code === 'AI_TIMEOUT' && timedOut.usageKnown === false);
  const transport = await core.callAnthropicMessages(KEY, { model: 'claude-sonnet-5-5', system: 's', user: 'u', maxTokens: 100 }, {
    fetchFn: async () => {
      throw new Error('socket hang up');
    },
  });
  check('transport_error_is_unknown_usage', !transport.ok && transport.usageKnown === false);
}

// ------------------------------------------------------------------ provider: structured JSON, ledger, config errors
{
  process.env.ANTHROPIC_API_KEY = KEY;
  process.env.RI_AI_EXECUTION_ENABLED = 'true';
  process.env.RI_LAB_SPEND_GUARD_MODE = 'memory';
  process.env.RI_LAB_ANTHROPIC_MAX_USD = '0.75';
  process.env.RI_LAB_ANTHROPIC_MAX_REQUESTS = '8';
  guard.resetLabTrialSlotsForTests();
  const sections = [{ sourceSectionId: 'SRCSEC-001', text: 'A firm must keep records for five years.', citation: 'CONC 7.20.1R' }];
  const execute = (fetchFn, key) =>
    provider.createAnthropicProvider({ fetchFn }).execute({
      analysisType: 'Impact Suggestion',
      useCaseId: 'UC-RI-004',
      budgetContext: { organisationId: 'org-a', idempotencyKey: key },
      context: { sourceSections: sections },
    });

  const calls = [];
  const good = await execute(
    recordingFetch({ requestId: 'req_p1', body: okBody({ content: [{ type: 'text', text: '{"claims":[{"text":"t","sourceSectionIds":["SRCSEC-001"]}]}' }], usage: { input_tokens: 800, output_tokens: 300, cache_read_input_tokens: 1000 } }) }, calls),
    'compat-1',
  );
  check('provider_returns_structured_json_and_usage', good.ok && Array.isArray(good.structured.claims) && good.usage.cacheReadTokens === 1000 && good.providerMeta.requestedModel === 'claude-sonnet-5-5' && good.providerMeta.effort === 'medium');
  const expected = budget.estimateUsageCostUsd('claude-sonnet-5-5', good.usage).totalUsd;
  check('provider_settles_estimated_cost', good.spendAudit?.records?.some((r) => r.kind === 'settle' && r.actualUsd === expected) === true, JSON.stringify(good.spendAudit?.records));
  check('provider_request_has_bounded_max_tokens', calls[0].body.max_tokens === 8192 && calls[0].body.model === 'claude-sonnet-5-5');

  const invalid = await execute(recordingFetch({ body: okBody({ content: [{ type: 'text', text: 'not json' }] }) }, []), 'compat-2');
  check('provider_invalid_json_rejected', !invalid.ok && invalid.code === 'AI_OUTPUT_SCHEMA_INVALID');

  const refusal = await execute(recordingFetch({ body: okBody({ stop_reason: 'refusal' }) }, []), 'compat-3');
  check('provider_refusal_creates_no_output', !refusal.ok && refusal.code === 'AI_PROVIDER_REFUSAL' && !refusal.structured);

  const timeoutResult = await execute(async () => {
    throw new Error('socket hang up');
  }, 'compat-4');
  const lastSettle = timeoutResult.spendAudit?.records?.filter((r) => r.kind === 'settle').pop();
  check('provider_unknown_outcome_settles_at_reserve', !timeoutResult.ok && lastSettle?.usageKnown === false && lastSettle.actualUsd > 0);

  // bad configuration is rejected before reservation and before any fetch
  process.env.RI_ANTHROPIC_EFFORT = 'turbo';
  guard.resetLabTrialSlotsForTests();
  let fetched = 0;
  const cfg = await execute(async () => {
    fetched += 1;
    return { ok: true, status: 200, text: async () => '{}' };
  }, 'compat-5');
  check('provider_bad_config_never_reserves', !cfg.ok && cfg.code === 'AI_REQUEST_CONFIG_INVALID' && fetched === 0 && !cfg.spendAudit);
  delete process.env.RI_ANTHROPIC_EFFORT;

  // an unpriced model fails closed (no silent cheapest-rate fallback)
  process.env.RI_ANTHROPIC_MODEL = 'claude-future-9';
  guard.resetLabTrialSlotsForTests();
  fetched = 0;
  const unpriced = await execute(async () => {
    fetched += 1;
    return { ok: true, status: 200, text: async () => '{}' };
  }, 'compat-6');
  check('provider_unpriced_model_fails_closed', !unpriced.ok && unpriced.failClosed === true && fetched === 0);
  delete process.env.RI_ANTHROPIC_MODEL;

  // max request count is enforced by the memory guard as well
  process.env.RI_LAB_ANTHROPIC_MAX_REQUESTS = '2';
  guard.resetLabTrialSlotsForTests();
  const results = [];
  for (let i = 0; i < 3; i += 1) {
    results.push(await execute(recordingFetch({ body: okBody({ content: [{ type: 'text', text: '{"claims":[]}' }] }) }, []), `cap-${i}`));
  }
  check('provider_request_cap', results[0].ok && results[1].ok && !results[2].ok && results[2].code === 'LAB_ANTHROPIC_BUDGET_EXCEEDED', JSON.stringify(results.map((r) => r.code ?? 'ok')));
}

resetEnv();
if (fail) {
  console.error(`\nacceptance-anthropic-sonnet-55-compat: FAIL (${fail})\n`);
  process.exit(1);
}
console.log('\nacceptance-anthropic-sonnet-55-compat: PASS\n');
