import { callAnthropicMessages, parseAnthropicJsonText, AI_ERROR_CODES } from '../ai/anthropic-messages-core.mjs';
import { getAnthropicApiKey, validateAnthropicApiKeyFormat } from '../ai/anthropic-provider-core.mjs';
import { buildReasonerSystemPrompt, buildReasonerUserPrompt } from './build-reasoner-prompt.mjs';
import { validateReasonerOutput } from './reasoner-output-schema.mjs';
import { resolveV2EvalModel } from './anthropic-eval-budget.mjs';
import { assertV2EvalModelSupported } from './v2-eval-models.mjs';
import { buildSanitisedProviderDiagnostics } from './anthropic-provider-diagnostics.mjs';

export function isV2LiveReasoningEnabled() {
  return process.env.RI_AI_EXECUTION_ENABLED === 'true' && Boolean(getAnthropicApiKey());
}

export async function invokeAnthropicReasoner(question, bundle, deps = {}) {
  const apiKey = deps.apiKeyOverride ?? getAnthropicApiKey();
  if (!apiKey) {
    return {
      ok: false,
      code: AI_ERROR_CODES.AI_PROVIDER_NOT_CONFIGURED,
      message: 'Anthropic API key not configured.',
      requestReachedProvider: false,
      diagnostics: buildSanitisedProviderDiagnostics({
        ok: false,
        code: AI_ERROR_CODES.AI_PROVIDER_NOT_CONFIGURED,
        message: 'Anthropic API key not configured.',
        requestReachedProvider: false,
      }),
    };
  }
  if (!validateAnthropicApiKeyFormat(apiKey)) {
    return {
      ok: false,
      code: AI_ERROR_CODES.AI_PROVIDER_NOT_CONFIGURED,
      message: 'Anthropic API key format is invalid.',
      requestReachedProvider: false,
      diagnostics: buildSanitisedProviderDiagnostics({
        ok: false,
        code: AI_ERROR_CODES.AI_PROVIDER_NOT_CONFIGURED,
        message: 'Anthropic API key format is invalid.',
        requestReachedProvider: false,
      }),
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
    const latencyMs = Date.now() - t0;
    const failure = {
      ok: false,
      code: res.code,
      message: res.message,
      httpStatus: res.httpStatus,
      providerErrorType: res.providerErrorType,
      requestId: res.requestId,
      requestReachedProvider: res.requestReachedProvider,
      responseReceived: res.responseReceived,
      stopReason: res.stopReason,
      contentBlockTypes: res.contentBlockTypes,
      inputTokens: res.inputTokens,
      outputTokens: res.outputTokens,
      model,
      latencyMs,
      usage:
        res.inputTokens != null || res.outputTokens != null
          ? { inputTokens: res.inputTokens, outputTokens: res.outputTokens }
          : undefined,
    };
    failure.diagnostics = buildSanitisedProviderDiagnostics(failure);
    return failure;
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
