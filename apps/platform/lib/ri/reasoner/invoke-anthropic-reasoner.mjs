import { callAnthropicMessages, parseAnthropicJsonText, AI_ERROR_CODES } from '../ai/anthropic-messages-core.mjs';
import { getAnthropicApiKey, validateAnthropicApiKeyFormat } from '../ai/anthropic-provider-core.mjs';
import { buildReasonerSystemPrompt, buildReasonerUserPrompt } from './build-reasoner-prompt.mjs';
import { validateReasonerOutput } from './reasoner-output-schema.mjs';
import { resolveV2EvalModel } from './anthropic-eval-budget.mjs';
import { assertV2EvalModelSupported } from './v2-eval-models.mjs';

export function isV2LiveReasoningEnabled() {
  return process.env.RI_AI_EXECUTION_ENABLED === 'true' && Boolean(getAnthropicApiKey());
}

export async function invokeAnthropicReasoner(question, bundle, deps = {}) {
  const apiKey = deps.apiKeyOverride ?? getAnthropicApiKey();
  if (!apiKey || !validateAnthropicApiKeyFormat()) {
    return {
      ok: false,
      code: AI_ERROR_CODES.AI_PROVIDER_NOT_CONFIGURED,
      message: 'Anthropic not configured for V2 eval.',
    };
  }
  if (!deps.skipExecutionGuard && process.env.RI_AI_EXECUTION_ENABLED !== 'true') {
    return {
      ok: false,
      code: 'AI_EXTERNAL_PROCESSING_DISABLED',
      message: 'Set RI_AI_EXECUTION_ENABLED=true for live V2 evaluation.',
    };
  }

  const model = deps.model || resolveV2EvalModel();
  const modelCheck = assertV2EvalModelSupported(model);
  if (!modelCheck.ok) {
    return { ok: false, code: AI_ERROR_CODES.AI_OUTPUT_SCHEMA_INVALID, message: modelCheck.message };
  }
  const system = buildReasonerSystemPrompt();
  const user = buildReasonerUserPrompt(question, bundle);
  const t0 = Date.now();

  const res = await callAnthropicMessages(
    apiKey,
    {
      model,
      system,
      user,
      maxTokens: deps.maxTokens ?? 2048,
      timeoutMs: deps.timeoutMs ?? 90_000,
    },
    deps,
  );

  if (!res.ok) {
    return { ok: false, code: res.code, message: res.message, httpStatus: res.httpStatus, model, latencyMs: Date.now() - t0 };
  }

  const parsed = parseAnthropicJsonText(res.text);
  const schema = validateReasonerOutput(parsed);
  if (!schema.ok) {
    return {
      ok: false,
      code: AI_ERROR_CODES.AI_OUTPUT_SCHEMA_INVALID,
      message: `Model output failed schema: ${schema.errors.join(', ')}`,
      rawTextSanitized: String(res.text).slice(0, 500),
      model,
      latencyMs: Date.now() - t0,
      usage: { inputTokens: res.inputTokens, outputTokens: res.outputTokens },
    };
  }

  return {
    ok: true,
    model,
    modelOutput: parsed,
    requestId: res.requestId,
    latencyMs: Date.now() - t0,
    usage: { inputTokens: res.inputTokens, outputTokens: res.outputTokens },
  };
}
