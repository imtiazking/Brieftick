/** Shared Anthropic Messages helpers (no server-only — safe for acceptance scripts). */

import { normaliseAnthropicUsage } from '../reasoner/anthropic-eval-budget.mjs';

export const AI_ERROR_CODES = {
  /** stop_reason "refusal" (Claude 5.x). Fail closed; usage is still billed and recorded. */
  AI_PROVIDER_REFUSAL: 'AI_PROVIDER_REFUSAL',
  /** stop_reason "model_context_window_exceeded" (Claude 5.x). */
  AI_CONTEXT_WINDOW_EXCEEDED: 'AI_CONTEXT_WINDOW_EXCEEDED',
  /** Request rejected locally before any network call (unsupported parameter for the model). */
  AI_REQUEST_CONFIG_INVALID: 'AI_REQUEST_CONFIG_INVALID',
  AI_PROVIDER_UNAVAILABLE: 'AI_PROVIDER_UNAVAILABLE',
  AI_PROVIDER_NOT_CONFIGURED: 'AI_PROVIDER_NOT_CONFIGURED',
  AI_PROVIDER_RATE_LIMITED: 'AI_PROVIDER_RATE_LIMITED',
  AI_TIMEOUT: 'AI_TIMEOUT',
  AI_OUTPUT_SCHEMA_INVALID: 'AI_OUTPUT_SCHEMA_INVALID',
  /** HTTP 200 but no user-visible text blocks in message content (e.g. thinking-only). */
  AI_EMPTY_RESPONSE_CONTENT: 'AI_EMPTY_RESPONSE_CONTENT',
  AI_RESPONSE_JSON_PARSE_FAILED: 'AI_RESPONSE_JSON_PARSE_FAILED',
  /** stop_reason max_tokens — thinking and/or answer cut off before completion. */
  AI_OUTPUT_TRUNCATED: 'AI_OUTPUT_TRUNCATED',
};

export const TRUNCATION_KIND = {
  THINKING_EXHAUSTED: 'thinking_exhausted',
  JSON_INCOMPLETE: 'json_incomplete',
  TEXT_INCOMPLETE: 'text_incomplete',
};

/**
 * Request-shape rules per model family.
 * Claude 5.5 (verified against the Sonnet 5.5 migration guide, 2026-11-26):
 *   - temperature / top_p / top_k are not accepted; assistant prefill is not accepted;
 *   - thinking budgets (budget_tokens) and thinking:{type:"disabled"} are not accepted;
 *   - adaptive thinking is the default and its tokens count against max_tokens;
 *   - thinking:{type:"between_tools"} is accepted only at low, medium or high effort;
 *   - JSON is requested by prompt (this integration validates it with its own schema check).
 * Older models (Sonnet 4.x and earlier) get only the parameters a caller passes explicitly.
 */
export const EFFORT_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max'];
const BETWEEN_TOOLS_EFFORTS = new Set(['low', 'medium', 'high']);
const FORBIDDEN_REQUEST_FIELDS = ['temperature', 'top_p', 'top_k', 'topP', 'topK', 'prefill', 'assistantPrefill'];

export function getAnthropicModelProfile(model) {
  const id = String(model || '');
  if (/^claude-(sonnet|opus|haiku)-5-5(?:$|-)/.test(id)) {
    return { family: 'claude-5-5', effort: true, adaptiveThinking: true, defaultEffort: 'medium' };
  }
  return { family: 'legacy', effort: false, adaptiveThinking: false, defaultEffort: null };
}

function configInvalid(message) {
  return { ok: false, code: AI_ERROR_CODES.AI_REQUEST_CONFIG_INVALID, message };
}

/**
 * Resolve effort + thinking for a model. Pure function; environment is injectable for tests.
 * Env: RI_ANTHROPIC_EFFORT (default medium), RI_ANTHROPIC_THINKING (default adaptive).
 */
