/** Shared Anthropic Messages helpers (no server-only — safe for acceptance scripts). */

export const AI_ERROR_CODES = {
  AI_PROVIDER_UNAVAILABLE: 'AI_PROVIDER_UNAVAILABLE',
  AI_PROVIDER_NOT_CONFIGURED: 'AI_PROVIDER_NOT_CONFIGURED',
  AI_PROVIDER_RATE_LIMITED: 'AI_PROVIDER_RATE_LIMITED',
  AI_TIMEOUT: 'AI_TIMEOUT',
  AI_OUTPUT_SCHEMA_INVALID: 'AI_OUTPUT_SCHEMA_INVALID',
  /** HTTP 200 but no user-visible text blocks in message content (e.g. thinking-only). */
  AI_EMPTY_RESPONSE_CONTENT: 'AI_EMPTY_RESPONSE_CONTENT',
  AI_RESPONSE_JSON_PARSE_FAILED: 'AI_RESPONSE_JSON_PARSE_FAILED',
};

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

export async function callAnthropicMessages(apiKey, req, deps = {}) {
  const fetchFn = deps.fetchFn ?? fetch;
  const maxTokens = req.maxTokens ?? Number(process.env.RI_ANTHROPIC_MAX_TOKENS ?? 4096);
  const timeoutMs = req.timeoutMs ?? Number(process.env.RI_ANTHROPIC_TIMEOUT_MS ?? 60_000);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetchFn('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: req.model,
        max_tokens: maxTokens,
        system: req.system,
        messages: [{ role: 'user', content: req.user }],
      }),
      signal: controller.signal,
    });

    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const mapped = mapAnthropicHttpFailure(res.status, body);
      const errType =
        body && typeof body === 'object' && body.error ? String(body.error.type ?? '') : '';
      return {
        ...mapped,
        requestReachedProvider: true,
        responseReceived: true,
        providerErrorType: errType || null,
        requestId: typeof body.request_id === 'string' ? body.request_id : null,
      };
    }

    const content = body.content;
    const text = extractTextFromAnthropicMessageContent(content);
    const baseMeta = {
      httpStatus: res.status,
      requestReachedProvider: true,
      responseReceived: true,
      requestId: typeof body.id === 'string' ? body.id : typeof body.request_id === 'string' ? body.request_id : null,
      stopReason: typeof body.stop_reason === 'string' ? body.stop_reason : null,
      contentBlockTypes: summariseAnthropicContentBlocks(content),
      inputTokens: body.usage?.input_tokens ?? null,
      outputTokens: body.usage?.output_tokens ?? null,
    };

    if (!text.trim()) {
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
      return { ok: false, code: AI_ERROR_CODES.AI_TIMEOUT, message: 'Anthropic request timed out.' };
    }
    return {
      ok: false,
      code: AI_ERROR_CODES.AI_PROVIDER_UNAVAILABLE,
      message: msg,
      requestReachedProvider: false,
      responseReceived: false,
    };
  } finally {
    clearTimeout(timer);
  }
}
