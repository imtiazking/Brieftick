import { createHash } from 'node:crypto';
import { assertUrlAllowed } from './url-safety.mjs';
import { assertApprovedPrimaryPdfUrl, APPROVED_PRIMARY_PDF_SOURCES } from './regulatory-pdf-allowlist.mjs';

export const DEFAULT_PDF_RETRIEVAL_CONFIG = {
  userAgent: 'FORGENIQ-Regulatory-Ingestion/1.0 (+https://forgeniq.com)',
  timeoutMs: 45_000,
  maxRedirects: 5,
  maxFileBytes: 15 * 1024 * 1024,
  maxRetries: 2,
};

const RETRY_STATUS = new Set([429, 502, 503, 504]);
const PDF_MAGIC = Buffer.from('%PDF-', 'ascii');

/**
 * @param {Buffer} body
 */
export function validatePdfSignature(body) {
  if (!body?.length || body.length < 5) {
    return { ok: false, code: 'PDF_TOO_SMALL', message: 'PDF bytes too small' };
  }
  if (!body.subarray(0, 5).equals(PDF_MAGIC)) {
    return { ok: false, code: 'PDF_SIGNATURE_INVALID', message: 'Missing %PDF- header' };
  }
  return { ok: true };
}

/**
 * @param {string} contentType
 */
export function validatePdfContentType(contentType) {
  const ct = (contentType || '').toLowerCase();
  if (!ct || ct.includes('pdf') || ct === 'application/octet-stream') {
    return { ok: true };
  }
  return { ok: false, code: 'CONTENT_TYPE_UNSUPPORTED', message: `Expected PDF, got ${contentType || 'unknown'}` };
}

export function sha256Buffer(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

/**
 * Controlled HTTPS PDF download with SSRF protection and redirect re-validation.
 *
 * @param {string} urlString
 * @param {object} options
 * @param {string} options.sourceExternalKey
 * @param {string[]} [options.allowedHosts] extra hosts (merged with policy)
 * @param {typeof fetch} [options.fetchImpl]
 * @param {object} [options.config]
 */
export async function retrieveRegulatoryPrimaryPdf(urlString, options = {}) {
  const cfg = { ...DEFAULT_PDF_RETRIEVAL_CONFIG, ...options.config };
  const approved = assertApprovedPrimaryPdfUrl(options.sourceExternalKey, urlString);
  if (!approved.ok) return approved;

  const policy = APPROVED_PRIMARY_PDF_SOURCES[options.sourceExternalKey];
  const allowedHosts = [
    ...new Set([...(options.allowedHosts || []), ...(policy?.allowedHosts || [])]),
  ];
  if (!allowedHosts.length) {
    return { ok: false, code: 'HOST_POLICY_MISSING', message: 'No allowlisted hosts for source' };
  }

  let attempt = 0;
  let currentUrl = approved.url;
  const redirectTrail = [currentUrl];
  const fetchImpl = options.fetchImpl || fetch;

  while (attempt <= cfg.maxRetries) {
    const allowed = assertUrlAllowed(currentUrl, allowedHosts);
    if (!allowed.ok) return allowed;

    try {
      const result = await fetchPdfOnce(fetchImpl, currentUrl, cfg);
      if (result.redirect) {
        if (redirectTrail.length >= cfg.maxRedirects) {
          return { ok: false, code: 'TOO_MANY_REDIRECTS', message: 'Redirect limit exceeded', redirectTrail };
        }
        const nextApproved = assertApprovedPrimaryPdfUrl(options.sourceExternalKey, result.location);
        if (!nextApproved.ok) return nextApproved;
        currentUrl = nextApproved.url;
        redirectTrail.push(currentUrl);
        continue;
      }
      if (!result.ok) {
        if (RETRY_STATUS.has(result.status) && attempt < cfg.maxRetries) {
          attempt += 1;
          await sleep(500 * attempt);
          continue;
        }
        return result;
      }

      const ctCheck = validatePdfContentType(result.contentType);
      if (!ctCheck.ok) return ctCheck;

      const body = Buffer.from(result.body);
      if (body.length > cfg.maxFileBytes) {
        return {
          ok: false,
          code: 'DOCUMENT_TOO_LARGE',
          message: `PDF exceeds ${cfg.maxFileBytes} bytes`,
        };
      }

      const sig = validatePdfSignature(body);
      if (!sig.ok) return sig;

      const contentSha256 = sha256Buffer(body);
      return {
        ok: true,
        url: currentUrl,
        originalUrl: urlString,
        finalUrl: currentUrl,
        redirectTrail,
        contentType: result.contentType,
        byteLength: body.length,
        body,
        contentSha256,
        retrievedAt: new Date().toISOString(),
      };
    } catch (e) {
      if (attempt >= cfg.maxRetries) {
        return { ok: false, code: 'RETRIEVAL_FAILED', message: e.message || 'Network error' };
      }
      attempt += 1;
      await sleep(500 * attempt);
    }
  }
  return { ok: false, code: 'RETRIEVAL_FAILED', message: 'Exhausted retries' };
}

async function fetchPdfOnce(fetchImpl, url, cfg) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);
  try {
    const res = await fetchImpl(url, {
      method: 'GET',
      headers: { 'User-Agent': cfg.userAgent, Accept: 'application/pdf,*/*' },
      signal: controller.signal,
      redirect: 'manual',
    });
    clearTimeout(timer);
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (!location) return { redirect: true, location: null };
      return { redirect: true, location: new URL(location, url).toString() };
    }
    if (!res.ok) {
      return { ok: false, code: 'HTTP_ERROR', status: res.status, message: `HTTP ${res.status}` };
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const contentType = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    return { ok: true, status: res.status, contentType, body: buf };
  } catch (e) {
    clearTimeout(timer);
    if (e.name === 'AbortError') {
      throw Object.assign(new Error('timeout'), { code: 'TIMEOUT' });
    }
    throw e;
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
