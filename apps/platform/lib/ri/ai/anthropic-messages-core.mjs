/** Shared Anthropic Messages helpers (no server-only — safe for acceptance scripts). */

export const AI_ERROR_CODES = {
  AI_PROVIDER_UNAVAILABLE: 'AI_PROVIDER_UNAVAILABLE',
  AI_PROVIDER_NOT_CONFIGURED: 'AI_PROVIDER_NOT_CONFIGURED',
  AI_PROVIDER_RATE_LIMITED: 'AI_PROVIDER_RATE_LIMITED',
  AI_TIMEOUT: 'AI_TIMEOUT',
  AI_OUTPUT_SCHEMA_INVALID: 'AI_OUTPUT_SCHEMA_INVALID',
};

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
      return mapAnthropicHttpFailure(res.status, body);
    }

    const content = body.content;
    const text =
      Array.isArray(content) && content[0] && typeof content[0] === 'object' && content[0].text
        ? String(content[0].text)
        : '';

    if (!text.trim()) {
      return { ok: false, code: AI_ERROR_CODES.AI_PROVIDER_UNAVAILABLE, message: 'Empty Anthropic response.' };
    }

    return {
      ok: true,
      text,
      requestId: typeof body.id === 'string' ? body.id : null,
      inputTokens: body.usage?.input_tokens ?? null,
      outputTokens: body.usage?.output_tokens ?? null,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Anthropic request failed';
    if (msg.includes('abort') || msg.includes('Abort')) {
      return { ok: false, code: AI_ERROR_CODES.AI_TIMEOUT, message: 'Anthropic request timed out.' };
    }
    return { ok: false, code: AI_ERROR_CODES.AI_PROVIDER_UNAVAILABLE, message: msg };
  } finally {
    clearTimeout(timer);
  }
}
