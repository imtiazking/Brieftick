/**
 * Provider health probes for /api/proxy?provider=status
 * Never returns API keys or upstream response bodies.
 * @module api/provider-health
 */

const PROBE_TIMEOUT_MS = 14_000;

/** @type {{ at: string, providers: object[], summary: object } | null} */
let lastProbeReport = null;

/**
 * @param {string} msg
 */
function safeMessage(msg) {
  return String(msg || '')
    .replace(/api[_-]?key[=:]\s*\S+/gi, '[redacted]')
    .replace(/token[=:]\s*\S+/gi, '[redacted]')
    .replace(/sk-[a-zA-Z0-9_-]+/g, '[redacted]')
    .slice(0, 240);
}

/**
 * @param {number} httpStatus
 * @param {object} [body]
 */
function classifyProbe(httpStatus, body) {
  if (httpStatus === 429 || body?.code === 429) return 'rate_limited';
  if (httpStatus === 403 || httpStatus === 401) return 'forbidden';
  if (body?.timedOut || body?.error === 'Probe timed out') return 'delayed';
  if (httpStatus >= 200 && httpStatus < 300) return 'ok';
  return 'error';
}

/**
 * @param {Request} req
 */
export function isProbeAuthorized(req) {
  const secret = process.env.HEALTH_PROBE_SECRET;
  if (!secret || secret.length < 8) return false;
  const header =
    req.headers['x-brieftick-health-key'] ||
    req.headers['x-brieftick-health-secret'];
  return typeof header === 'string' && header === secret;
}

/**
 * @param {string} url
 * @param {RequestInit} [init]
 */