export function resolveAnthropicRequestPolicy(model, opts = {}) {
  const env = opts.env ?? process.env;
  const profile = getAnthropicModelProfile(model);
  for (const f of FORBIDDEN_REQUEST_FIELDS) {
    if (opts.request && opts.request[f] !== undefined) {
      return configInvalid(`Parameter "${f}" is not supported by ${model} and is never sent.`);
    }
  }
  const explicitThinking = opts.thinking ?? null;
  const explicitOutputConfig = opts.outputConfig ?? null;

  if (profile.family === 'legacy') {
    return {
      ok: true,
      profile: profile.family,
      thinking: explicitThinking || null,
      outputConfig: explicitOutputConfig || null,
      effort: explicitOutputConfig?.effort ?? null,
      thinkingType: explicitThinking?.type ?? null,
      notes: [],
    };
  }

  const notes = [];
  const effort = String(
    explicitOutputConfig?.effort ?? env.RI_ANTHROPIC_EFFORT ?? profile.defaultEffort,
  ).toLowerCase();
  if (!EFFORT_LEVELS.includes(effort)) {
    return configInvalid(`RI_ANTHROPIC_EFFORT "${effort}" is not one of ${EFFORT_LEVELS.join(', ')}.`);
  }
  let thinkingType = String(explicitThinking?.type ?? env.RI_ANTHROPIC_THINKING ?? 'adaptive').toLowerCase();
  if (explicitThinking && explicitThinking.budget_tokens !== undefined) {
    return configInvalid('Thinking budgets (budget_tokens) are not supported by Claude 5.5.');
  }
  if (thinkingType === 'disabled') {
    // Claude 5.5 rejects thinking:{type:"disabled"}; between_tools is the closest supported setting.
    if (!BETWEEN_TOOLS_EFFORTS.has(effort)) {
      return configInvalid(`thinking "disabled" is not supported by ${model}; between_tools needs effort low, medium or high.`);
    }
    notes.push('thinking disabled is not supported by Claude 5.5; sent as between_tools');
    thinkingType = 'between_tools';
  }
  if (thinkingType !== 'adaptive' && thinkingType !== 'between_tools') {
    return configInvalid(`thinking type "${thinkingType}" is not supported by ${model}.`);
  }
  if (thinkingType === 'between_tools' && !BETWEEN_TOOLS_EFFORTS.has(effort)) {
    return configInvalid(`thinking "between_tools" is only supported at effort low, medium or high (got ${effort}).`);
  }
  return {
    ok: true,
    profile: profile.family,
    thinking: { type: thinkingType },
    outputConfig: { ...(explicitOutputConfig || {}), effort },
    effort,
    thinkingType,
    notes,
  };
}

/** Build the exact JSON body that would be POSTed. Pure; used by the sender and by offline compatibility tests. */
export function buildAnthropicRequestBody(req, opts = {}) {
  const maxTokens = req.maxTokens ?? Number(opts.env?.RI_ANTHROPIC_MAX_TOKENS ?? process.env.RI_ANTHROPIC_MAX_TOKENS ?? 8192);
  const policy = resolveAnthropicRequestPolicy(req.model, {
    env: opts.env,
    thinking: req.thinking,
    outputConfig: req.outputConfig,
    request: req,
  });
  if (!policy.ok) return policy;
  if (!Number.isFinite(maxTokens) || maxTokens < 1) {
    return configInvalid('max_tokens must be a positive integer.');
  }
  return {
    ok: true,
    policy,
    body: {
      model: req.model,
      max_tokens: Math.floor(maxTokens),
      system: req.system,
      messages: [{ role: 'user', content: req.user }],
      ...(policy.thinking ? { thinking: policy.thinking } : {}),
      ...(policy.outputConfig ? { output_config: policy.outputConfig } : {}),
    },
  };
}

/**
 * Extract assistant-visible text from Messages API content blocks.
 * Claude 5.x may prepend non-text blocks (e.g. thinking) before the text block.
 */
export function extractTextFromAnthropicMessageContent(content) {
  if (!Array.isArray(content)) return '';
  const parts = [];
  for (const block of content) {
    if (!block || typeof block !== 'object') continue;
    const type = String(block.type || 'text').toLowerCase();
    if (type === 'text' && typeof block.text === 'string' && block.text.trim()) {
      parts.push(block.text);
      continue;
    }
    if (typeof block.text === 'string' && block.text.trim() && type !== 'thinking') {
      parts.push(block.text);
    }
  }
  return parts.join('\n').trim();
}

export function summariseAnthropicContentBlocks(content) {
  if (!Array.isArray(content)) return [];
  return content.map((b) => (b && typeof b === 'object' ? String(b.type || 'text') : 'unknown'));
}

