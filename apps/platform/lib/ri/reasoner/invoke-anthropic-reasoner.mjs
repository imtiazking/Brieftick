import {
  callAnthropicMessages,
  parseAnthropicJsonText,
  AI_ERROR_CODES,
  classifyMaxTokensTruncation,
} from '../ai/anthropic-messages-core.mjs';
import { getAnthropicApiKey, validateAnthropicApiKeyFormat } from '../ai/anthropic-provider-core.mjs';
import { buildReasonerSystemPrompt, buildReasonerUserPrompt } from './build-reasoner-prompt.mjs';
import { validateReasonerOutput } from './reasoner-output-schema.mjs';
import { resolveV2EvalModel, estimateRequestCostUsd } from './anthropic-eval-budget.mjs';
import { assertV2EvalModelSupported } from './v2-eval-models.mjs';
import { buildSanitisedProviderDiagnostics } from './anthropic-provider-diagnostics.mjs';
import { resolveV2EvalReasonerAnthropicConfig } from './anthropic-eval-reasoner-config.mjs';

export function isV2LiveReasoningEnabled() {
  return process.env.RI_AI_EXECUTION_ENABLED === 'true' && Boolean(getAnthropicApiKey());
}

function aggregateUsage(attempts) {
  let inputTokens = 0;
  let outputTokens = 0;
  for (const a of attempts) {
    inputTokens += a.inputTokens ?? 0;
    outputTokens += a.outputTokens ?? 0;
  }
  return { inputTokens, outputTokens, providerAttempts: attempts.length };
}

function recordSpendAttempt(spendTracker, res, succeededSchema) {
  if (!spendTracker) return;
  spendTracker.recordAttempt({
    success: Boolean(res.ok && succeededSchema),
    inputTokens: res.inputTokens ?? 0,
    outputTokens: res.outputTokens ?? 0,
  });
}

function canAffordOutputRetry(spendTracker, model, inputTokens, retryMaxTokens) {
  if (!spendTracker) return true;
  const projected = estimateRequestCostUsd(model, inputTokens || 0, retryMaxTokens);
  return spendTracker.canAfford(projected);
}

function buildFailureFromCall(res, model, latencyMs, attempts) {
  const usage = aggregateUsage(attempts);
  const failure = {
    ok: false,
    code: res.code,
    message: res.message,
    truncationKind: res.truncationKind ?? null,
    httpStatus: res.httpStatus,
    providerErrorType: res.providerErrorType,
    requestId: res.requestId,
    requestReachedProvider: res.requestReachedProvider,
    responseReceived: res.responseReceived,
    stopReason: res.stopReason,
    contentBlockTypes: res.contentBlockTypes,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    model,
    latencyMs,
    usage: { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens },
    providerAttempts: usage.providerAttempts,
  };
  failure.diagnostics = buildSanitisedProviderDiagnostics(failure);
  return failure;
}

function shouldRetryForTruncation(res, schemaOk, parsed) {
  if (res.code === AI_ERROR_CODES.AI_TIMEOUT) return false;
  if (res.stopReason !== 'max_tokens') return false;
  if (!res.ok) {
    return res.code === AI_ERROR_CODES.AI_OUTPUT_TRUNCATED || res.code === AI_ERROR_CODES.AI_EMPTY_RESPONSE_CONTENT;
  }
  if (!schemaOk) {
    const truncated = classifyMaxTokensTruncation({
      stopReason: res.stopReason,
      text: res.text,
      contentBlockTypes: res.contentBlockTypes,
    });
    return Boolean(truncated);
  }
  if (parsed && res.stopReason === 'max_tokens') {
    return false;
  }
  return false;
}

