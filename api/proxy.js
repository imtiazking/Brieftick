/**
 * FORGENIQ API Proxy
 *
 * Routes browser requests to the right provider, attaches the secret API key
 * server-side, and caches responses so visitors share API calls.
 *
 * Cache TTLs:
 *   - Quotes & time series (Twelve Data) ........... 5min (+ stale on 429)
 *   - News headlines (Finnhub) ..................... 60s
 *   - Company news (Finnhub) ....................... 5min
 *   - Earnings calendar (Finnhub) .................. 30min
 *   - Sector performance, news sentiment (AV) ...... 5min
 *   - Technical indicators (AV) .................... 5min
 *   - Public FRED series (macro) ................... 15min
 *   - Yahoo chart (indices / ETF fallback) ......... 10min indices, 45s ETFs
 *   - Anthropic messages ........................... NOT cached (always fresh)
 */

// In-memory cache. Vercel reuses warm instances, so this persists for the
// container's lifetime (often several minutes).
const cache = new Map();

function cacheGet(key, ttlMs) {
  const e = cache.get(key);
  if (!e) return null;
  if (Date.now() - e.t > ttlMs) {
    cache.delete(key);
    return null;
  }
  return e.v;
}

function cacheSet(key, value) {
  cache.set(key, { t: Date.now(), v: value });
  // Crude eviction so the cache cannot grow without bound.
  if (cache.size > 500) {
    const entries = [...cache.entries()].sort((a, b) => a[1].t - b[1].t);
    for (let i = 0; i < 100; i++) cache.delete(entries[i][0]);
  }
}

/** @type {Map<string, { t: number, v: unknown }>} */
const staleCache = new Map();

function staleGet(key) {
  return staleCache.get(key)?.v ?? null;
}

function staleSet(key, value) {
  staleCache.set(key, { t: Date.now(), v: value });
}

let twelveDataCircuitUntil = 0;

// CORS: allow any origin to hit /api/* so the same code works locally + on Vercel.
function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, x-api-key, anthropic-version, x-brieftick-health-key, x-brieftick-health-secret'
  );
}

async function proxyTwelveData(req, res) {
  const { endpoint, ...params } = req.query;
  const key = process.env.TWELVE_DATA_KEY;
  if (!key) return res.status(500).json({ error: 'TWELVE_DATA_KEY not set on server' });
  if (!endpoint) return res.status(400).json({ error: 'endpoint param required (quote, time_series)' });

  const qs = new URLSearchParams({ ...params, apikey: key }).toString();
  const url = `https://api.twelvedata.com/${endpoint}?${qs}`;
  const cacheKey = `td:${endpoint}:${new URLSearchParams(params).toString()}`;
  const TTL = 5 * 60_000;

  const cached = cacheGet(cacheKey, TTL);
  if (cached) {
    res.setHeader('x-brieftick-cache', 'HIT');
    return res.status(200).json(cached);
  }

  if (Date.now() < twelveDataCircuitUntil) {
    const stale = staleGet(cacheKey);
    if (stale) {
      res.setHeader('x-brieftick-cache', 'STALE');
      return res.status(200).json(stale);
    }
    return res.status(429).json({
      status: 'error',
      code: 429,
      message: 'Twelve Data circuit open — retry after cooldown',
    });
  }

  try {
    const r = await fetch(url);
    const data = await r.json();
    if (r.status === 429 || data?.code === 429) {
      twelveDataCircuitUntil = Date.now() + 5 * 60_000;
      console.warn('[proxy/twelvedata] 429 — circuit open 5min', { endpoint, symbol: params.symbol });
      const stale = staleGet(cacheKey);
      if (stale) {
        res.setHeader('x-brieftick-cache', 'STALE');
        return res.status(200).json(stale);
      }
      return res.status(429).json({ status: 'error', code: 429, message: 'Rate limited', ...data });
    }
    if (r.status >= 200 && r.status < 300 && !(data && data.code)) {
      cacheSet(cacheKey, data);
      staleSet(cacheKey, data);
    }
    res.setHeader('x-brieftick-cache', 'MISS');
    return res.status(r.status >= 400 ? r.status : 200).json(data);
  } catch (e) {
    const stale = staleGet(cacheKey);
    if (stale) {
      res.setHeader('x-brieftick-cache', 'STALE');
      return res.status(200).json(stale);
    }
    return res.status(502).json({ error: 'upstream fetch failed', detail: e.message });
  }
}

