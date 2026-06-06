/**

 * Live market snapshot — public delayed sources first, ETF APIs as fallback only.

 * @module lib/marketDataService

 */



import { mapSymbolForProvider } from "./landingTickerQuotes.js";



const FETCH_TIMEOUT_MS = 9000;

const MACRO_CACHE_MS = 10 * 60 * 1000;

const ETF_CACHE_MS = 45 * 1000;



/** @typedef {'loading'|'retrying'|'ok'|'proxy'|'unavailable'} SnapshotStatus */

/** @typedef {'rate_limited'|'delayed'|'symbol_unavailable'|'parse_error'|'upstream_error'|null} FailureReason */



/**

 * @typedef {Object} SnapshotInstrument

 * @property {string} label

 * @property {number|null} value

 * @property {number|null} change

 * @property {number|null} changePercent

 * @property {string|null} updatedAt

 * @property {SnapshotStatus} status

 * @property {string} [rowMessage]

 * @property {string} [error]

 * @property {string} [source]

 * @property {string} [fredDate]

 * @property {boolean} [isProxy]

 * @property {string} [proxySymbol]

 * @property {boolean} [stale]

 * @property {FailureReason} [failureReason]

 */



/**

 * @typedef {Object} ProviderAttempt

 * @property {string} provider

 * @property {string} symbol

 * @property {boolean} ok

 * @property {number} [status]

 * @property {FailureReason} [failureReason]

 * @property {string} [message]

 * @property {object} [responsePreview]

 * @property {number} [cachedMsAgo]

 */



export const ROW_ORDER = [

  "sp500",

  "nasdaq",

  "dow",

  "vix",

  "oil",

  "tenYearYield",

  "spy",

  "qqq",

];



const DEFAULT_LABELS = {

  sp500: "S&P 500",

  nasdaq: "Nasdaq",

  dow: "Dow",

  vix: "VIX",

  oil: "Oil (WTI)",

  tenYearYield: "10Y Yield",

  spy: "SPY",

  qqq: "QQQ",

};



const INDEX_YAHOO = {

  sp500: "^GSPC",

  nasdaq: "^IXIC",

  dow: "^DJI",

  vix: "^VIX",

};



const INDEX_FRED = {

  sp500: "SP500",

  nasdaq: "NASDAQCOM",

  dow: "DJIA",

};



const INDEX_PROXY = {

  sp500: { label: "S&P 500 proxy: SPY", symbol: "SPY" },

  nasdaq: { label: "Nasdaq proxy: QQQ", symbol: "QQQ" },

  dow: { label: "Dow proxy: DIA", symbol: "DIA" },

};



/** @type {Map<string, { t: number, value: unknown }>} */

const responseCache = new Map();



/** @type {ProviderAttempt[]} */

let debugAttempts = [];



/**

 * @param {string} cacheKey

 * @param {number} ttlMs

 * @param {() => Promise<unknown>} fetcher

 */

async function withCache(cacheKey, ttlMs, fetcher) {

  const hit = responseCache.get(cacheKey);

  if (hit && Date.now() - hit.t < ttlMs) {

    return { cached: true, cachedMsAgo: Date.now() - hit.t, value: hit.value };

  }

  const value = await fetcher();

  if (value?.ok) responseCache.set(cacheKey, { t: Date.now(), value });

  return { cached: false, cachedMsAgo: 0, value };

}



/**

 * @param {ProviderAttempt} attempt

 */

function logAttempt(attempt) {

  debugAttempts.push({ ...attempt, at: new Date().toISOString() });

  if (debugAttempts.length > 200) debugAttempts = debugAttempts.slice(-200);

}



/**

 * @param {number} status

 * @param {object|null} data

 * @param {string} provider

 * @returns {FailureReason}

 */