async function fetchProbe(url, init = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
  try {
    const r = await fetch(url, { ...init, signal: ctrl.signal });
    let body = null;
    const ct = r.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      try {
        body = await r.json();
      } catch {
        body = null;
      }
    } else {
      await r.text().catch(() => '');
    }
    return { httpStatus: r.status, body };
  } catch (e) {
    const timedOut = e.name === 'AbortError';
    const msg = timedOut ? 'Probe timed out' : e.message;
    return { httpStatus: 0, body: { error: safeMessage(msg), timedOut } };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @param {object} p
 */
function providerRow(p) {
  return {
    id: p.id,
    name: p.name,
    envVar: p.envVar,
    envPresent: p.envPresent,
    lastTestStatus: p.lastTestStatus,
    httpStatus: p.httpStatus ?? null,
    message: p.message,
    testedAt: p.testedAt ?? null,
    probe: p.probe || null,
  };
}

/**
 * @typedef {object} ProviderDef
 * @property {string} id
 * @property {string} name
 * @property {string} envVar
 * @property {() => boolean} hasKey
 * @property {() => Promise<object>} [runProbe]
 */

/** @type {ProviderDef[]} */
const PROVIDERS = [
  {
    id: 'finnhub',
    name: 'Finnhub',
    envVar: 'FINNHUB_KEY',
    hasKey: () => !!process.env.FINNHUB_KEY,
    async runProbe() {
      const key = process.env.FINNHUB_KEY;
      if (!key) {
        return { lastTestStatus: 'error', httpStatus: null, message: 'FINNHUB_KEY not set' };
      }
      const url = `https://finnhub.io/api/v1/quote?symbol=AAPL&token=${encodeURIComponent(key)}`;
      const { httpStatus, body } = await fetchProbe(url);
      const status = classifyProbe(httpStatus, body);
      if (status === 'ok' && body?.c > 0) {
        return { lastTestStatus: 'ok', httpStatus, message: 'Quote endpoint returned valid price' };
      }
      if (status === 'rate_limited') {
        return { lastTestStatus: 'rate_limited', httpStatus, message: 'Finnhub rate limit' };
      }
      return {
        lastTestStatus: status,
        httpStatus,
        message: safeMessage(body?.error || body?.message || 'Quote probe failed'),
      };
    },
  },
  {
    id: 'polygon',
    name: 'Polygon',
    envVar: 'POLYGON_KEY',
    hasKey: () => !!process.env.POLYGON_KEY,
    async runProbe() {
      const key = process.env.POLYGON_KEY;
      if (!key) {
        return { lastTestStatus: 'error', httpStatus: null, message: 'POLYGON_KEY not set' };
      }
      const url =
        `https://api.polygon.io/v3/snapshot/options/SPY?limit=2&apiKey=${encodeURIComponent(key)}`;
      const { httpStatus, body } = await fetchProbe(url, {
        headers: { 'User-Agent': 'FORGENIQ/1.0 health-probe' },
      });
      const status = classifyProbe(httpStatus, body);
      if (status === 'ok' && Array.isArray(body?.results)) {
        return {
          lastTestStatus: 'ok',
          httpStatus,
          message: `Options snapshot OK (${body.results.length} contracts)`,
          probe: 'v3/snapshot/options/SPY',
        };
      }
      if (status === 'forbidden') {
        return {
          lastTestStatus: 'forbidden',
          httpStatus,
          message: 'Polygon rejected request (403) — check plan or key permissions for options snapshots',
          probe: 'v3/snapshot/options/SPY',
        };
      }
      if (status === 'rate_limited') {
        return {
          lastTestStatus: 'rate_limited',
          httpStatus,
          message: 'Polygon rate limit',
          probe: 'v3/snapshot/options/SPY',
        };
      }
      return {
        lastTestStatus: status,
        httpStatus,
        message: safeMessage(body?.error || body?.message || 'Options snapshot probe failed'),
        probe: 'v3/snapshot/options/SPY',
      };
    },
  },
  {
    id: 'twelvedata',
    name: 'Twelve Data',
    envVar: 'TWELVE_DATA_KEY',
    hasKey: () => !!process.env.TWELVE_DATA_KEY,
    async runProbe() {
      const key = process.env.TWELVE_DATA_KEY;
      if (!key) {
        return { lastTestStatus: 'error', httpStatus: null, message: 'TWELVE_DATA_KEY not set' };
      }
      const url = `https://api.twelvedata.com/quote?symbol=AAPL&apikey=${encodeURIComponent(key)}`;
      const { httpStatus, body } = await fetchProbe(url);
      let status = classifyProbe(httpStatus, body);
      if (body?.code === 429 || body?.status === 'error' && body?.code === 429) status = 'rate_limited';
      if (status === 'ok' && body?.close != null) {
        return { lastTestStatus: 'ok', httpStatus, message: 'Quote endpoint returned price', probe: 'quote/AAPL' };
      }
      if (status === 'rate_limited') {
        return {
          lastTestStatus: 'rate_limited',
          httpStatus: httpStatus || 429,
          message: safeMessage(body?.message || 'Daily or per-minute API credits exhausted'),
          probe: 'quote/AAPL',
        };
      }
      return {
        lastTestStatus: status,
        httpStatus,
        message: safeMessage(body?.message || body?.error || 'Quote probe failed'),
        probe: 'quote/AAPL',
      };
    },
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    envVar: 'ANTHROPIC_KEY',
    hasKey: () => !!(process.env.ANTHROPIC_KEY || process.env.ANTHROPIC_API_KEY),
    async runProbe() {
      const key = process.env.ANTHROPIC_KEY || process.env.ANTHROPIC_API_KEY;
      if (!key) {
        return {
          lastTestStatus: 'error',
          httpStatus: null,
          message: 'ANTHROPIC_KEY or ANTHROPIC_API_KEY not set',
        };
      }
      const model = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';
      const { httpStatus, body } = await fetchProbe('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: 8,
          messages: [{ role: 'user', content: 'Reply with exactly: ok' }],
        }),
      });
      const status = classifyProbe(httpStatus, body);
      if (status === 'ok' && body?.content) {
        return { lastTestStatus: 'ok', httpStatus, message: 'Messages API responded', probe: 'v1/messages' };
      }
      if (status === 'forbidden') {
        return { lastTestStatus: 'forbidden', httpStatus, message: 'Anthropic auth failed', probe: 'v1/messages' };
      }
      if (status === 'rate_limited') {
        return { lastTestStatus: 'rate_limited', httpStatus, message: 'Anthropic rate limit', probe: 'v1/messages' };
      }
      return {
        lastTestStatus: status,
        httpStatus,
        message: safeMessage(body?.error?.message || body?.error?.type || 'Messages probe failed'),
        probe: 'v1/messages',
      };
    },
  },
  {
    id: 'fred',
    name: 'FRED (macro)',
    envVar: '(none — public CSV)',
    hasKey: () => true,
    async runProbe() {
      const coed = new Date().toISOString().slice(0, 10);
      const cosd = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
      const url =
        `https://fred.stlouisfed.org/graph/fredgraph.csv?id=VIXCLS&cosd=${cosd}&coed=${coed}`;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
      try {
        const r = await fetch(url, {
          signal: ctrl.signal,
          headers: { 'User-Agent': 'FORGENIQ/1.0 health-probe', Accept: 'text/csv,*/*' },
        });
        const text = await r.text();
        if (r.status >= 200 && r.status < 300 && text.includes('VIXCLS')) {
          return { lastTestStatus: 'ok', httpStatus: r.status, message: 'VIXCLS CSV reachable', probe: 'VIXCLS' };
        }
        return {
          lastTestStatus: classifyProbe(r.status),
          httpStatus: r.status,
          message: 'FRED CSV fetch failed or empty',
          probe: 'VIXCLS',
        };
      } catch (e) {
        const timedOut = e.name === 'AbortError';
        return {
          lastTestStatus: timedOut ? 'delayed' : 'error',
          httpStatus: timedOut ? null : 0,
          message: timedOut ? 'Delayed / timeout' : safeMessage(e.message),
          probe: 'VIXCLS',
        };
      } finally {
        clearTimeout(timer);
      }
    },
  },
  {
    id: 'yahoo',
    name: 'Yahoo Chart (public)',
    envVar: '(none — public)',
    hasKey: () => true,
    async runProbe() {
      const url =
        'https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC?interval=1d&range=5d';
      const { httpStatus, body } = await fetchProbe(url, {
        headers: { 'User-Agent': 'FORGENIQ/1.0 health-probe' },
      });
      if (httpStatus >= 200 && httpStatus < 300 && body?.chart?.result?.[0]) {
        return { lastTestStatus: 'ok', httpStatus, message: 'Index chart reachable', probe: '^GSPC' };
      }
      const status = classifyProbe(httpStatus, body);
      return {
        lastTestStatus: status,
        httpStatus,
        message: safeMessage(body?.error || 'Yahoo chart probe failed'),
        probe: '^GSPC',
      };
    },
  },
];