async function proxyFinnhub(req, res) {
  const { endpoint, ...params } = req.query;
  const key = process.env.FINNHUB_KEY;
  if (!key) return res.status(500).json({ error: 'FINNHUB_KEY not set on server' });
  if (!endpoint) return res.status(400).json({ error: 'endpoint param required' });

  const qs = new URLSearchParams({ ...params, token: key }).toString();
  const url = `https://finnhub.io/api/v1/${endpoint}?${qs}`;
  const cacheKey = `fh:${endpoint}:${new URLSearchParams(params).toString()}`;

  // TTL depends on endpoint
  let ttl = 60_000; // 1 min default
  if (endpoint === 'company-news') ttl = 5 * 60_000;
  else if (endpoint.startsWith('calendar/earnings')) ttl = 30 * 60_000;
  else if (endpoint === 'news') ttl = 60_000;
  else if (endpoint === 'quote') ttl = 30_000;
  else if (endpoint === 'search') ttl = 60 * 60_000;

  const cached = cacheGet(cacheKey, ttl);
  if (cached) {
    res.setHeader('x-brieftick-cache', 'HIT');
    return res.status(200).json(cached);
  }

  try {
    const r = await fetch(url);
    const data = await r.json();
    if (r.status === 429) {
      return res.status(429).json({ error: 'Rate limited', ...data });
    }
    if (r.status < 400) cacheSet(cacheKey, data);
    res.setHeader('x-brieftick-cache', 'MISS');
    return res.status(r.status >= 400 ? r.status : 200).json(data);
  } catch (e) {
    return res.status(502).json({ error: 'upstream fetch failed', detail: e.message });
  }
}

const YAHOO_INDEX_SYMBOLS = new Set(['^GSPC', '^IXIC', '^DJI', '^VIX']);
const YAHOO_SYMBOL_RE = /^[A-Z0-9^.\-]{1,12}$/;

function normalizeYahooSymbol(raw) {
  return String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9^.\-]/g, '');
}

async function proxyYahooSearch(req, res) {
  const q = String(req.query.q || "").trim();
  if (!q || q.length > 80) {
    return res.status(400).json({ error: "invalid search query" });
  }

  const cacheKey = `yahoo:search:${q.toLowerCase()}`;
  const cached = cacheGet(cacheKey, 60 * 60_000);
  if (cached) {
    res.setHeader("x-brieftick-cache", "HIT");
    return res.status(200).json(cached);
  }

  const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=10&newsCount=0&listsCount=0`;
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": "FORGENIQ/1.0 symbol-search" },
    });
    if (r.status === 429) {
      return res.status(429).json({ ok: false, failureReason: "rate_limited" });
    }
    const raw = await r.json();
    const quotes = raw?.quotes || [];
    const matches = quotes
      .filter((row) => {
        const t = String(row.quoteType || "").toUpperCase();
        return t === "EQUITY" || t === "ETF" || !t;
      })
      .map((row) => ({
        symbol: String(row.symbol || "")
          .toUpperCase()
          .replace(/\.(US|NASDAQ|NYSE)$/i, ""),
        name: row.shortname || row.longname || row.symbol,
        exchange: row.exchange || row.exchDisp || "",
      }))
      .filter((row) => /^[A-Z][A-Z0-9]{0,4}(?:\.[A-Z])?$/.test(row.symbol));

    const data = { ok: true, query: q, matches };
    cacheSet(cacheKey, data);
    res.setHeader("x-brieftick-cache", "MISS");
    return res.status(200).json(data);
  } catch (e) {
    return res.status(502).json({
      ok: false,
      failureReason: "parse_error",
      detail: e.message,
    });
  }
}

async function proxyYahoo(req, res) {
  if (req.query.endpoint === "search") return proxyYahooSearch(req, res);
  return proxyYahooChart(req, res);
}

async function proxyYahooChart(req, res) {
  const symbol = normalizeYahooSymbol(req.query.symbol);
  if (!symbol || !YAHOO_SYMBOL_RE.test(symbol)) {
    return res.status(400).json({
      error: 'invalid Yahoo chart symbol',
      detail: 'Use 1–12 characters: letters, digits, ^ . -',
    });
  }

  const range = String(req.query.range || '5d').replace(/[^a-z0-9]/gi, '') || '5d';
  const wantCloses = req.query.closes === '1' || req.query.closes === 'true';
  const cacheKey = `yahoo:chart:${symbol}:${range}${wantCloses ? ':closes' : ''}`;
  const cacheTtl = YAHOO_INDEX_SYMBOLS.has(symbol) ? 10 * 60_000 : 5 * 60_000;
  const cached = cacheGet(cacheKey, cacheTtl);
  if (cached) {
    res.setHeader('x-brieftick-cache', 'HIT');
    return res.status(200).json(cached);
  }

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=${encodeURIComponent(range)}`;
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': 'FORGENIQ/1.0 market-snapshot' },
    });
    if (r.status === 429) {
      return res.status(429).json({ ok: false, failureReason: 'rate_limited', message: 'Rate limited' });
    }
    const raw = await r.json();
    const result = raw?.chart?.result?.[0];
    const meta = result?.meta;
    const closes = result?.indicators?.quote?.[0]?.close?.filter((n) => Number.isFinite(n)) || [];
    const price = meta?.regularMarketPrice;
    if (!Number.isFinite(price) || price <= 0) {
      return res.status(502).json({
        ok: false,
        failureReason: 'parse_error',
        message: 'Parse error',
        detail: 'missing regularMarketPrice',
      });
    }
    const prev =
      Number.isFinite(meta?.chartPreviousClose) && meta.chartPreviousClose > 0
        ? meta.chartPreviousClose
        : closes.length >= 2
          ? closes[closes.length - 2]
          : null;
    const change = prev != null ? price - prev : null;
    const changePercent = change != null && prev ? (change / prev) * 100 : null;
    const data = {
      ok: true,
      symbol,
      price,
      change,
      changePercent,
      previousClose: prev,
      closes: wantCloses ? closes : undefined,
      updatedAt: meta?.regularMarketTime
        ? new Date(meta.regularMarketTime * 1000).toISOString()
        : new Date().toISOString(),
      source: 'yahoo',
      longName: meta?.longName || meta?.shortName || symbol,
    };
    cacheSet(cacheKey, data);
    res.setHeader('x-brieftick-cache', 'MISS');
    return res.status(200).json(data);
  } catch (e) {
    return res.status(502).json({
      ok: false,
      failureReason: 'parse_error',
      message: 'Parse error',
      detail: e.message,
    });
  }
}