export function classifyProviderFailure(status, data, provider) {

  if (status === 429) return "rate_limited";

  if (data?.failureReason === "rate_limited" || data?.code === 429) return "rate_limited";

  if (provider === "fred") {
    const det = String(data?.detail || data?.error || "").toLowerCase();
    if (det.includes("abort") || det.includes("time-out") || det.includes("timeout")) {
      return "delayed";
    }
  }

  if (data?.failureReason === "parse_error") return "parse_error";

  if (provider === "twelvedata" && (data?.status === "error" || data?.code)) {

    if (data.code === 429) return "rate_limited";

    const msg = String(data.message || "").toLowerCase();

    if (msg.includes("symbol") || msg.includes("not found") || data.code === 404) {

      return "symbol_unavailable";

    }

    return "symbol_unavailable";

  }

  if (provider === "finnhub" && data && typeof data.c === "number" && data.c <= 0) {

    return "symbol_unavailable";

  }

  if (status >= 400) return "upstream_error";

  return "parse_error";

}



/**

 * @param {FailureReason} reason

 */

export function failureReasonLabel(reason) {

  if (reason === "rate_limited") return "Rate limited";

  if (reason === "symbol_unavailable") return "Symbol unavailable";

  if (reason === "parse_error") return "Parse error";

  if (reason === "upstream_error") return "Upstream error";

  return "Live source unavailable";

}



/**

 * @param {string} key

 * @param {Partial<SnapshotInstrument>} [overrides]

 */

export function loadingInstrument(key, overrides = {}) {

  return {

    label: DEFAULT_LABELS[key] || key,

    value: null,

    change: null,

    changePercent: null,

    updatedAt: null,

    status: "loading",

    rowMessage: "Loading live source…",

    ...overrides,

  };

}



export function retryingInstrument(key) {

  return {

    ...loadingInstrument(key, { status: "retrying", rowMessage: "Retrying live source…" }),

  };

}



export function unavailableInstrument(key, failureReason = null) {

  const label = DEFAULT_LABELS[key] || key;

  const isYield = key === "tenYearYield";

  const msg = failureReason
    ? failureReasonLabel(failureReason)
    : "Live source unavailable";
  const displayMsg =
    failureReason === "delayed" ? "Delayed / timeout" : msg;

  return {

    label,

    value: null,

    change: null,

    changePercent: null,

    updatedAt: null,

    status: "unavailable",

    rowMessage: failureReason === "delayed" ? "Delayed / timeout" : msg,

    error: isYield ? "Delayed / unavailable" : displayMsg,

    failureReason,

  };

}



/**

 * @param {string} url

 */

async function fetchJson(url) {

  const ctrl = new AbortController();

  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);

  try {

    const res = await fetch(url, { signal: ctrl.signal });

    let data = null;

    try {

      data = await res.json();

    } catch {

      data = null;

    }

    return { ok: res.ok, status: res.status, data };

  } catch (e) {

    return { ok: false, status: 0, data: null, message: e?.message || String(e) };

  } finally {

    clearTimeout(timer);

  }

}



/**

 * @param {string} sym

 * @param {{ cacheTtl?: number }} [opts]

 */

async function fetchFinnhubQuote(sym, opts = {}) {

  const fhSym = mapSymbolForProvider(sym, "finnhub");

  const cacheKey = `fh:quote:${fhSym}`;

  const ttl = opts.cacheTtl ?? ETF_CACHE_MS;



  const wrapped = await withCache(cacheKey, ttl, async () => {

    const { ok, data, status, message } = await fetchJson(

      `/api/proxy?provider=finnhub&endpoint=quote&symbol=${encodeURIComponent(fhSym)}`

    );

    if (!ok || !data || typeof data.c !== "number" || data.c <= 0) {

      const failureReason = classifyProviderFailure(status, data, "finnhub");

      return {

        ok: false,

        provider: "finnhub",

        symbol: fhSym,

        status,

        message: message || failureReasonLabel(failureReason),

        failureReason,

      };

    }

    return {

      ok: true,

      provider: "finnhub",

      symbol: fhSym,

      quote: {

        price: data.c,

        change: typeof data.d === "number" ? data.d : null,

        changePercent: typeof data.dp === "number" ? data.dp : null,

        updatedAt: data.t ? new Date(data.t * 1000).toISOString() : new Date().toISOString(),

        source: "finnhub",

      },

    };

  });



  const result = wrapped.value;

  logAttempt({

    provider: "finnhub",

    symbol: fhSym,

    ok: Boolean(result?.ok),

    status: result?.status,

    failureReason: result?.failureReason || null,

    message: result?.message,

    cachedMsAgo: wrapped.cached ? wrapped.cachedMsAgo : undefined,

    responsePreview: result?.ok ? { price: result.quote?.price } : result,

  });

  return result;

}



