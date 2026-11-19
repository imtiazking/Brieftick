import { assertUrlAllowed } from './url-safety.mjs';
import { throttleHost } from './rate-limiter.mjs';
import { HTTP_LIMITS, USER_AGENT } from './contract.mjs';
import https from 'node:https';
import { URL } from 'node:url';

function httpsGetOnce(urlString, { caBundlePem, headers, timeoutMs, maxBytes }) {
  return new Promise((resolve) => {
    const url = new URL(urlString);
    const req = https.request(
      {
        hostname: url.hostname,
        port: url.port || 443,
        path: `${url.pathname}${url.search}`,
        method: 'GET',
        ca: caBundlePem,
        rejectUnauthorized: true,
        servername: url.hostname,
        headers,
      },
      (res) => {
        const chunks = [];
        let total = 0;
        res.on('data', (chunk) => {
          total += chunk.length;
          if (total <= maxBytes) chunks.push(chunk);
        });
        res.on('end', () => {
          const body = Buffer.concat(chunks);
          resolve({
            status: res.statusCode || 0,
            headers: res.headers,
            body: total > maxBytes ? null : body,
            tooLarge: total > maxBytes,
          });
        });
      },
    );
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error('timeout'));
    });
    req.on('error', (e) => resolve({ error: e }));
    req.end();
  });
}

function normalizeFetchResponse(gateUrl, res, maxBytes) {
  if (res.error) {
    const cause = res.error.cause?.code || res.error.code || null;
    if (res.error.message === 'timeout') {
      return { ok: false, code: 'TIMEOUT', message: 'Request timed out' };
    }
    return {
      ok: false,
      code: 'NETWORK',
      message: res.error.message || 'Network error',
      networkCause: cause,
    };
  }
  if (res.tooLarge) {
    return { ok: false, code: 'TOO_LARGE', message: `Response exceeds ${maxBytes}` };
  }
  const status = res.status;
  if (status === 401) return { ok: false, code: 'AUTH_REQUIRED', message: 'HTTP 401', httpStatus: 401 };
  if (status === 403) return { ok: false, code: 'ACCESS_RESTRICTED', message: 'HTTP 403', httpStatus: 403 };
  if (status === 429) return { ok: false, code: 'RATE_LIMITED', message: 'HTTP 429', httpStatus: 429 };
  if (status >= 300 && status < 400) {
    const location = res.headers.location;
    if (!location) return { ok: false, code: 'REDIRECT_ERROR', message: 'Redirect without location' };
    return { redirect: new URL(Array.isArray(location) ? location[0] : location, gateUrl).toString() };
  }
  if (status < 200 || status >= 300) {
    return { ok: false, code: 'HTTP_ERROR', message: `HTTP ${status}`, httpStatus: status };
  }
  const contentType = (Array.isArray(res.headers['content-type'])
    ? res.headers['content-type'][0]
    : res.headers['content-type']) || '';
  return {
    ok: true,
    url: gateUrl.toString(),
    finalUrl: gateUrl.toString(),
    httpStatus: status,
    contentType,
    body: res.body,
  };
}

export async function httpGet(urlString, options = {}) {
  const allowedHosts = options.allowedHosts || [];
  const timeoutMs = options.timeoutMs ?? HTTP_LIMITS.timeoutMs;
  const maxBytes = options.maxBytes ?? HTTP_LIMITS.maxResponseBytes;
  const maxRedirects = options.maxRedirects ?? HTTP_LIMITS.maxRedirects;
  const headers = {
    'User-Agent': options.userAgent ?? USER_AGENT,
    Accept:
      options.accept ??
      'application/rss+xml, application/atom+xml, application/xml, text/xml, text/html;q=0.8, */*;q=0.5',
  };

  let currentUrl = urlString;
  let redirects = 0;

  while (redirects <= maxRedirects) {
    const gate = assertUrlAllowed(currentUrl, allowedHosts);
    if (!gate.ok) return { ok: false, ...gate };

    await throttleHost(gate.url.hostname, options.minIntervalMs ?? HTTP_LIMITS.minIntervalMs);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      let raw;
      if (options.caBundlePem) {
        raw = await httpsGetOnce(gate.url.toString(), {
          caBundlePem: options.caBundlePem,
          headers,
          timeoutMs,
          maxBytes,
        });
      } else {
        const res = await fetch(gate.url.toString(), {
          method: 'GET',
          headers,
          signal: controller.signal,
          redirect: 'manual',
        });
        clearTimeout(timer);
        if (res.status >= 300 && res.status < 400) {
          const location = res.headers.get('location');
          if (!location) return { ok: false, code: 'REDIRECT_ERROR', message: 'Redirect without location' };
          currentUrl = new URL(location, gate.url).toString();
          redirects += 1;
          continue;
        }
        if (!res.ok) {
          if (res.status === 401) return { ok: false, code: 'AUTH_REQUIRED', message: 'HTTP 401', httpStatus: 401 };
          if (res.status === 403) return { ok: false, code: 'ACCESS_RESTRICTED', message: 'HTTP 403', httpStatus: 403 };
          if (res.status === 429) return { ok: false, code: 'RATE_LIMITED', message: 'HTTP 429', httpStatus: 429 };
          return { ok: false, code: 'HTTP_ERROR', message: `HTTP ${res.status}`, httpStatus: res.status };
        }
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length > maxBytes) {
          return { ok: false, code: 'TOO_LARGE', message: `Response ${buf.length} exceeds ${maxBytes}` };
        }
        return {
          ok: true,
          url: gate.url.toString(),
          finalUrl: gate.url.toString(),
          httpStatus: res.status,
          contentType: res.headers.get('content-type') || '',
          body: buf,
        };
      }
      clearTimeout(timer);

      const normalized = normalizeFetchResponse(gate.url, raw, maxBytes);
      if (normalized.redirect) {
        currentUrl = normalized.redirect;
        redirects += 1;
        continue;
      }
      return normalized;
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
