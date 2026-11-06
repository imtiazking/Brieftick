/**
 * Injectable OpenAI HTTP transport (Node bridge / tests). No secrets in return values.
 */
const DEFAULT_TIMEOUT_MS = 60000;

export function mapHttpErrorToCode(status, bodyText = '') {
  if (status === 401 || status === 403) return 'AUTH_ERROR';
  if (status === 429) return 'RATE_LIMITED';
  if (status >= 500) return 'PROVIDER_ERROR';
  if (/refusal|refused/i.test(bodyText)) return 'REFUSAL';
  return 'PROVIDER_ERROR';
}

export async function postJson(url, { headers, body, timeoutMs = DEFAULT_TIMEOUT_MS, transport }) {
  const doFetch = transport || globalThis.fetch;
  if (!doFetch) throw new Error('fetch unavailable');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await doFetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { raw: text };
    }
    return { ok: res.ok, status: res.status, json, text };
  } catch (e) {
    if (e?.name === 'AbortError') {
      return { ok: false, status: 0, json: null, text: '', aborted: true };
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export async function postJsonWithRetry(url, options) {
  const first = await postJson(url, options);
  if (first.ok) return { ...first, attempts: 1 };
  const retryable =
    first.aborted ||
    first.status === 429 ||
    (first.status >= 500 && first.status < 600);
  if (!retryable) return { ...first, attempts: 1 };
  const second = await postJson(url, options);
  return { ...second, attempts: 2 };
}