async function proxyAlphaVantage(req, res) {
  const params = { ...req.query };
  const key = process.env.ALPHA_VANTAGE_KEY;
  if (!key) return res.status(500).json({ error: 'ALPHA_VANTAGE_KEY not set on server' });

  const qs = new URLSearchParams({ ...params, apikey: key }).toString();
  const url = `https://www.alphavantage.co/query?${qs}`;
  const cacheKey = `av:${new URLSearchParams(params).toString()}`;

  // Alpha Vantage free is 25 calls/day, so cache aggressively
  const cached = cacheGet(cacheKey, 5 * 60_000); // 5 min
  if (cached) {
    res.setHeader('x-brieftick-cache', 'HIT');
    return res.status(200).json(cached);
  }

  try {
    const r = await fetch(url);
    const data = await r.json();
    // Don't cache empty/rate-limit responses
    if (!data.Note && !data.Information) cacheSet(cacheKey, data);
    res.setHeader('x-brieftick-cache', 'MISS');
    return res.status(200).json(data);
  } catch (e) {
    return res.status(502).json({ error: 'upstream fetch failed', detail: e.message });
  }
}

async function proxyAnthropic(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method not allowed; POST required' });
  }
  // Accept both common env var names
  const key = process.env.ANTHROPIC_KEY || process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(500).json({
    error: 'Anthropic API key not set on server. Add ANTHROPIC_KEY or ANTHROPIC_API_KEY to Vercel environment variables and redeploy.'
  });

  // Model: use env var if set, otherwise keep client's requested model
  const model = process.env.ANTHROPIC_MODEL || req.body?.model || 'claude-haiku-4-5-20251001';
  const body  = { ...req.body, model };

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });
    const data = await r.json();
    // Log errors server-side for easier debugging
    if (data.type === 'error') {
      console.error('[proxy/anthropic] API error:', data.error?.type, data.error?.message, '| model:', model);
    }
    return res.status(r.status).json(data);
  } catch (e) {
    console.error('[proxy/anthropic] fetch failed:', e.message);
    return res.status(502).json({ error: 'upstream fetch failed', detail: e.message });
  }
}

