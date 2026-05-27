/**
 * Watchlist ticker normalization & validation — single source of truth.
 * @module logic/engines/watchlistSymbols
 */

import { logicDebug } from "../shared.js";

/** @typedef {'empty'|'too_long'|'invalid_format'|'resolver_stopword'|'repaired_concat'} RejectReason */

import { LOGIC_TICKER_CATALOG } from "./tickerCatalog.js";

/** Known liquid symbols — used to repair concatenated blobs (NVDA+MSFT+…). */
export const KNOWN_WATCHLIST_TICKERS = LOGIC_TICKER_CATALOG;

/** False positives from entityResolver-style prompt scanning — never watchlist names. */
const RESOLVER_STOPWORDS = new Set([
  "WHAT", "WHATS", "STOCK", "STOCKS", "BEST", "WORST", "PERF", "RMING", "HLIST",
  "WATCH", "LIST", "TOP", "OUT", "FROM", "WITH", "THAT", "THIS", "YOUR", "MINE",
]);

/** Common merge/parse artifacts — never valid watchlist names. */
const TICKER_BLOCKLIST = new Set(["NVDAM", "NVDAMS", "AAPLM", "MSFTA", "METAA"]);

const TICKER_FORMAT = /^[A-Z][A-Z0-9]{0,4}(\.[A-Z])?$/;

/**
 * @param {string} sym
 */
export function isValidWatchlistTicker(sym) {
  const s = String(sym || "").toUpperCase().trim();
  if (!s || s.length > 6) return false;
  if (RESOLVER_STOPWORDS.has(s)) return false;
  if (TICKER_BLOCKLIST.has(s)) return false;
  if (!TICKER_FORMAT.test(s)) return false;
  return true;
}

/**
 * @param {string} raw
 */
function normalizeTickerToken(raw) {
  return String(raw || "")
    .toUpperCase()
    .trim()
    .replace(/^\$/, "")
    .replace(/[^A-Z0-9.]/g, "");
}

/**
 * Split pasted / stored values into candidate tokens.
 * @param {unknown} input
 * @returns {string[]}
 */
