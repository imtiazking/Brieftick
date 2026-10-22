import { assertUrlAllowed } from './url-safety.mjs';
import { throttleHost } from './rate-limiter.mjs';
import { HTTP_LIMITS, USER_AGENT } from './contract.mjs';

export async function httpGet(urlString, options = {}) {
  const allowedHosts = options.allowedHosts || [];
  const timeoutMs = options.timeoutMs ?? HTTP_LIMITS.timeoutMs;
  const maxBytes = options.maxBytes ?? HTTP_LIMITS.maxResponseBytes;
  const maxRedirects = options.maxRedirects ?? HTTP_LIMITS.maxRedirects;

  let currentUrl = urlString;
  let redirects = 0;

  while (redirects <= maxRedirects) {
    const gate = assertUrlAllowed(currentUrl, allowedHosts);
    if (!gate.ok) return { ok: false, ...gate };

    await throttleHost(gate.url.hostname, options.minIntervalMs ?? HTTP_LIMITS.minIntervalMs);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(gate.url.toString(), {
        method: 'GET',
        headers: {
          'User-Agent': options.userAgent ?? USER_AGENT,
          Accept: options.accept ?? 'application/rss+xml, application/atom+xml, application/xml, text/xml, text/html;q=0.8, */*;q=0.5',
        },
        signal: controller.signal,
        redirect: 'manual',
      });
      clearTimeout(timer);

      if (res.status === 401) {
        return { ok: false, code: 'AUTH_REQUIRED', message: 'HTTP 401', httpStatus: 401 };
      }
      if (res.status === 403) {
        return { ok: false, code: 'ACCESS_RESTRICTED', message: 'HTTP 403', httpStatus: 403 };
      }
      if (res.status === 429) {
        return { ok: false, code: 'RATE_LIMITED', message: 'HTTP 429', httpStatus: 429 };
      }
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get('location');
        if (!location) return { ok: false, code: 'REDIRECT_ERROR', message: 'Redirect without location' };
        currentUrl = new URL(location, gate.url).toString();
        redirects += 1;
        continue;
      }
      if (!res.ok) {
        return { ok: false, code: 'HTTP_ERROR', message: `HTTP ${res.status}`, httpStatus: res.status };
      }

      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > maxBytes) {
        return { ok: false, code: 'TOO_LARGE', message: `Response ${buf.length} exceeds ${maxBytes}` };
      }
      const contentType = res.headers.get('content-type') || '';
      return {
        ok: true,
        url: gate.url.toString(),
        finalUrl: gate.url.toString(),
        httpStatus: res.status,
        contentType,
        body: buf,
      };
    } catch (e) {
      clearTimeout(timer);
      if (e.name === 'AbortError') {
        return { ok: false, code: 'TIMEOUT', message: 'Request timed out' };
      }
      const cause = e.cause?.code || e.code || null;
      return {
        ok: false,
        code: 'NETWORK',
        message: e.message || 'Network error',
        networkCause: cause,
      };
    }
  }
  return { ok: false, code: 'TOO_MANY_REDIRECTS', message: 'Redirect limit exceeded' };
}
