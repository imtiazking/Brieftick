/**
 * Unified quote router — Finnhub → Yahoo → Alpha Vantage → cache → Twelve Data (last resort).
 * In-flight deduplication, 5 min TTL, stale-while-revalidate, circuit breaker on TD 429.
 * @module lib/quoteRouter
 */

const QUOTE_TTL_MS = 5 * 60_000;
const SERIES_TTL_MS = 5 * 60_000;
const STALE_MAX_MS = 24 * 60 * 60_000;
const TD_CIRCUIT_MS = 30 * 60_000;
const BATCH_CONCURRENCY = 6;

/** @type {Map<string, { t: number, v: object }>} */
const cache = new Map();

/** @type {Map<string, Promise<unknown>>} */
const inflight = new Map();

/** @type {Map<string, number>} */
const logThrottle = new Map();

let twelveDataOpenUntil = 0;
let twelveDataQuotaExhausted = false;

function msUntilUtcMidnight() {
  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return Math.max(60_000, next.getTime() - now.getTime());
}

function tripTwelveDataCircuit(data) {
  const msg = String(data?.message || '');
  if (/daily|API credits|credits were used/i.test(msg)) {
    twelveDataQuotaExhausted = true;
    twelveDataOpenUntil = Date.now() + msUntilUtcMidnight();
    logOnce("td-circuit-daily", "Twelve Data daily quota exhausted — disabled until UTC midnight");
  } else {
    twelveDataOpenUntil = Date.now() + TD_CIRCUIT_MS;
    logOnce("td-circuit", `Twelve Data circuit open ${TD_CIRCUIT_MS / 60_000}min after 429`);
  }
}

/**
 * @param {string} key
 * @param {string} msg
 */
function logOnce(key, msg) {
  const now = Date.now();
  if (now - (logThrottle.get(key) || 0) < 60_000) return;
  logThrottle.set(key, now);
  console.warn("[quoteRouter]", msg);
}

/**
 * @param {string} sym
 */
export function normalizeSymbol(sym) {
  return String(sym || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9^.\-]/g, "");
}

/**
 * @param {string} key
 */
function cacheGetFresh(key) {
  const e = cache.get(key);
  if (!e) return null;
  if (Date.now() - e.t > QUOTE_TTL_MS) return null;
  return e.v;
}

/**
 * @param {string} key
 * @param {number} [ttlMs]
 */
function cacheGetFreshTtl(key, ttlMs = QUOTE_TTL_MS) {
  const e = cache.get(key);
  if (!e) return null;
  if (Date.now() - e.t > ttlMs) return null;
  return e.v;
}

/**
 * @param {string} key
 */
function cacheGetStale(key) {
  const e = cache.get(key);
  if (!e) return null;
  if (Date.now() - e.t > STALE_MAX_MS) return null;
  return e.v;
}

/**
 * @param {string} key
 * @param {object} value
 */
function cacheSet(key, value) {
  cache.set(key, { t: Date.now(), v: value });
}

/**
 * @param {string} key
 * @param {() => Promise<T>} fn
 * @template T
 * @returns {Promise<T>}
 */