export function splitWatchlistInput(input) {
  if (input == null) return [];
  if (Array.isArray(input)) {
    return input.flatMap((item) => splitWatchlistInput(item));
  }
  const text = String(input).trim();
  if (!text) return [];
  if (text.startsWith("[") && text.includes(",")) {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) return splitWatchlistInput(parsed);
    } catch (_) {}
  }
  return text
    .split(/[\s,;|/\n\r\t]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/**
 * Greedy repair when multiple tickers were merged (e.g. NVDAMSFTAAPL…).
 * @param {string} blob
 */
export function repairConcatenatedWatchlist(blob) {
  const u = String(blob || "")
    .toUpperCase()
    .replace(/[^A-Z.]/g, "");
  if (!u || u.length <= 6) return u && isValidWatchlistTicker(u) ? [u] : [];

  const catalog = [...KNOWN_WATCHLIST_TICKERS].sort((a, b) => b.length - a.length);
  /** @type {string[]} */
  const out = [];
  let i = 0;
  let guard = 0;

  while (i < u.length && guard < u.length * 2) {
    guard += 1;
    let matched = false;
    for (const ticker of catalog) {
      if (u.startsWith(ticker, i)) {
        out.push(ticker);
        i += ticker.length;
        matched = true;
        break;
      }
    }
    if (!matched) i += 1;
  }

  return [...new Set(out)];
}

/**
 * @param {string} token
 * @param {{ repaired?: boolean }} meta
 */
function acceptToken(token, meta = {}) {
  const sym = normalizeTickerToken(token);
  if (!sym) return null;

  if (sym.length > 5 && !sym.includes(".")) {
    const repaired = repairConcatenatedWatchlist(sym);
    if (repaired.length) {
      logicDebug("watchlistSymbol.repaired_concat", { raw: sym, repaired });
      return repaired.map((s) => ({ sym: s, repaired: true }));
    }
    logicDebug("watchlistSymbol.rejected", { raw: sym, reason: "too_long" });
    return null;
  }

  if (!isValidWatchlistTicker(sym)) {
    logicDebug("watchlistSymbol.rejected", {
      raw: sym,
      reason: RESOLVER_STOPWORDS.has(sym) ? "resolver_stopword" : "invalid_format",
    });
    return null;
  }

  return [{ sym, repaired: meta.repaired || false }];
}

/**
 * @param {string[]|string|unknown} input
 * @param {{ max?: number }} [options]
 * @returns {string[]}
 */
export function resolveWatchlistSymbols(input, options = {}) {
  const max = options.max ?? 24;
  const tokens = splitWatchlistInput(input);
  /** @type {string[]} */
  const resolved = [];
  const seen = new Set();

  for (const token of tokens) {
    const accepted = acceptToken(token);
    if (!accepted) continue;
    for (const { sym } of accepted) {
      if (seen.has(sym)) continue;
      seen.add(sym);
      resolved.push(sym);
      if (resolved.length >= max) break;
    }
    if (resolved.length >= max) break;
  }

  logicDebug("watchlistSymbols.resolved", resolved);
  return resolved;
}

/**
 * Pull known tickers mentioned in the question (when nothing saved yet).
 * @param {string} prompt
 */
export function extractTickersFromPrompt(prompt) {
  const text = String(prompt || "").toUpperCase();
  if (!text || text.length < 4) return [];

  /** @type {string[]} */
  const found = [];
  const catalog = [...KNOWN_WATCHLIST_TICKERS].sort((a, b) => b.length - a.length);

  for (const ticker of catalog) {
    const escaped = ticker.replace(/\./g, "\\.");
    const re = new RegExp(`(?:\\$|\\b)${escaped}(?:\\b|$)`, "g");
    if (re.test(text)) found.push(ticker);
  }

  const fromRegex = text.match(/\$?([A-Z]{1,5})\b/g) || [];
  for (const raw of fromRegex) {
    const sym = raw.replace("$", "");
    if (isValidWatchlistTicker(sym)) found.push(sym);
  }

  return resolveWatchlistSymbols(found);
}

/**
 * @typedef {'saved'|'dashboard'|'prompt'|'empty'} WatchlistSource
 */

/**
 * @typedef {Object} ResolvedWatchlist
 * @property {string[]} symbols
 * @property {WatchlistSource} source
 */

/**
 * Saved watchlist → dashboard memory → tickers named in the prompt.
 * @param {string} [prompt]
 * @param {string[]} [storedSymbols]
 * @returns {ResolvedWatchlist}
 */
export function resolveWatchlistForQuery(prompt, storedSymbols) {
  let symbols = resolveWatchlistSymbols(storedSymbols || []);
  if (symbols.length) {
    logicDebug("watchlistForQuery", { source: "saved", symbols });
    return { symbols, source: "saved" };
  }

  if (typeof window !== "undefined" && Array.isArray(window.watchlistSymbols) && window.watchlistSymbols.length) {
    symbols = resolveWatchlistSymbols(window.watchlistSymbols);
    if (symbols.length) {
      logicDebug("watchlistForQuery", { source: "dashboard", symbols });
      return { symbols, source: "dashboard" };
    }
  }

  if (prompt) {
    symbols = extractTickersFromPrompt(prompt);
    const perfContext =
      /\bwatchlist\b/i.test(prompt) ||
      /perform|gainer|loser|leading|lagging|weakest|strongest|outperform|underperform/i.test(prompt);
    if (symbols.length && (perfContext || symbols.length >= 2)) {
      logicDebug("watchlistForQuery", { source: "prompt", symbols });
      return { symbols, source: "prompt" };
    }
  }

  logicDebug("watchlistForQuery", { source: "empty", symbols: [] });
  return { symbols: [], source: "empty" };
}
