/**
 * Portfolio live quotes — Yahoo → Finnhub → Twelve Data (per symbol).
 * @module lib/portfolio-quotes
 */

export const PORTFOLIO_SAMPLE_SYMBOLS = [
  "NVDA",
  "AAPL",
  "GOOGL",
  "META",
  "MSFT",
  "SPY",
  "AMD",
  "AMZN",
  "XLV",
  "AVGO",
  "XOM",
  "JPM",
  "BAC",
  "TSLA",
];

const RETRY_DELAYS_MS = [3000, 8000, 15000];
const QUOTE_CACHE_MS = 45_000;

/** @type {Map<string, { quote: object, t: number }>} */
const quoteCache = new Map();

/** @type {Array<object>} */
let debugAttempts = [];

/**
 * @param {string} sym
 */
export function normalizePortfolioSymbol(sym) {
  return String(sym || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9.\-]/g, "");
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
    return { ok: false, status: 0, data: null, error: e.message };
  }
}

/**
 * @param {string} symbol
 */
function cacheGetQuote(symbol) {
  const hit = quoteCache.get(symbol);
  if (!hit) return null;
  if (Date.now() - hit.t > QUOTE_CACHE_MS) {
    quoteCache.delete(symbol);
    return null;
  }
  return hit.quote;
}

/**
 * @param {string} symbol
 * @param {object} quote
 */
function cacheSetQuote(symbol, quote) {
  quoteCache.set(symbol, { quote, t: Date.now() });
}

/**
 * @param {string} symbol
 * @param {object} raw
 * @param {string} provider
 */
function toPortfolioQuote(symbol, raw, provider) {
  const pctChange = Number(raw.pctChange);
  if (!Number.isFinite(pctChange)) return null;
  return {
    symbol,
    name: raw.name || symbol,
    price: raw.price,
    change: raw.change ?? null,
    pctChange,
    provider,
  };
}

/**
 * @param {string} symbol
 * @param {Array<object>} attempts
 */
async function fetchYahoo(symbol, attempts) {
  const row = { provider: "yahoo", ok: false, price: null, pctChange: null, error: null };
  attempts.push(row);
  const { ok, status, data } = await fetchJson(
    `/api/proxy?provider=yahoo&symbol=${encodeURIComponent(symbol)}`
  );
  if (!ok || !data?.ok || !Number.isFinite(data.price)) {
    row.error =
      data?.failureReason ||
      data?.message ||
      data?.error ||
      (status ? `HTTP ${status}` : "request_failed");
    return null;
  }
  const pctChange = Number(data.changePercent);
  if (!Number.isFinite(pctChange)) {
    row.error = "missing_change_percent";
    return null;
  }
  row.ok = true;
  row.price = data.price;
  row.pctChange = pctChange;
  return toPortfolioQuote(
    symbol,
    {
      price: data.price,
      change: data.change,
      pctChange,
      name: data.longName || symbol,
    },
    "yahoo"
  );
}

/**
 * @param {string} symbol
 * @param {Array<object>} attempts
 */
async function fetchFinnhub(symbol, attempts) {
  const row = { provider: "finnhub", ok: false, price: null, pctChange: null, error: null };
  attempts.push(row);
  const { ok, status, data } = await fetchJson(
    `/api/proxy?provider=finnhub&endpoint=quote&symbol=${encodeURIComponent(symbol)}`
  );
  const price = data?.c;
  if (!ok || !price || price <= 0) {
    row.error = data?.error || (status ? `HTTP ${status}` : "no_quote");
    return null;
  }
  const pctChange = Number(data.dp);
  if (!Number.isFinite(pctChange)) {
    row.error = "missing_dp";
    return null;
  }
  row.ok = true;
  row.price = price;
  row.pctChange = pctChange;
  return toPortfolioQuote(
    symbol,
    { price, change: data.d || 0, pctChange, name: symbol },
    "finnhub"
  );
}

/**
 * @param {string} symbol
 * @param {Array<object>} attempts
 */