async function runOneAnthropicCall(apiKey, model, system, user, maxTokens, evalConfig, deps) {
  return callAnthropicMessages(
    apiKey,
    {
      model,
      system,
      user,
      maxTokens,
      timeoutMs: deps.timeoutMs ?? 90_000,
      thinking: evalConfig.thinking,
      outputConfig: { effort: evalConfig.outputEffort },
    },
    deps,
  );
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

  const evalConfig = resolveV2EvalReasonerAnthropicConfig(deps);
  const system = buildReasonerSystemPrompt();
  const user = buildReasonerUserPrompt(question, bundle);
  const t0 = Date.now();
  const attempts = [];
  let maxTokens = deps.maxTokens ?? evalConfig.maxTokens;
  let lastRes = null;

  for (let attemptIndex = 0; attemptIndex < 2; attemptIndex += 1) {
    const res = await runOneAnthropicCall(apiKey, model, system, user, maxTokens, evalConfig, deps);
    lastRes = res;
    attempts.push({
      attempt: attemptIndex + 1,
      maxTokens,
      ok: res.ok,
      code: res.code ?? null,
      stopReason: res.stopReason ?? null,
      inputTokens: res.inputTokens ?? 0,
      outputTokens: res.outputTokens ?? 0,
      contentBlockTypes: res.contentBlockTypes ?? null,
    });

    if (!res.ok) {
      recordSpendAttempt(deps.spendTracker, res, false);
      if (attemptIndex === 0 && evalConfig.allowRetry && shouldRetryForTruncation(res, false, null)) {
        const afford = canAffordOutputRetry(
          deps.spendTracker,
          model,
          res.inputTokens ?? 0,
          evalConfig.maxTokensRetry,
        );
        if (afford && evalConfig.maxTokensRetry > maxTokens) {
          maxTokens = evalConfig.maxTokensRetry;
          continue;
        }
      }
      return buildFailureFromCall(res, model, Date.now() - t0, attempts);
    }

    let parsed = parseAnthropicJsonText(res.text);
    let schema = validateReasonerOutput(parsed);

    if (res.stopReason === 'max_tokens') {
      if (!schema.ok) {
        const truncated = classifyMaxTokensTruncation({
          stopReason: res.stopReason,
          text: res.text,
          contentBlockTypes: res.contentBlockTypes,
        });
        const failRes = {
          ...res,
          ok: false,
          code: truncated?.code ?? AI_ERROR_CODES.AI_OUTPUT_TRUNCATED,
          message: truncated?.message ?? 'Model output truncated at max_tokens before valid JSON.',
          truncationKind: truncated?.truncationKind ?? null,
        };
        if (attemptIndex === 0 && evalConfig.allowRetry) {
          const afford = canAffordOutputRetry(
            deps.spendTracker,
            model,
            res.inputTokens ?? 0,
            evalConfig.maxTokensRetry,
          );
          if (afford && evalConfig.maxTokensRetry > maxTokens) {
            recordSpendAttempt(deps.spendTracker, res, false);
            maxTokens = evalConfig.maxTokensRetry;
            continue;
          }
        }
        recordSpendAttempt(deps.spendTracker, failRes, false);
        return buildFailureFromCall(failRes, model, Date.now() - t0, attempts);
      }
    }

    if (!schema.ok) {
      recordSpendAttempt(deps.spendTracker, res, false);
      const usage = aggregateUsage(attempts);
      return {
        ok: false,
        code: AI_ERROR_CODES.AI_OUTPUT_SCHEMA_INVALID,
        message: `Model output failed schema: ${schema.errors.join(', ')}`,
        rawTextSanitized: String(res.text).slice(0, 500),
        model,
        latencyMs: Date.now() - t0,
        usage: { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens },
        providerAttempts: usage.providerAttempts,
      };
    }

    recordSpendAttempt(deps.spendTracker, res, true);
    const usage = aggregateUsage(attempts);
    return {
      ok: true,
      model,
      modelOutput: parsed,
      requestId: res.requestId,
      latencyMs: Date.now() - t0,
      usage: { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens },
      providerAttempts: usage.providerAttempts,
      evalOutputConfig: {
        maxTokensInitial: evalConfig.maxTokens,
        maxTokensRetry: evalConfig.maxTokensRetry,
        outputEffort: evalConfig.outputEffort,
        thinkingType: evalConfig.thinking?.type ?? 'adaptive',
      },
    };
  }

  return buildFailureFromCall(
    lastRes || { ok: false, code: AI_ERROR_CODES.AI_PROVIDER_UNAVAILABLE, message: 'Anthropic request failed.' },
    model,
    Date.now() - t0,
    attempts,
  );
}