/**

 * @param {string} symbol

 * @param {{ cacheTtl?: number }} [opts]

 */

async function fetchTwelveDataQuote(symbol, opts = {}) {

  const cacheKey = `td:quote:${symbol}`;

  const ttl = opts.cacheTtl ?? ETF_CACHE_MS;



  const wrapped = await withCache(cacheKey, ttl, async () => {

    const { ok, data, status, message } = await fetchJson(

      `/api/proxy?provider=twelvedata&endpoint=quote&symbol=${encodeURIComponent(symbol)}`

    );

    if (!ok || !data || data.status === "error" || data.code) {

      const failureReason = classifyProviderFailure(status, data, "twelvedata");

      return {

        ok: false,

        provider: "twelvedata",

        symbol,

        status,

        message: data?.message || message || failureReasonLabel(failureReason),

        failureReason,

        code: data?.code,

      };

    }

    const price = parseFloat(data.close);

    const changePercent = parseFloat(data.percent_change);

    const change = parseFloat(data.change);

    if (!Number.isFinite(price) || price <= 0) {

      return {

        ok: false,

        provider: "twelvedata",

        symbol,

        failureReason: "parse_error",

        message: "Parse error",

      };

    }

    return {

      ok: true,

      provider: "twelvedata",

      symbol,

      quote: {

        price,

        change: Number.isFinite(change) ? change : null,

        changePercent: Number.isFinite(changePercent) ? changePercent : null,

        updatedAt: new Date().toISOString(),

        source: "twelvedata",

      },

    };

  });



  const result = wrapped.value;

  logAttempt({

    provider: "twelvedata",

    symbol,

    ok: Boolean(result?.ok),

    status: result?.status,

    failureReason: result?.failureReason || null,

    message: result?.message,

    cachedMsAgo: wrapped.cached ? wrapped.cachedMsAgo : undefined,

    responsePreview: result?.ok ? { price: result.quote?.price } : result,

  });

  return result;

}



/**

 * @param {string} series

 */

async function fetchFredSeries(series) {

  const cacheKey = `fred:${series}`;

  const wrapped = await withCache(cacheKey, MACRO_CACHE_MS, async () => {

    const { ok, data, status, message } = await fetchJson(

      `/api/proxy?provider=fred&series=${encodeURIComponent(series)}`

    );

    if (!ok || !data || data.value == null) {

      const failureReason = classifyProviderFailure(status, data, "fred");

      return { ok: false, provider: "fred", symbol: series, status, message, failureReason };

    }

    const value = parseFloat(data.value);

    if (!Number.isFinite(value)) {

      return {

        ok: false,

        provider: "fred",

        symbol: series,

        failureReason: "parse_error",

        message: "Parse error",

      };

    }

    const prev = data.previousValue != null ? parseFloat(data.previousValue) : null;

    const change =

      data.change != null ? parseFloat(data.change) : prev != null ? value - prev : null;

    let changePercent = null;

    if (change != null && prev != null && prev !== 0) changePercent = (change / prev) * 100;

    return {

      ok: true,

      provider: "fred",

      symbol: series,

      quote: {

        price: value,

        change: Number.isFinite(change) ? change : null,

        changePercent,

        updatedAt: data.date ? `${data.date}T00:00:00Z` : new Date().toISOString(),

        source: "fred",

        fredDate: data.date,

      },

    };

  });



  const result = wrapped.value;

  logAttempt({

    provider: "fred",

    symbol: series,

    ok: Boolean(result?.ok),

    status: result?.status,

    failureReason: result?.failureReason || null,

    message: result?.message,

    cachedMsAgo: wrapped.cached ? wrapped.cachedMsAgo : undefined,

    responsePreview: result?.ok ? { price: result.quote?.price, date: result.quote?.fredDate } : result,

  });

  return result;

}



/**

 * @param {string} symbol

 */