const FRED_ALLOWED_SERIES = new Set([
  'VIXCLS',
  'DGS10',
  'DGS2',
  'DCOILWTICO',
  'SP500',
  'NASDAQCOM',
  'DJIA',
]);

async function fetchFredCsv(series, attempt = 1) {
  // Full-series CSV can exceed serverless timeouts; request a recent window only.
  const coed = new Date().toISOString().slice(0, 10);
  const cosd = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);
  const url =
    `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${encodeURIComponent(series)}` +
    `&cosd=${cosd}&coed=${coed}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 18_000);
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'FORGENIQ/1.0 (market-snapshot; +https://www.forgeniq.com)',
        Accept: 'text/csv,text/plain,*/*',
      },
    });
    const text = await r.text();
    if (!r.ok || text.includes('Gateway Time-out') || text.startsWith('<!DOCTYPE')) {
      return { ok: false, retryable: r.status >= 500 || text.includes('Time-out'), detail: `HTTP ${r.status}` };
    }
    const lines = text.trim().split('\n');
    const points = [];
    for (let i = lines.length - 1; i > 0; i--) {
      const [date, val] = lines[i].split(',');
      if (val && val !== '.' && !Number.isNaN(parseFloat(val))) {
        points.push({ date, value: parseFloat(val) });
        if (points.length >= 2) break;
      }
    }
    if (!points.length) return { ok: false, retryable: attempt < 2, detail: 'no usable rows' };
    return { ok: true, points };
  } catch (e) {
    return { ok: false, retryable: attempt < 2, detail: e.message };
  } finally {
    clearTimeout(timer);
  }
}

/** High-impact US releases for economic calendar (FRED release_id → label). */
const FRED_RELEASE_LABELS = new Map([
  [10, 'Consumer Price Index'],
  [50, 'Employment Situation'],
  [53, 'Gross Domestic Product'],
  [101, 'Retail Sales'],
  [180, 'Producer Price Index'],
  [194, 'FOMC Press Release'],
  [206, 'Industrial Production'],
]);

async function proxyFredCalendar(req, res) {
  const key = process.env.FRED_API_KEY;
  if (!key) {
    return res.status(500).json({ error: 'FRED_API_KEY not set on server' });
  }
  const today = new Date();
  const end = new Date(today.getTime() + 7 * 86400000);
  const fmt = (d) => d.toISOString().slice(0, 10);
  const realtimeStart = fmt(today);
  const realtimeEnd = fmt(end);
  const cacheKey = `fred:calendar:${realtimeStart}:${realtimeEnd}`;
  const cached = cacheGet(cacheKey, 30 * 60_000);
  if (cached) {
    res.setHeader('x-brieftick-cache', 'HIT');
    return res.status(200).json(cached);
  }

  const url =
    `https://api.stlouisfed.org/fred/releases/dates?api_key=${encodeURIComponent(key)}` +
    `&file_type=json&realtime_start=${realtimeStart}&realtime_end=${realtimeEnd}` +
    `&include_release_dates_with_no_data=true&sort_order=asc&limit=100`;

  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'FORGENIQ/1.0' } });
    const body = await r.json();
    if (!r.ok || body?.error_message) {
      console.warn('[proxy/fred/calendar] upstream error', {
        httpStatus: r.status,
        message: body?.error_message || 'unknown',
      });
      return res.status(r.status >= 400 ? r.status : 502).json({
        ok: false,
        error: 'FRED calendar fetch failed',
        detail: body?.error_message || `HTTP ${r.status}`,
      });
    }
    const rows = (body.release_dates || [])
      .filter((row) => FRED_RELEASE_LABELS.has(row.release_id))
      .map((row) => {
        const label = FRED_RELEASE_LABELS.get(row.release_id) || 'Economic release';
        const imp =
          row.release_id === 50 || row.release_id === 10 ? 'high'
            : row.release_id === 194 ? 'med'
              : 'med';
        return {
          when: row.date,
          imp,
          ev: label,
          det: 'US · Federal Reserve Economic Data',
          releaseId: row.release_id,
        };
      });
    const data = { ok: true, source: 'fred', events: rows, from: realtimeStart, to: realtimeEnd };
    cacheSet(cacheKey, data);
    res.setHeader('x-brieftick-cache', 'MISS');
    return res.status(200).json(data);
  } catch (e) {
    return res.status(502).json({ error: 'FRED calendar fetch failed', detail: e.message });
  }
}