/**
 * Env-only snapshot (safe for unauthenticated callers).
 */
export function buildEnvOnlyStatus() {
  const at = new Date().toISOString();
  const providers = PROVIDERS.map((def) =>
    providerRow({
      id: def.id,
      name: def.name,
      envVar: def.envVar,
      envPresent: def.hasKey(),
      lastTestStatus: 'unknown',
      httpStatus: null,
      message: 'Live probe not run (admin key required)',
      testedAt: null,
    })
  );

  const legacy = {};
  for (const p of providers) {
    if (p.id === 'finnhub') legacy.finnhub = p.envPresent;
    if (p.id === 'polygon') legacy.polygon = p.envPresent;
    if (p.id === 'twelvedata') legacy.twelvedata = p.envPresent;
    if (p.id === 'anthropic') legacy.anthropic = p.envPresent;
  }
  legacy.alphavantage = !!process.env.ALPHA_VANTAGE_KEY;
  legacy.formspree = !!process.env.FORMSPREE_ID;
  legacy.signup_webhook = !!process.env.SIGNUP_WEBHOOK_URL;

  return {
    ...legacy,
    schema: 'brieftick-provider-health-v1',
    at,
    probeAuthorized: false,
    probeHint:
      'Set HEALTH_PROBE_SECRET on Vercel, then GET /api/proxy?provider=status&probe=1 with header x-brieftick-health-key',
    providers,
    lastProbe: lastProbeReport?.at || null,
  };
}

/**
 * Run live upstream probes (admin only).
 */
export async function runProviderProbes() {
  const testedAt = new Date().toISOString();
  const results = await Promise.all(
    PROVIDERS.map(async (def) => {
      const envPresent = def.hasKey();
      if (!envPresent && def.envVar !== '(none — public CSV)' && def.envVar !== '(none — public)') {
        return providerRow({
          id: def.id,
          name: def.name,
          envVar: def.envVar,
          envPresent: false,
          lastTestStatus: 'error',
          httpStatus: null,
          message: `${def.envVar} not configured`,
          testedAt,
        });
      }
      try {
        const probe = await def.runProbe();
        return providerRow({
          id: def.id,
          name: def.name,
          envVar: def.envVar,
          envPresent,
          testedAt,
          ...probe,
        });
      } catch (e) {
        return providerRow({
          id: def.id,
          name: def.name,
          envVar: def.envVar,
          envPresent,
          lastTestStatus: 'error',
          httpStatus: null,
          message: safeMessage(e.message),
          testedAt,
        });
      }
    })
  );

  const summary = {
    ok: results.filter((r) => r.lastTestStatus === 'ok').length,
    rate_limited: results.filter((r) => r.lastTestStatus === 'rate_limited').length,
    forbidden: results.filter((r) => r.lastTestStatus === 'forbidden').length,
    delayed: results.filter((r) => r.lastTestStatus === 'delayed').length,
    error: results.filter((r) => r.lastTestStatus === 'error').length,
    unknown: results.filter((r) => r.lastTestStatus === 'unknown').length,
  };

  const report = { at: testedAt, providers: results, summary };
  lastProbeReport = report;
  return report;
}

/**
 * @param {Request} req
 */
export async function buildProviderStatusResponse(req) {
  const wantProbe = req.query.probe === '1' || req.query.probe === 'true';
  const authorized = wantProbe && isProbeAuthorized(req);

  if (authorized) {
    const report = await runProviderProbes();
    const legacy = {
      finnhub: report.providers.find((p) => p.id === 'finnhub')?.envPresent ?? false,
      polygon: report.providers.find((p) => p.id === 'polygon')?.envPresent ?? false,
      twelvedata: report.providers.find((p) => p.id === 'twelvedata')?.envPresent ?? false,
      anthropic: report.providers.find((p) => p.id === 'anthropic')?.envPresent ?? false,
      alphavantage: !!process.env.ALPHA_VANTAGE_KEY,
      formspree: !!process.env.FORMSPREE_ID,
      signup_webhook: !!process.env.SIGNUP_WEBHOOK_URL,
    };
    return {
      status: 200,
      body: {
        ...legacy,
        schema: 'brieftick-provider-health-v1',
        at: report.at,
        probeAuthorized: true,
        providers: report.providers,
        summary: report.summary,
      },
    };
  }

  if (wantProbe && !authorized) {
    return {
      status: 403,
      body: {
        error: 'probe forbidden',
        message:
          'Live probes require header x-brieftick-health-key matching HEALTH_PROBE_SECRET. Env-only status is available without probe=1.',
        ...buildEnvOnlyStatus(),
      },
    };
  }

  return { status: 200, body: buildEnvOnlyStatus() };
}