async function fetchYahooChart(symbol) {

  const cacheKey = `yahoo:${symbol}`;

  const wrapped = await withCache(cacheKey, MACRO_CACHE_MS, async () => {

    const { ok, data, status, message } = await fetchJson(

      `/api/proxy?provider=yahoo&symbol=${encodeURIComponent(symbol)}`

    );

    if (!ok || !data?.ok || !Number.isFinite(data.price)) {

      const failureReason =

        data?.failureReason || classifyProviderFailure(status, data, "yahoo");

      return {

        ok: false,

        provider: "yahoo",

        symbol,

        status,

        message: data?.message || message || failureReasonLabel(failureReason),

        failureReason,

      };

    }

    return {

      ok: true,

      provider: "yahoo",

      symbol,

      quote: {

        price: data.price,

        change: data.change ?? null,

        changePercent: data.changePercent ?? null,

        updatedAt: data.updatedAt || new Date().toISOString(),

        source: "yahoo",

      },

    };

  });



  const result = wrapped.value;

  logAttempt({

    provider: "yahoo",

    symbol,

    ok: Boolean(result?.ok),

    status: result?.status,

    failureReason: result?.failureReason || null,

    message: result?.message,

    cachedMsAgo: wrapped.cached ? wrapped.cachedMsAgo : undefined,

    responsePreview: result?.ok ? { price: result.quote?.price } : result,

  });

  return result;

}



/**

 * ETF quotes — Finnhub then Twelve Data, single-symbol only.

 * @param {string} symbol

 */

async function fetchEtfQuote(symbol) {

  const fh = await fetchFinnhubQuote(symbol, { cacheTtl: ETF_CACHE_MS });

  if (fh?.ok && fh.quote) return fh;

  return fetchTwelveDataQuote(symbol, { cacheTtl: ETF_CACHE_MS });

}



/**

 * @param {string} label

 * @param {{ price: number, change?: number|null, changePercent?: number|null, updatedAt?: string, source?: string, fredDate?: string }} raw

 * @param {{ kind?: string, isProxy?: boolean, proxySymbol?: string }} [opts]

 */

function buildOkInstrument(label, raw, opts = {}) {

  const kind = opts.kind || "etf";

  let changePercent = raw.changePercent;

  let change = raw.change;



  if (kind === "yield" && change != null) {

    changePercent = null;

  } else if (changePercent == null && change != null && raw.price) {

    const prev = raw.price - change;

    if (prev) changePercent = (change / prev) * 100;

  }



  const status = opts.isProxy ? "proxy" : "ok";

  return {

    label,

    value: raw.price,

    change: change ?? null,

    changePercent: changePercent ?? null,

    updatedAt: raw.updatedAt || new Date().toISOString(),

    status,

    source: raw.source,

    isProxy: Boolean(opts.isProxy),

    proxySymbol: opts.proxySymbol || null,

    rowMessage: opts.isProxy ? `Proxy: ${opts.proxySymbol}` : "",

    ...(raw.fredDate ? { fredDate: raw.fredDate } : {}),

  };

}



/**

 * @param {string} rowKey

 * @param {string} yahooSymbol

 * @param {string} fredSeries

 * @param {{ label: string, symbol: string }} proxy

 */

async function fetchIndexRow(rowKey, yahooSymbol, fredSeries, proxy) {

  const yahoo = await fetchYahooChart(yahooSymbol);

  if (yahoo?.ok && yahoo.quote) {

    return buildOkInstrument(DEFAULT_LABELS[rowKey], yahoo.quote, { kind: "index" });

  }



  const fred = await fetchFredSeries(fredSeries);

  if (fred?.ok && fred.quote) {

    console.info("[marketData] index using FRED fallback", { row: rowKey, series: fredSeries });

    return buildOkInstrument(DEFAULT_LABELS[rowKey], fred.quote, { kind: "index" });

  }



  const etf = await fetchEtfQuote(proxy.symbol);

  if (etf?.ok && etf.quote) {

    console.info("[marketData] index using ETF proxy", { row: rowKey, proxy: proxy.symbol });

    return buildOkInstrument(proxy.label, etf.quote, {

      kind: "etf",

      isProxy: true,

      proxySymbol: proxy.symbol,

    });

  }



  const lastReason =

    etf?.failureReason || fred?.failureReason || yahoo?.failureReason || null;

  console.warn("[marketData] index row exhausted", { row: rowKey, lastReason });

  return unavailableInstrument(rowKey, lastReason);

}