async function proxyFred(req, res) {
  if (req.query.endpoint === 'calendar') return proxyFredCalendar(req, res);

  const series = req.query.series || 'VIXCLS';
  if (!FRED_ALLOWED_SERIES.has(series)) {
    return res.status(400).json({ error: 'unsupported FRED series', allowed: [...FRED_ALLOWED_SERIES] });
  }
  const cacheKey = `fred:${series}`;

  const cached = cacheGet(cacheKey, 15 * 60_000);
  if (cached) {
    res.setHeader('x-brieftick-cache', 'HIT');
    return res.status(200).json(cached);
  }

  try {
    let fetched = await fetchFredCsv(series, 1);
    if (!fetched.ok && fetched.retryable) {
      await new Promise((r) => setTimeout(r, 400));
      fetched = await fetchFredCsv(series, 2);
    }
    if (!fetched.ok || !fetched.points?.length) {
      const detail = String(fetched.detail || '');
      const timedOut =
        detail.toLowerCase().includes('abort') ||
        detail.toLowerCase().includes('time-out') ||
        detail.toLowerCase().includes('timeout');
      return res.status(502).json({
        error: 'FRED series returned no usable value',
        failureReason: timedOut ? 'delayed' : 'upstream_error',
        detail: fetched.detail,
      });
    }
    const points = fetched.points;
    const latest = points[0];
    const previous = points[1];
    const data = {
      series,
      date: latest.date,
      value: latest.value,
      previousDate: previous?.date ?? null,
      previousValue: previous?.value ?? null,
      change: previous ? latest.value - previous.value : null,
    };
    cacheSet(cacheKey, data);
    res.setHeader('x-brieftick-cache', 'MISS');
    return res.status(200).json(data);
  } catch (e) {
    return res.status(502).json({ error: 'upstream fetch failed', detail: e.message });
  }
}