export function parseAnthropicJsonText(raw) {
  if (!raw?.trim()) return null;
  const stripped = raw.replace(/```json|```/g, '').trim();
  const start = stripped.indexOf('{');
  const end = stripped.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(stripped.slice(start, end + 1));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Classify max_tokens outcomes after HTTP 200 (thinking tokens count toward max_tokens).
 */
export function classifyMaxTokensTruncation({ stopReason, text, contentBlockTypes = [] }) {
  if (stopReason !== 'max_tokens') return null;
  const trimmed = String(text || '').trim();
  if (!trimmed) {
    return {
      code: AI_ERROR_CODES.AI_OUTPUT_TRUNCATED,
      truncationKind: TRUNCATION_KIND.THINKING_EXHAUSTED,
      message:
        'Anthropic stopped at max_tokens before any text block (output budget consumed by thinking).',
    };
  }
  const parsed = parseAnthropicJsonText(trimmed);
  const hasTextBlock = Array.isArray(contentBlockTypes) && contentBlockTypes.includes('text');
  if (!parsed) {
    return {
      code: AI_ERROR_CODES.AI_OUTPUT_TRUNCATED,
      truncationKind: hasTextBlock ? TRUNCATION_KIND.JSON_INCOMPLETE : TRUNCATION_KIND.TEXT_INCOMPLETE,
      message: hasTextBlock
        ? 'Anthropic stopped at max_tokens with partial text; reasoner JSON could not be parsed.'
        : 'Anthropic stopped at max_tokens with partial assistant text.',
    };
  }
  return {
    code: AI_ERROR_CODES.AI_OUTPUT_TRUNCATED,
    truncationKind: TRUNCATION_KIND.TEXT_INCOMPLETE,
    message: 'Anthropic stopped at max_tokens before the reasoner output finished.',
    partialText: trimmed,
  };
}

export function mapAnthropicHttpFailure(httpStatus, body) {
  const errType =
    body && typeof body === 'object' && body.error
      ? String(body.error.type ?? '')
      : '';
  const errMsg =
    body && typeof body === 'object' && body.error
      ? String(body.error.message ?? 'Anthropic API error')
      : 'Anthropic API error';

  if (httpStatus === 401 || httpStatus === 403 || errType === 'authentication_error') {
    return {
      ok: false,
      code: AI_ERROR_CODES.AI_PROVIDER_NOT_CONFIGURED,
      message: 'Anthropic authentication failed.',
      httpStatus,
    };
  }
  if (httpStatus === 429 || errType === 'rate_limit_error') {
    return {
      ok: false,
      code: AI_ERROR_CODES.AI_PROVIDER_RATE_LIMITED,
      message: 'Anthropic rate limit exceeded.',
      httpStatus,
    };
  }
  if (httpStatus === 404 || errType === 'not_found_error') {
    return {
      ok: false,
      code: AI_ERROR_CODES.AI_PROVIDER_UNAVAILABLE,
      message: errMsg.startsWith('model:') ? `Anthropic model not available (${errMsg}).` : errMsg,
      httpStatus,
    };
  }
  if (httpStatus >= 500) {
    return { ok: false, code: AI_ERROR_CODES.AI_PROVIDER_UNAVAILABLE, message: errMsg, httpStatus };
  }
  return { ok: false, code: AI_ERROR_CODES.AI_PROVIDER_UNAVAILABLE, message: errMsg, httpStatus };
}

async function readResponseJson(res, signal) {
  const text = await res.text();
  if (signal?.aborted) {
    throw new Error('AbortError: response body read aborted');
  }
  if (!text?.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

export async function callAnthropicMessages(apiKey, req, deps = {}) {
  const fetchFn = deps.fetchFn ?? fetch;
  const timeoutMs = req.timeoutMs ?? Number(process.env.RI_ANTHROPIC_TIMEOUT_MS ?? 60_000);

  // Reject unsupported parameters locally: no network call is made for an invalid configuration.
  const built = buildAnthropicRequestBody(req, { env: deps.env });
  if (!built.ok) {
    return { ...built, requestReachedProvider: false, responseReceived: false, usageKnown: true };
  }
  const requestMeta = {
    requestedModel: req.model,
    effort: built.policy.effort,
    thinkingType: built.policy.thinkingType,
    maxTokens: built.body.max_tokens,
    policyNotes: built.policy.notes,
  };

  const controller = new AbortController();
  const deadline = Date.now() + timeoutMs;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetchFn('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(built.body),
      signal: controller.signal,
    });

    if (controller.signal.aborted || Date.now() > deadline) {
      // The provider may have completed (and billed) the request: usage is unknown.
      return {
        ok: false,
        code: AI_ERROR_CODES.AI_TIMEOUT,
        message: 'Anthropic request timed out.',
        requestReachedProvider: true,
        responseReceived: false,
        usageKnown: false,
        ...requestMeta,
      };
    }

    const body = await readResponseJson(res, controller.signal);
    if (controller.signal.aborted || Date.now() > deadline) {
      return {
        ok: false,
        code: AI_ERROR_CODES.AI_TIMEOUT,
        message: 'Anthropic request timed out while reading response body.',
        requestReachedProvider: true,
        responseReceived: false,
        usageKnown: false,
        ...requestMeta,
      };
    }
    const headerRequestId =
      typeof res.headers?.get === 'function' ? res.headers.get('request-id') || null : null;
    if (!res.ok) {
      const mapped = mapAnthropicHttpFailure(res.status, body);
      const errType =
        body && typeof body === 'object' && body.error ? String(body.error.type ?? '') : '';
      return {
        ...mapped,
        requestReachedProvider: true,
        responseReceived: true,
        // HTTP error responses are not billed by Anthropic.
        usageKnown: true,
        providerErrorType: errType || null,
        requestId: headerRequestId ?? (typeof body.request_id === 'string' ? body.request_id : null),
        ...requestMeta,
      };
    }

    const content = body.content;
    const text = extractTextFromAnthropicMessageContent(content);
    const usage = normaliseAnthropicUsage(body.usage);
    const baseMeta = {
      httpStatus: res.status,
      requestReachedProvider: true,
      responseReceived: true,
      usageKnown: body.usage && typeof body.usage === 'object',
      requestId:
        headerRequestId ??
        (typeof body.id === 'string' ? body.id : typeof body.request_id === 'string' ? body.request_id : null),
      messageId: typeof body.id === 'string' ? body.id : null,
      responseModel: typeof body.model === 'string' ? body.model : null,
      stopReason: typeof body.stop_reason === 'string' ? body.stop_reason : null,
      contentBlockTypes: summariseAnthropicContentBlocks(content),
      inputTokens: usage.standardInputTokens,
      outputTokens: usage.outputTokens,
      usage,
      ...requestMeta,
    };

    if (baseMeta.stopReason === 'refusal') {
      return {
        ok: false,
        code: AI_ERROR_CODES.AI_PROVIDER_REFUSAL,
        message: 'Anthropic declined to produce an answer (stop_reason refusal). No output is used.',
        ...baseMeta,
      };
    }
    if (baseMeta.stopReason === 'model_context_window_exceeded') {
      return {
        ok: false,
        code: AI_ERROR_CODES.AI_CONTEXT_WINDOW_EXCEEDED,
        message: 'Anthropic stopped because the model context window was exceeded. No output is used.',
        ...baseMeta,
      };
    }

    if (!text.trim()) {
      const truncated = classifyMaxTokensTruncation({
        stopReason: baseMeta.stopReason,
        text,
        contentBlockTypes: baseMeta.contentBlockTypes,
      });
      if (truncated) {
        return {
          ok: false,
          ...truncated,
          ...baseMeta,
        };
      }
      return {
        ok: false,
        code: AI_ERROR_CODES.AI_EMPTY_RESPONSE_CONTENT,
        message:
          'Anthropic returned HTTP 200 but no extractable text blocks (check thinking-only or empty assistant content).',
        ...baseMeta,
      };
    }

    return {
      ok: true,
      text,
      ...baseMeta,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Anthropic request failed';
    if (msg.includes('abort') || msg.includes('Abort')) {
      return {
        ok: false,
        code: AI_ERROR_CODES.AI_TIMEOUT,
        message: 'Anthropic request timed out.',
        usageKnown: false,
        ...requestMeta,
      };
    }
    // A transport error can occur after the provider accepted the request, so usage is treated as unknown.
    return {
      ok: false,
      code: AI_ERROR_CODES.AI_PROVIDER_UNAVAILABLE,
      message: msg,
      requestReachedProvider: false,
      responseReceived: false,
      usageKnown: false,
      ...requestMeta,
    };
  } finally {
    clearTimeout(timer);
  }
}