async function fetchSp500Row() {

  return fetchIndexRow("sp500", INDEX_YAHOO.sp500, INDEX_FRED.sp500, INDEX_PROXY.sp500);

}



async function fetchNasdaqRow() {

  return fetchIndexRow("nasdaq", INDEX_YAHOO.nasdaq, INDEX_FRED.nasdaq, INDEX_PROXY.nasdaq);

}



async function fetchDowRow() {

  return fetchIndexRow("dow", INDEX_YAHOO.dow, INDEX_FRED.dow, INDEX_PROXY.dow);

}



async function fetchSpyRow() {

  const r = await fetchEtfQuote("SPY");

  return r?.quote

    ? buildOkInstrument("SPY", r.quote, { kind: "etf" })

    : unavailableInstrument("spy", r?.failureReason);

}



async function fetchQqqRow() {

  const r = await fetchEtfQuote("QQQ");

  return r?.quote

    ? buildOkInstrument("QQQ", r.quote, { kind: "etf" })

    : unavailableInstrument("qqq", r?.failureReason);

}



async function fetchVixRow() {

  const fred = await fetchFredSeries("VIXCLS");

  if (fred?.ok && fred.quote) {

    return buildOkInstrument("VIX", fred.quote, { kind: "vix" });

  }



  const yahoo = await fetchYahooChart("^VIX");

  if (yahoo?.ok && yahoo.quote) {

    console.info("[marketData] VIX using Yahoo ^VIX fallback");

    return buildOkInstrument("VIX", yahoo.quote, { kind: "vix" });

  }



  console.warn("[marketData] VIX unavailable", { fred, yahoo });

  return unavailableInstrument("vix", yahoo?.failureReason || fred?.failureReason);

}



async function fetchOilRow() {

  const fred = await fetchFredSeries("DCOILWTICO");

  if (fred?.ok && fred.quote) {

    return buildOkInstrument("Oil (WTI)", fred.quote, { kind: "oil" });

  }



  const uso = await fetchEtfQuote("USO");

  if (uso?.ok && uso.quote) {

    console.info("[marketData] oil using proxy USO");

    return buildOkInstrument("Oil proxy: USO", uso.quote, {

      kind: "oil",

      isProxy: true,

      proxySymbol: "USO",

    });

  }



  return unavailableInstrument("oil", uso?.failureReason || fred?.failureReason);

}



async function fetchTenYearRow() {

  const fred = await fetchFredSeries("DGS10");

  if (fred?.ok && fred.quote) {

    return buildOkInstrument("10Y Yield", fred.quote, { kind: "yield" });

  }

  console.warn("[marketData] 10Y FRED DGS10 unavailable", fred);

  return unavailableInstrument("tenYearYield", fred?.failureReason);

}



const ROW_FETCHERS = {

  sp500: fetchSp500Row,

  nasdaq: fetchNasdaqRow,

  dow: fetchDowRow,

  vix: fetchVixRow,

  oil: fetchOilRow,

  tenYearYield: fetchTenYearRow,

  spy: fetchSpyRow,

  qqq: fetchQqqRow,

};



/**

 * @param {string} key

 * @returns {Promise<SnapshotInstrument>}

 */

export async function fetchSnapshotRow(key) {

  const fn = ROW_FETCHERS[key];

  if (!fn) return unavailableInstrument(key);

  try {

    return await fn();

  } catch (e) {

    console.error("[marketData] fetchSnapshotRow error", { key, error: e });

    return unavailableInstrument(key);

  }

}



/** @returns {Record<string, SnapshotInstrument>} */

export function getLoadingMarketSnapshot() {

  /** @type {Record<string, SnapshotInstrument>} */

  const out = {};

  for (const key of ROW_ORDER) {

    out[key] = loadingInstrument(key);

  }

  return out;

}



/**

 * @returns {Promise<{ finnhub: boolean, twelvedata: boolean, fred: boolean, yahoo: boolean }>}

 */

