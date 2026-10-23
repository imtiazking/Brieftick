/**
 * Central HTTP retrieval for regulatory connectors (GET/HEAD only).
 */
import { assertUrlAllowed } from './url-safety.js';
import { CONNECTOR_ERRORS, connectorError } from './connector-errors.js';
import { throttleHost, DEFAULT_RATE_CONFIG } from './rate-limiter.js';

export const DEFAULT_HTTP_CONFIG = {
  userAgent: 'FORGENIQ-Regulatory-Research/DesignLab (+https://forgeniq.lab/design-lab)',
  timeoutMs: 20000,
  maxRedirects: 5,
  maxHtmlBytes: 2 * 1024 * 1024,
  maxFileBytes: 15 * 1024 * 1024,
  maxRetries: 2,
  rateLimit: DEFAULT_RATE_CONFIG,
};

const RETRY_STATUS = new Set([429, 502, 503, 504]);

export async function httpGet(urlString, options = {}) {
  const cfg = { ...DEFAULT_HTTP_CONFIG, ...options };
  const allowed = assertUrlAllowed(urlString, options.allowedHosts || []);
  if (!allowed.ok) return allowed;

  let attempt = 0;
  let currentUrl = allowed.url.toString();
  const redirectTrail = [currentUrl];

  while (attempt <= cfg.maxRetries) {
    const release = await throttleHost(allowed.url.hostname, cfg.rateLimit);
    try {
      const result = await fetchWithTimeout(currentUrl, cfg);
      release();
      if (result && result.ok === false) return result;
      if (result.redirect && redirectTrail.length < cfg.maxRedirects) {
        const next = result.location;
        const nextCheck = assertUrlAllowed(next, options.allowedHosts || []);
        if (!nextCheck.ok) return nextCheck;
        currentUrl = nextCheck.url.toString();
        redirectTrail.push(currentUrl);
        continue;
      }
      if (result.redirect) {
        return connectorError(CONNECTOR_ERRORS.RETRIEVAL_TIMEOUT, 'Too many redirects', { redirectTrail });
      }
      const limit = pickSizeLimit(result.contentType, cfg);
      if (result.body.length > limit) {
        return connectorError(CONNECTOR_ERRORS.DOCUMENT_TOO_LARGE, `Response exceeds ${limit} bytes`);
      }
      return {
        ok: true,
        url: currentUrl,
        originalUrl: urlString,
        finalUrl: currentUrl,
        redirectCount: redirectTrail.length - 1,
        redirectTrail,
        status: result.status,
        contentType: result.contentType,
        body: result.body,
        correlationId: options.correlationId || null,
      };
    } catch (e) {
      release();
      if (e.code === 'TIMEOUT') {
        if (attempt >= cfg.maxRetries) {
          return connectorError(CONNECTOR_ERRORS.RETRIEVAL_TIMEOUT, 'Request timed out');
        }
      } else if (attempt >= cfg.maxRetries) {
        return connectorError(CONNECTOR_ERRORS.SOURCE_UNAVAILABLE, e.message || 'Network error');
      }
      attempt += 1;
      if (e.retryAfterMs) await sleep(e.retryAfterMs);
      else await sleep(500 * attempt);
    }
  }
  return connectorError(CONNECTOR_ERRORS.SOURCE_UNAVAILABLE, 'Request failed after retries');
}

async function fetchWithTimeout(url, cfg) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'User-Agent': cfg.userAgent, Accept: '*/*' },
      signal: controller.signal,
      redirect: 'manual',
    });
    clearTimeout(timer);
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (!location) return { redirect: true, location: null };
      return { redirect: true, location: new URL(location, url).toString() };
    }
    if (res.status === 401 || res.status === 403) {
      const err = connectorError(CONNECTOR_ERRORS.ACCESS_DENIED, `HTTP ${res.status}`);
      throw Object.assign(new Error(err.message), { fatal: true, result: err });
    }
    if (res.status === 429) {
      const ra = parseRetryAfter(res.headers.get('Retry-After'));
      const err = connectorError(CONNECTOR_ERRORS.RATE_LIMITED, 'Rate limited');
      throw Object.assign(new Error(err.message), { retryAfterMs: ra, result: err });
    }
    if (!res.ok) {
      if (RETRY_STATUS.has(res.status) && cfg.maxRetries > 0) {
        throw new Error(`HTTP ${res.status}`);
      }
      return connectorError(CONNECTOR_ERRORS.SOURCE_UNAVAILABLE, `HTTP ${res.status}`);
    }
    const buf = await res.arrayBuffer();
    const contentType = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    return { status: res.status, contentType, body: new Uint8Array(buf) };
  } catch (e) {
    clearTimeout(timer);
    if (e.fatal && e.result) return e.result;
    if (e.name === 'AbortError') {
      const err = new Error('timeout');
      err.code = 'TIMEOUT';
      throw err;
    }
    throw e;
  }
}

function pickSizeLimit(contentType, cfg) {
  if (contentType && contentType.includes('pdf')) return cfg.maxFileBytes;
  return cfg.maxHtmlBytes;
}

function parseRetryAfter(header) {
  if (!header) return 3000;
  const sec = Number(header);
  if (!Number.isNaN(sec)) return sec * 1000;
  const d = Date.parse(header);
  if (!Number.isNaN(d)) return Math.max(0, d - Date.now());
  return 3000;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Test hook — simulate HTTP without network. */
export function createMockHttpClient(handler) {
  return async (url, options) => handler(url, options);
}