async function proxySEC(req, res) {
  const { endpoint, ...params } = req.query;
  if (!endpoint) return res.status(400).json({ error: 'endpoint param required' });
  const cacheKey = `sec:${endpoint}:${new URLSearchParams(params).toString()}`;
  const ttl = 30 * 60_000; // 30 min
  const cached = cacheGet(cacheKey, ttl);
  if (cached) { res.setHeader('x-brieftick-cache', 'HIT'); return res.status(200).json(cached); }
  try {
    let url;
    const today = new Date().toISOString().slice(0, 10);
    const from = new Date(Date.now() - 21 * 86400000).toISOString().slice(0, 10);
    if (endpoint === 'form4') {
      url = `https://efts.sec.gov/LATEST/search-index?forms=4&dateRange=custom&fromDate=${params.from || from}&toDate=${params.to || today}`;
    } else if (endpoint === 'search') {
      url = `https://efts.sec.gov/LATEST/search-index?q=${encodeURIComponent(params.q || '')}&forms=${params.forms || '4'}&dateRange=custom&fromDate=${params.from || from}&toDate=${params.to || today}`;
    } else if (endpoint === 'submissions') {
      const cik = String(params.cik || '').replace(/\D/g, '').padStart(10, '0');
      url = `https://data.sec.gov/submissions/CIK${cik}.json`;
    } else {
      return res.status(400).json({ error: 'unknown SEC endpoint' });
    }
    const r = await fetch(url, {
      headers: { 'User-Agent': 'FORGENIQ/1.0 market-intelligence-app', 'Accept': 'application/json' }
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const data = await r.json();
    cacheSet(cacheKey, data);
    res.setHeader('x-brieftick-cache', 'MISS');
    return res.status(200).json(data);
  } catch (e) {
    return res.status(502).json({ error: 'SEC fetch failed', detail: e.message });
  }
}

async function proxyPolygon(req, res) {
  // Accept key from server env var (preferred) or from client header (browser settings)
  const key = process.env.POLYGON_KEY || req.headers['x-polygon-key'];
  if (!key) return res.status(500).json({ error: 'POLYGON_KEY not configured. Add it to Vercel environment variables or via the Settings panel.' });
  const { endpoint, ...params } = req.query;
  if (!endpoint) return res.status(400).json({ error: 'endpoint param required' });
  const cacheKey = `poly:${endpoint}:${new URLSearchParams(params).toString()}`;
  // Options snapshots: 1 min cache; reference data: 1 hour
  const ttl = endpoint.includes('snapshot') ? 60_000 : 60 * 60_000;
  const cached = cacheGet(cacheKey, ttl);
  if (cached) { res.setHeader('x-brieftick-cache', 'HIT'); return res.status(200).json(cached); }
  try {
    const qs = new URLSearchParams({ ...params, apiKey: key }).toString();
    const url = `https://api.polygon.io/${endpoint}?${qs}`;
    const r = await fetch(url, { headers: { 'User-Agent': 'FORGENIQ/1.0' } });
    let data = null;
    try {
      data = await r.json();
    } catch {
      data = null;
    }
    if (!r.ok) {
      console.warn('[proxy/polygon] upstream error', {
        endpoint,
        httpStatus: r.status,
        polygonStatus: data?.status,
        message: data?.error || data?.message,
      });
      const stale = staleGet(cacheKey);
      if (stale) {
        res.setHeader('x-brieftick-cache', 'STALE');
        return res.status(200).json(stale);
      }
      return res.status(502).json({
        error: 'Polygon fetch failed',
        failureReason: 'upstream_error',
        upstreamStatus: r.status,
        endpoint,
        detail: data?.error || data?.message || `HTTP ${r.status}`,
      });
    }
    if (data.status !== 'ERROR') {
      cacheSet(cacheKey, data);
      staleSet(cacheKey, data);
    }
    res.setHeader('x-brieftick-cache', 'MISS');
    return res.status(200).json(data);
  } catch (e) {
    console.warn('[proxy/polygon] fetch exception', { endpoint, detail: e.message });
    const stale = staleGet(cacheKey);
    if (stale) {
      res.setHeader('x-brieftick-cache', 'STALE');
      return res.status(200).json(stale);
    }
    return res.status(502).json({
      error: 'Polygon fetch failed',
      failureReason: 'network_error',
      endpoint,
      detail: e.message,
    });
  }
}

async function proxyStatus(req, res) {
  const { buildProviderStatusResponse } = await import('./provider-health.js');
  const { status, body } = await buildProviderStatusResponse(req);
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json(body);
}

async function proxyPoliticalTrades(req, res) {
  const cacheKey = 'pol:house';
  const cached = cacheGet(cacheKey, 60 * 60_000); // 1 hour
  if (cached) { res.setHeader('x-brieftick-cache', 'HIT'); return res.status(200).json(cached); }
  // Try multiple public sources for congressional stock disclosures
  const sources = [
    'https://house-stock-watcher-data.s3-us-east-2.amazonaws.com/data/all_transactions.json',
    'https://house-stock-watcher-data.s3.amazonaws.com/data/all_transactions.json',
  ];
  for (const url of sources) {
    try {
      const r = await fetch(url, {
        headers: { 'User-Agent': 'FORGENIQ/1.0 market-intelligence-app' },
        redirect: 'follow',
      });
      if (!r.ok) continue;
      const data = await r.json();
      if (!Array.isArray(data) || !data.length) continue;
      const slice = data
        .sort((a,b) => new Date(b.transaction_date||0) - new Date(a.transaction_date||0))
        .slice(0, 300);
      cacheSet(cacheKey, slice);
      res.setHeader('x-brieftick-cache', 'MISS');
      return res.status(200).json(slice);
    } catch(_) {}
  }
  // All sources failed — return empty so client falls back to demo data gracefully
  return res.status(200).json([]);
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const provider = req.query.provider;
  try {
    if (provider === 'twelvedata')      return await proxyTwelveData(req, res);
    if (provider === 'finnhub')         return await proxyFinnhub(req, res);
    if (provider === 'alphavantage')    return await proxyAlphaVantage(req, res);
    if (provider === 'anthropic')       return await proxyAnthropic(req, res);
    if (provider === 'fred')            return await proxyFred(req, res);
    if (provider === 'yahoo')           return await proxyYahoo(req, res);
    if (provider === 'sec')             return await proxySEC(req, res);
    if (provider === 'polygon')          return await proxyPolygon(req, res);
    if (provider === 'politicaltrades') return await proxyPoliticalTrades(req, res);
    if (provider === 'status')          return await proxyStatus(req, res);
    return res.status(400).json({ error: 'unknown provider' });
  } catch (e) {
    return res.status(500).json({ error: 'proxy crashed', detail: e.message });
  }
}