export async function checkMarketDataApiStatus() {

  const { ok, data } = await fetchJson("/api/proxy?provider=status");

  if (!ok || !data) {

    console.warn("[marketData] API status check failed");

    return { finnhub: false, twelvedata: false, fred: true, yahoo: true };

  }

  return {

    finnhub: Boolean(data.finnhub),

    twelvedata: Boolean(data.twelvedata),

    fred: true,

    yahoo: true,

  };

}



/** Clear debug log before a full probe run. */

export function clearMarketDataDebugLog() {

  debugAttempts = [];

}



/** @returns {ProviderAttempt[]} */

export function getMarketDataDebugLog() {

  return [...debugAttempts];

}



/**

 * Probe every row and return snapshot + provider attempts.

 */

export async function fetchMarketDataDebugSnapshot() {

  clearMarketDataDebugLog();

  const rows = {};

  for (const key of ROW_ORDER) {

    rows[key] = await fetchSnapshotRow(key);

  }

  return {

    fetchedAt: new Date().toISOString(),

    rows,

    attempts: getMarketDataDebugLog(),

    cacheKeys: [...responseCache.keys()],

  };

}



/** @deprecated Use per-row fetch in market-snapshot.js */

export async function fetchMarketSnapshot() {

  const rows = await Promise.all(ROW_ORDER.map((k) => fetchSnapshotRow(k)));

  /** @type {Record<string, SnapshotInstrument>} */

  const out = {};

  ROW_ORDER.forEach((k, i) => {

    out[k] = rows[i];

  });

  return { ...out, fetchedAt: new Date().toISOString() };

}



export function mergeMarketSnapshot() {

  return arguments[1];

}



export function formatPrice(n, decimals = 2) {

  if (n == null || !Number.isFinite(n)) return "—";

  return n.toLocaleString("en-US", {

    minimumFractionDigits: decimals,

    maximumFractionDigits: decimals,

  });

}



export function formatChangeDisplay(inst, opts = {}) {

  if (inst.status === "unavailable") return "—";

  if (inst.status === "loading" || inst.status === "retrying") return "…";

  const kind = opts.kind || "etf";

  if (inst.status !== "ok" && inst.status !== "proxy") return "—";



  if (kind === "yield" && inst.change != null) {

    const bp = Math.round(inst.change * 100);

    const sign = bp >= 0 ? "+" : "−";

    return `${sign}${Math.abs(bp)} bp`;

  }

  if (inst.changePercent != null && Number.isFinite(inst.changePercent)) {

    const sign = inst.changePercent >= 0 ? "+" : "−";

    const pct = `${sign}${Math.abs(inst.changePercent).toFixed(2)}%`;

    if (inst.change != null && Number.isFinite(inst.change) && kind !== "yield") {

      const cs = inst.change >= 0 ? "+" : "−";

      return `${pct} (${cs}${formatPrice(Math.abs(inst.change))})`;

    }

    return pct;

  }

  if (inst.change != null && Number.isFinite(inst.change)) {

    const sign = inst.change >= 0 ? "+" : "−";

    return `${sign}${formatPrice(Math.abs(inst.change))}`;

  }

  return "—";

}



export function changeTone(inst) {

  if (inst.status !== "ok" && inst.status !== "proxy") return "flat";

  const n = inst.changePercent ?? inst.change;

  if (n == null || !Number.isFinite(n) || Math.abs(n) < 0.0001) return "flat";

  return n > 0 ? "up" : "dn";

}



export function formatLevelDisplay(inst, opts = {}) {

  if (inst.status === "loading" || inst.status === "retrying") return "…";

  if (inst.status === "unavailable") {

    return inst.key === "tenYearYield" || opts.kind === "yield"

      ? "Delayed / unavailable"

      : "—";

  }

  const kind = opts.kind || "etf";

  if (inst.value == null) return "—";

  if (kind === "yield") return `${inst.value.toFixed(2)}%`;

  if (kind === "oil") return `$${formatPrice(inst.value)}`;

  return formatPrice(inst.value, 2);

}



export const ROW_META = {

  sp500: { kind: "index" },

  nasdaq: { kind: "index" },

  dow: { kind: "index" },

  vix: { kind: "vix" },

  oil: { kind: "oil" },

  tenYearYield: { kind: "yield" },

  spy: { kind: "etf" },

  qqq: { kind: "etf" },

};