async function fetchTwelveData(symbol, attempts) {
  const row = { provider: "twelvedata", ok: false, price: null, pctChange: null, error: null };
  attempts.push(row);
  const { ok, status, data } = await fetchJson(
    `/api/proxy?provider=twelvedata&endpoint=quote&symbol=${encodeURIComponent(symbol)}`
  );
  if (!ok || !data || data.status === "error" || data.code) {
    row.error = data?.message || data?.code || (status ? `HTTP ${status}` : "no_quote");
    return null;
  }
  const price = parseFloat(data.close);
  const pctChange = parseFloat(data.percent_change);
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(pctChange)) {
    row.error = "parse_error";
    return null;
  }
  row.ok = true;
  row.price = price;
  row.pctChange = pctChange;
  return toPortfolioQuote(
    symbol,
    {
      price,
      change: parseFloat(data.change),
      pctChange,
      name: data.name || symbol,
    },
    "twelvedata"
  );
}

/**
 * @param {string} symbol
 * @param {{ log?: boolean }} [opts]
 */
export async function fetchPortfolioQuote(symbol, opts = {}) {
  const sym = normalizePortfolioSymbol(symbol);
  if (!sym) {
    return { symbol: sym, ok: false, quote: null, attempts: [{ provider: "—", ok: false, error: "invalid_symbol" }] };
  }

  const cached = cacheGetQuote(sym);
  if (cached) {
    const attempts = [{ provider: cached.provider, ok: true, price: cached.price, pctChange: cached.pctChange, cached: true }];
    if (opts.log) debugAttempts.push({ symbol: sym, ok: true, quote: cached, attempts });
    return { symbol: sym, ok: true, quote: cached, attempts };
  }

  const attempts = [];
  let quote =
    (await fetchYahoo(sym, attempts)) ||
    (await fetchFinnhub(sym, attempts)) ||
    (await fetchTwelveData(sym, attempts));

  if (quote) cacheSetQuote(sym, quote);

  const result = { symbol: sym, ok: Boolean(quote), quote, attempts };
  if (opts.log) debugAttempts.push(result);
  return result;
}

/**
 * @param {string[]} symbols
 * @param {(symbol: string, quote: object) => void} onQuote
 * @param {{ isCancelled?: () => boolean }} [opts]
 */
export async function loadPortfolioQuotes(symbols, onQuote, opts = {}) {
  const uniq = [...new Set(symbols.map(normalizePortfolioSymbol).filter(Boolean))];
  const pending = new Set(uniq);
  const quotes = {};

  const trySymbol = async (sym) => {
    if (opts.isCancelled?.()) return;
    const { ok, quote } = await fetchPortfolioQuote(sym);
    if (opts.isCancelled?.()) return;
    if (ok && quote) {
      pending.delete(sym);
      quotes[sym] = quote;
      onQuote(sym, quote);
    }
  };

  await Promise.all(uniq.map((sym) => trySymbol(sym)));

  for (const delay of RETRY_DELAYS_MS) {
    if (opts.isCancelled?.() || pending.size === 0) break;
    await new Promise((r) => setTimeout(r, delay));
    if (opts.isCancelled?.()) break;
    const retrySyms = [...pending];
    await Promise.all(retrySyms.map((sym) => trySymbol(sym)));
  }

  return quotes;
}

export function clearPortfolioQuoteDebugLog() {
  debugAttempts = [];
}

export function getPortfolioQuoteDebugLog() {
  return debugAttempts;
}

/**
 * @param {string[]} [symbols]
 */
export async function fetchPortfolioDebugSnapshot(symbols = PORTFOLIO_SAMPLE_SYMBOLS) {
  clearPortfolioQuoteDebugLog();
  const rows = [];
  for (const raw of symbols) {
    const sym = normalizePortfolioSymbol(raw);
    const result = await fetchPortfolioQuote(sym, { log: true });
    rows.push({
      symbol: sym,
      success: result.ok,
      provider: result.quote?.provider || result.attempts.find((a) => a.ok)?.provider || "—",
      price: result.quote?.price ?? null,
      percentChange: result.quote?.pctChange ?? null,
      error: result.ok ? null : result.attempts.map((a) => `${a.provider}: ${a.error || "failed"}`).join(" → "),
      attempts: result.attempts,
    });
  }
  return { symbols: rows, attempts: getPortfolioQuoteDebugLog(), at: new Date().toISOString() };
}

if (typeof window !== "undefined") {
  window.BriefTickPortfolioQuotes = {
    normalizePortfolioSymbol,
    fetchPortfolioQuote,
    loadPortfolioQuotes,
    fetchPortfolioDebugSnapshot,
    clearPortfolioQuoteDebugLog,
    getPortfolioQuoteDebugLog,
    PORTFOLIO_SAMPLE_SYMBOLS,
    RETRY_DELAYS_MS,
  };
}