function dedupe(key, fn) {
  const existing = inflight.get(key);
  if (existing) return /** @type {Promise<T>} */ (existing);
  const p = fn().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

/**
 * @param {string} url
 */
async function fetchJson(url) {
  try {
    const res = await fetch(url);
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    return { ok: res.ok, status: res.status, data };
  } catch (e) {
    return { ok: false, status: 0, data: null, error: /** @type {Error} */ (e).message };
  }
}

/**
 * @param {string} symbol
 * @param {object | null} raw
 * @param {string} provider
 */
function normalizeQuote(symbol, raw, provider) {
  if (!raw) return null;
  const price = raw.price;
  if (!Number.isFinite(price) || price <= 0) return null;
  return {
    symbol,
    name: raw.name || symbol,
    price,
    change: Number.isFinite(raw.change) ? raw.change : 0,
    pctChange: Number.isFinite(raw.pctChange) ? raw.pctChange : 0,
    open: raw.open,
    high: raw.high,
    low: raw.low,
    previousClose: raw.previousClose,
    volume: raw.volume || 0,
    currency: "USD",
    quotedAt: new Date().toISOString(),
    _provider: provider,
    _stale: Boolean(raw._stale),
  };
}

/**
 * @param {string} symbol
 */
async function fetchFinnhubQuote(symbol) {
  const r = await fetchJson(
    `/api/proxy?provider=finnhub&endpoint=quote&symbol=${encodeURIComponent(symbol)}`
  );
  if (!r.ok || !r.data?.c || r.data.c <= 0) return null;
  return {
    price: r.data.c,
    change: r.data.d || 0,
    pctChange: r.data.dp || 0,
    open: r.data.o,
    high: r.data.h,
    low: r.data.l,
    previousClose: r.data.pc,
    name: symbol,
  };
}

/**
 * @param {string} symbol
 */
async function fetchYahooQuote(symbol) {
  const r = await fetchJson(
    `/api/proxy?provider=yahoo&symbol=${encodeURIComponent(symbol)}`
  );
  if (!r.ok || !r.data?.ok || !Number.isFinite(r.data.price)) return null;
  return {
    price: r.data.price,
    change: r.data.change ?? 0,
    pctChange: r.data.changePercent ?? 0,
    previousClose: r.data.previousClose,
    name: r.data.longName || symbol,
  };
}

/**
 * @param {string} symbol
 */
async function fetchAlphaVantageQuote(symbol) {
  const r = await fetchJson(
    `/api/proxy?provider=alphavantage&function=GLOBAL_QUOTE&symbol=${encodeURIComponent(symbol)}`
  );
  const g = r.data?.["Global Quote"];
  if (!g?.["05. price"]) return null;
  const price = parseFloat(g["05. price"]);
  const pctRaw = g["10. change percent"];
  const pctChange =
    typeof pctRaw === "string" ? parseFloat(pctRaw.replace("%", "")) : parseFloat(pctRaw);
  if (!Number.isFinite(price) || price <= 0) return null;
  return {
    price,
    change: parseFloat(g["09. change"]) || 0,
    pctChange: Number.isFinite(pctChange) ? pctChange : 0,
    name: symbol,
  };
}

/**
 * @param {string} symbol
 */
async function fetchTwelveDataQuote(symbol) {
  if (twelveDataQuotaExhausted || Date.now() < twelveDataOpenUntil) return null;
  const r = await fetchJson(
    `/api/proxy?provider=twelvedata&endpoint=quote&symbol=${encodeURIComponent(symbol)}`
  );
  if (r.data?.circuitOpen || (r.status === 429 && /circuit|quota exhausted/i.test(String(r.data?.message)))) {
    tripTwelveDataCircuit(r.data);
    return null;
  }
  if (r.status === 429 || r.data?.code === 429) {
    tripTwelveDataCircuit(r.data);
    return null;
  }
  if (!r.ok || r.data?.code || r.data?.status === "error") return null;
  const price = parseFloat(r.data.close);
  if (!Number.isFinite(price) || price <= 0) return null;
  return {
    price,
    change: parseFloat(r.data.change) || 0,
    pctChange: parseFloat(r.data.percent_change) || 0,
    name: r.data.name || symbol,
  };
}

/**
 * @param {string} symbol
 */
async function resolveQuote(symbol) {
  const sym = normalizeSymbol(symbol);
  if (!sym) return null;
  const ck = `q:${sym}`;

  const fresh = cacheGetFresh(ck);
  if (fresh) return fresh;

  return dedupe(ck, async () => {
    const chain = [
      ["finnhub", fetchFinnhubQuote],
      ["yahoo", fetchYahooQuote],
      ["alphavantage", fetchAlphaVantageQuote],
    ];

    for (const [provider, fn] of chain) {
      try {
        const raw = await fn(sym);
        const q = normalizeQuote(sym, raw, provider);
        if (q) {
          cacheSet(ck, q);
          return q;
        }
      } catch (e) {
        logOnce(`err-${provider}`, `${provider} ${sym}: ${/** @type {Error} */ (e).message}`);
      }
    }

    const stale = cacheGetStale(ck);
    if (stale) return { ...stale, _stale: true };

    try {
      const raw = await fetchTwelveDataQuote(sym);
      const q = normalizeQuote(sym, raw, "twelvedata");
      if (q) {
        cacheSet(ck, q);
        return q;
      }
    } catch (e) {
      logOnce("err-twelvedata", `twelvedata ${sym}: ${/** @type {Error} */ (e).message}`);
    }

    const staleFinal = cacheGetStale(ck);
    return staleFinal ? { ...staleFinal, _stale: true } : null;
  });
}

/**
 * @param {string} symbol
 */
export async function getQuote(symbol) {
  return resolveQuote(symbol);
}

/**
 * @param {string[]} symbols
 */
export async function getQuotes(symbols) {
  const list = [...new Set(symbols.map(normalizeSymbol).filter(Boolean))];
  /** @type {Record<string, object>} */
  const out = {};
  const missing = [];

  for (const sym of list) {
    const ck = `q:${sym}`;
    const fresh = cacheGetFresh(ck);
    if (fresh) {
      out[sym] = fresh;
    } else {
      missing.push(sym);
    }
  }

  if (!missing.length) return out;

  for (let i = 0; i < missing.length; i += BATCH_CONCURRENCY) {
    const chunk = missing.slice(i, i + BATCH_CONCURRENCY);
    const results = await Promise.all(chunk.map((sym) => resolveQuote(sym)));
    chunk.forEach((sym, idx) => {
      if (results[idx]) out[sym] = results[idx];
    });
  }

  return out;
}

/**
 * @param {string} symbol
 * @param {number} [days]
 */
async function fetchYahooDailyCloses(symbol, days = 30) {
  const range = days <= 10 ? "1mo" : "3mo";
  const r = await fetchJson(
    `/api/proxy?provider=yahoo&symbol=${encodeURIComponent(symbol)}&range=${range}&closes=1`
  );
  const closes = r.data?.closes;
  if (!Array.isArray(closes) || closes.length < 2) return null;
  return closes.slice(-Math.max(days + 1, 10));
}

/**
 * @param {string} symbol
 * @param {number} [days]
 */
async function fetchTwelveDataCloses(symbol, days = 30) {
  if (twelveDataQuotaExhausted || Date.now() < twelveDataOpenUntil) return null;
  const r = await fetchJson(
    `/api/proxy?provider=twelvedata&endpoint=time_series&symbol=${encodeURIComponent(symbol)}&interval=1day&outputsize=${days}`
  );
  if (r.data?.circuitOpen || (r.status === 429 && /circuit|quota exhausted/i.test(String(r.data?.message)))) {
    tripTwelveDataCircuit(r.data);
    return null;
  }
  if (r.status === 429 || r.data?.code === 429) {
    tripTwelveDataCircuit(r.data);
    return null;
  }
  if (!r.data?.values?.length) return null;
  return r.data.values.map((v) => parseFloat(v.close)).reverse();
}

/**
 * Daily close prices for correlation / portfolio cluster.
 * @param {string} symbol
 * @param {string} [_interval]
 * @param {number} [outputsize]
 */
export async function getDailyCloses(symbol, _interval = "1day", outputsize = 30) {
  const sym = normalizeSymbol(symbol);
  if (!sym) return null;
  const ck = `ts:${sym}:${outputsize}`;
  const fresh = cacheGetFreshTtl(ck, SERIES_TTL_MS);
  if (fresh) return fresh;

  return dedupe(ck, async () => {
    try {
      const yahoo = await fetchYahooDailyCloses(sym, outputsize);
      if (yahoo && yahoo.length >= 8) {
        cacheSet(ck, yahoo);
        return yahoo;
      }
    } catch (e) {
      logOnce("err-yahoo-ts", `yahoo series ${sym}: ${/** @type {Error} */ (e).message}`);
    }

    const stale = cacheGetStale(ck);
    if (stale) return stale;

    try {
      const td = await fetchTwelveDataCloses(sym, outputsize);
      if (td && td.length >= 8) {
        cacheSet(ck, td);
        return td;
      }
    } catch (e) {
      logOnce("err-td-ts", `twelvedata series ${sym}: ${/** @type {Error} */ (e).message}`);
    }

    return cacheGetStale(ck);
  });
}

/** @deprecated use getDailyCloses */
export async function getTimeSeries(symbol, interval = "1day", outputsize = 30) {
  if (interval !== "1day") return null;
  return getDailyCloses(symbol, interval, outputsize);
}

/**
 * @returns {{ twelveDataCircuitOpen: boolean, cacheSize: number }}
 */
export function getRouterStats() {
  return {
    twelveDataCircuitOpen: twelveDataQuotaExhausted || Date.now() < twelveDataOpenUntil,
    twelveDataQuotaExhausted,
    cacheSize: cache.size,
  };
}
