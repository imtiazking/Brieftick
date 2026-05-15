/**
 * BriefTick API Proxy
 *
 * Routes browser requests to the right provider, attaches the secret API key
 * server-side, and caches responses so visitors share API calls.
 *
 * Cache TTLs:
 *   - Quotes & time series (Twelve Data) ........... 30s
 *   - News headlines (Finnhub) ..................... 60s
 *   - Company news (Finnhub) ....................... 5min
 *   - Earnings calendar (Finnhub) .................. 30min
 *   - Sector performance, news sentiment (AV) ...... 5min
 *   - Technical indicators (AV) .................... 5min
 *   - Public FRED series (VIXCLS) .................. 15min
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

// CORS: allow any origin to hit /api/* so the same code works locally + on Vercel.
function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key, anthropic-version');
}

async function proxyTwelveData(req, res) {
  const { endpoint, ...params } = req.query;
  const key = process.env.TWELVE_DATA_KEY;
  if (!key) return res.status(500).json({ error: 'TWELVE_DATA_KEY not set on server' });
  if (!endpoint) return res.status(400).json({ error: 'endpoint param required (quote, time_series)' });

  const qs = new URLSearchParams({ ...params, apikey: key }).toString();
  const url = `https://api.twelvedata.com/${endpoint}?${qs}`;
  const cacheKey = `td:${endpoint}:${new URLSearchParams(params).toString()}`;

  // 30s cache for quotes & time series
  const cached = cacheGet(cacheKey, 30_000);
  if (cached) {
    res.setHeader('x-brieftick-cache', 'HIT');
    return res.status(200).json(cached);
  }

  try {
    const r = await fetch(url);
    const data = await r.json();
    // Don't cache rate-limit errors
    if (!(data && data.code === 429)) cacheSet(cacheKey, data);
    res.setHeader('x-brieftick-cache', 'MISS');
    return res.status(200).json(data);
  } catch (e) {
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

  const cached = cacheGet(cacheKey, ttl);
  if (cached) {
    res.setHeader('x-brieftick-cache', 'HIT');
    return res.status(200).json(cached);
  }

  try {
    const r = await fetch(url);
    const data = await r.json();
    cacheSet(cacheKey, data);
    res.setHeader('x-brieftick-cache', 'MISS');
    return res.status(200).json(data);
  } catch (e) {
    return res.status(502).json({ error: 'upstream fetch failed', detail: e.message });
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
  const key = process.env.ANTHROPIC_KEY;
  if (!key) return res.status(500).json({ error: 'ANTHROPIC_KEY not set on server' });

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(req.body),
    });
    const data = await r.json();
    return res.status(r.status).json(data);
  } catch (e) {
    return res.status(502).json({ error: 'upstream fetch failed', detail: e.message });
  }
}

async function proxyFred(req, res) {
  const series = req.query.series || 'VIXCLS';
  if (series !== 'VIXCLS') return res.status(400).json({ error: 'unsupported FRED series' });
  const cacheKey = `fred:${series}`;

  const cached = cacheGet(cacheKey, 15 * 60_000);
  if (cached) {
    res.setHeader('x-brieftick-cache', 'HIT');
    return res.status(200).json(cached);
  }

  try {
    const r = await fetch(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${encodeURIComponent(series)}`);
    const text = await r.text();
    const lines = text.trim().split('\n');
    for (let i = lines.length - 1; i > 0; i--) {
      const [date, val] = lines[i].split(',');
      if (val && val !== '.' && !Number.isNaN(parseFloat(val))) {
        const data = { series, date, value: parseFloat(val) };
        cacheSet(cacheKey, data);
        res.setHeader('x-brieftick-cache', 'MISS');
        return res.status(200).json(data);
      }
    }
    return res.status(502).json({ error: 'FRED series returned no usable value' });
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
      headers: { 'User-Agent': 'BriefTick/1.0 market-intelligence-app', 'Accept': 'application/json' }
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
    const r = await fetch(url, { headers: { 'User-Agent': 'BriefTick/1.0' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const data = await r.json();
    if (data.status !== 'ERROR') cacheSet(cacheKey, data);
    res.setHeader('x-brieftick-cache', 'MISS');
    return res.status(200).json(data);
  } catch (e) {
    return res.status(502).json({ error: 'Polygon fetch failed', detail: e.message });
  }
}

async function proxyPoliticalTrades(req, res) {
  const cacheKey = 'pol:house';
  const cached = cacheGet(cacheKey, 60 * 60_000); // 1 hour
  if (cached) { res.setHeader('x-brieftick-cache', 'HIT'); return res.status(200).json(cached); }
  try {
    const r = await fetch(
      'https://house-stock-watcher-data.s3-us-east-2.amazonaws.com/data/fillings.json',
      { headers: { 'User-Agent': 'BriefTick/1.0 market-intelligence-app' } }
    );
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const data = await r.json();
    // Return only the most recent 300 to keep response small
    const slice = Array.isArray(data)
      ? data.sort((a,b) => new Date(b.transaction_date||0) - new Date(a.transaction_date||0)).slice(0,300)
      : data;
    cacheSet(cacheKey, slice);
    res.setHeader('x-brieftick-cache', 'MISS');
    return res.status(200).json(slice);
  } catch (e) {
    return res.status(502).json({ error: 'political trades fetch failed', detail: e.message });
  }
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
    if (provider === 'sec')             return await proxySEC(req, res);
    if (provider === 'polygon')          return await proxyPolygon(req, res);
    if (provider === 'politicaltrades') return await proxyPoliticalTrades(req, res);
    return res.status(400).json({ error: 'unknown provider' });
  } catch (e) {
    return res.status(500).json({ error: 'proxy crashed', detail: e.message });
  }
}
