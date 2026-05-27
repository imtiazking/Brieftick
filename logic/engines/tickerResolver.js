/**
 * Central ticker resolver — aliases, names, misspellings, ETFs (single source of truth).
 * @module logic/engines/tickerResolver
 */

import { logicDebug } from "../logicDebug.js";
import { buildLogicResponse, LOGIC_DISCLAIMER } from "../types.js";
import {
  getTickerDisplayName,
  isKnownLogicTicker,
  LOGIC_TICKER_CATALOG,
} from "./tickerCatalog.js";
/**
 * @param {string} prompt
 */
export function normalizePrompt(prompt) {
  return (prompt || "")
    .toLowerCase()
    .replace(/[''`]/g, "'")
    .replace(/&/g, " and ")
    .replace(/[^\w\s.'/-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** @typedef {'equity'|'etf'|'index'|'adr'} TickerAssetType */

/**
 * @typedef {Object} TickerResolveResult
 * @property {boolean} ok
 * @property {string} [symbol]
 * @property {string} [name]
 * @property {TickerAssetType} [assetType]
 * @property {number} [confidence]
 * @property {string} [matchedKey]
 * @property {string} [source]
 * @property {{ symbol: string, name: string }[]} [suggestions]
 * @property {string} [rawInput]
 */

/** @type {{ keys: string[], symbol: string, name: string, assetType: TickerAssetType, confidence: number }[]} */
const RESOLVE_ENTRIES = [
  { keys: ["nvidia corporation", "nvidia", "nvda", "nvdia"], symbol: "NVDA", name: "Nvidia", assetType: "equity", confidence: 96 },
  { keys: ["apple inc", "apple", "aapl"], symbol: "AAPL", name: "Apple", assetType: "equity", confidence: 96 },
  { keys: ["microsoft corporation", "microsoft", "msft"], symbol: "MSFT", name: "Microsoft", assetType: "equity", confidence: 96 },
  { keys: ["alphabet inc", "alphabet", "google", "googl", "goog"], symbol: "GOOGL", name: "Alphabet", assetType: "equity", confidence: 95 },
  { keys: ["amazon.com", "amazon", "amzn"], symbol: "AMZN", name: "Amazon", assetType: "equity", confidence: 95 },
  { keys: ["meta platforms", "facebook", "meta", "fb stock"], symbol: "META", name: "Meta", assetType: "equity", confidence: 95 },
  { keys: ["tesla inc", "tesla", "tsla"], symbol: "TSLA", name: "Tesla", assetType: "equity", confidence: 96 },
  { keys: ["intel corporation", "intel", "intc"], symbol: "INTC", name: "Intel", assetType: "equity", confidence: 96 },
  { keys: ["micron technology", "micron", "mu"], symbol: "MU", name: "Micron", assetType: "equity", confidence: 95 },
  { keys: ["snowflake inc", "snowflake", "snow"], symbol: "SNOW", name: "Snowflake", assetType: "equity", confidence: 94 },
  { keys: ["nokia corporation", "nokia", "nok"], symbol: "NOK", name: "Nokia", assetType: "equity", confidence: 95 },
  { keys: ["advanced micro devices", "amd"], symbol: "AMD", name: "AMD", assetType: "equity", confidence: 94 },
  { keys: ["broadcom", "avgo"], symbol: "AVGO", name: "Broadcom", assetType: "equity", confidence: 92 },
  { keys: ["netflix", "nflx"], symbol: "NFLX", name: "Netflix", assetType: "equity", confidence: 92 },
  { keys: ["jpmorgan", "jp morgan", "jpm"], symbol: "JPM", name: "JPMorgan", assetType: "equity", confidence: 94 },
  { keys: ["palantir", "pltr"], symbol: "PLTR", name: "Palantir", assetType: "equity", confidence: 92 },
  { keys: ["coinbase", "coin"], symbol: "COIN", name: "Coinbase", assetType: "equity", confidence: 90 },
  { keys: ["uber technologies", "uber"], symbol: "UBER", name: "Uber", assetType: "equity", confidence: 90 },
  { keys: ["disney", "dis"], symbol: "DIS", name: "Disney", assetType: "equity", confidence: 90 },
  { keys: ["salesforce", "crm"], symbol: "CRM", name: "Salesforce", assetType: "equity", confidence: 90 },
  { keys: ["oracle", "orcl"], symbol: "ORCL", name: "Oracle", assetType: "equity", confidence: 90 },
  { keys: ["super micro", "supermicro", "smci"], symbol: "SMCI", name: "Super Micro", assetType: "equity", confidence: 90 },
  { keys: ["exxon mobil", "exxon", "xom"], symbol: "XOM", name: "Exxon Mobil", assetType: "equity", confidence: 90 },
  { keys: ["chevron", "cvx"], symbol: "CVX", name: "Chevron", assetType: "equity", confidence: 90 },
  { keys: ["gold etf", "gold fund", "spdr gold", "gld"], symbol: "GLD", name: "Gold ETF", assetType: "etf", confidence: 94 },
  { keys: ["silver etf", "slv"], symbol: "SLV", name: "Silver ETF", assetType: "etf", confidence: 90 },
  { keys: ["s&p 500 etf", "s and p 500 etf", "sp500 etf", "s&p500 etf", "spy etf", "spy"], symbol: "SPY", name: "S&P 500 ETF", assetType: "etf", confidence: 94 },
  { keys: ["nasdaq 100 etf", "nasdaq100 etf", "qqq etf", "qqq"], symbol: "QQQ", name: "Nasdaq 100 ETF", assetType: "etf", confidence: 94 },
  { keys: ["dow jones etf", "dow etf", "dia"], symbol: "DIA", name: "Dow ETF", assetType: "etf", confidence: 90 },
  { keys: ["russell 2000 etf", "iwm"], symbol: "IWM", name: "Russell 2000 ETF", assetType: "etf", confidence: 88 },
  { keys: ["s&p 500", "s and p 500", "sp500", "s&p500"], symbol: "SPY", name: "S&P 500", assetType: "index", confidence: 88 },
  { keys: ["nasdaq 100", "nasdaq100"], symbol: "QQQ", name: "Nasdaq 100", assetType: "index", confidence: 88 },
];

const SORTED_ENTRIES = [...RESOLVE_ENTRIES].sort(
  (a, b) => Math.max(...b.keys.map((k) => k.length)) - Math.max(...a.keys.map((k) => k.length))
);

const SYMBOL_INDEX = new Map(
  RESOLVE_ENTRIES.map((e) => [e.symbol, e])
);

const MIN_CONFIDENCE = 72;

/**
 * @param {string} prompt
 */
export function isTickerLikeQuery(prompt) {
  const t = normalizePrompt(prompt);
  if (!t || t.length < 4) return false;
  if (
    /portfolio|watchlist|my holdings|what breaks|fragil|stress test|fed\b|fomc|powell|inflation\b|cpi\b|explain the market|today'?s market\b/i.test(
      t
    )
  ) {
    return false;
  }
  if (/\bcompare\b.*\band\b/i.test(t)) return false;
  return (
    /\b(why is|why are|why's|what is|what's|how is)\s+[a-z0-9]/i.test(prompt) ||
    /\bwhy\b.*\b(mov|moving|down|up|weak|strong)\b/i.test(t) ||
    /\bwhat\b.*\b(driving|happening to)\b/i.test(t) ||
    /\b(latest|news)\s+(on|for|about)\s+/i.test(t)
  );
}

/**
 * @param {string} normalized
 * @param {string} key
 */
function includesKey(normalized, key) {
  if (!key) return false;
  if (key.length <= 4) {
    return new RegExp(`\\b${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(normalized);
  }
  return normalized.includes(key);
}

/**
 * @param {string} prompt
 * @param {{ watchlistSymbols?: string[] }} [options]
 * @returns {TickerResolveResult}
 */
export function resolveTickerFromPrompt(prompt, options = {}) {
  const rawInput = String(prompt || "").trim();
  const normalized = normalizePrompt(rawInput);
  /** @type {TickerResolveResult} */
  const base = { ok: false, rawInput, suggestions: [] };

  if (!normalized) return base;

  logicDebug("tickerResolver.raw", rawInput);

  /** @type {{ entry: typeof RESOLVE_ENTRIES[0], key: string } | null} */
  let best = null;

  for (const entry of SORTED_ENTRIES) {
    for (const key of entry.keys) {
      if (!includesKey(normalized, key)) continue;
      if (!best || key.length > best.key.length) {
        best = { entry, key };
      }
    }
  }

  const upper = rawInput.toUpperCase();
  for (const sym of LOGIC_TICKER_CATALOG) {
    const escaped = sym.replace(/\./g, "\\.");
    const re = new RegExp(`(?:\\$|\\b)${escaped}(?:\\b|$)`);
    if (!re.test(upper)) continue;
    const entry = SYMBOL_INDEX.get(sym) || {
      symbol: sym,
      name: getTickerDisplayName(sym),
      assetType: "equity",
      confidence: 88,
      keys: [sym.toLowerCase()],
    };
    const key = sym;
    if (!best || key.length >= best.key.length) {
      best = { entry, key };
    }
  }

  if (best) {
    const { entry, key } = best;
    const result = {
      ok: entry.confidence >= MIN_CONFIDENCE,
      symbol: entry.symbol,
      name: entry.name,
      assetType: entry.assetType,
      confidence: entry.confidence,
      matchedKey: key,
      source: "tickerResolver",
      rawInput,
      suggestions: [],
    };
    logResolution(result);
    return result;
  }

  const suggestions = suggestFromTypos(normalized);
  logicDebug("tickerResolver.unresolved", { rawInput, suggestions });
  return {
    ok: false,
    rawInput,
    confidence: 0,
    source: "tickerResolver",
    suggestions,
  };
}

/**
 * @param {string} normalized
 */
function suggestFromTypos(normalized) {
  const tokens = normalized.split(/\s+/).filter((w) => w.length >= 3);
  /** @type {Map<string, { symbol: string, name: string }>} */
  const out = new Map();

  for (const token of tokens) {
    for (const entry of RESOLVE_ENTRIES) {
      for (const key of entry.keys) {
        if (key.length < 4) continue;
        if (levenshtein(token, key) <= 1) {
          out.set(entry.symbol, { symbol: entry.symbol, name: entry.name });
        }
      }
    }
  }

  return [...out.values()].slice(0, 3);
}

/**
 * @param {string} a
 * @param {string} b
 */
function levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  const row = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = row[j];
      row[j] =
        a[i - 1] === b[j - 1]
          ? prev
          : 1 + Math.min(prev, row[j], row[j - 1]);
      prev = tmp;
    }
  }
  return row[n];
}

/**
 * @param {TickerResolveResult} result
 */
function logResolution(result) {
  logicDebug("tickerResolver.resolved", {
    rawInput: result.rawInput,
    candidate: result.matchedKey,
    symbol: result.symbol,
    name: result.name,
    confidence: result.confidence,
    assetType: result.assetType,
    source: result.source,
  });
}

/**
 * @param {{ suggestions?: { symbol: string, name: string }[] }} resolution
 */
export function buildTickerUnresolvedResponse(resolution) {
  const suggestions = resolution.suggestions || [];
  const hint =
    suggestions.length > 0
      ? suggestions.map((s) => `${s.name} (${s.symbol})`).join(", ")
      : "Nvidia (NVDA), Nokia (NOK), Snowflake (SNOW)";
  const direct = `I couldn't confidently identify that ticker. Did you mean ${hint}?`;

  return buildLogicResponse({
    title: "Ticker not identified",
    directAnswer: direct,
    summary: direct,
    cards: {
      snapshot: direct,
      catalyst: "Clarify the symbol or company name",
      macroContext: "—",
      sectorImpact: "—",
      volatility: "—",
      aiSummary: direct,
    },
    keyDrivers: ["Unresolved ticker"],
    signals: ["Needs clarification"],
    confidence: 100,
    sources: ["Brieftick Logic"],
    disclaimer: LOGIC_DISCLAIMER,
    mode: "ticker",
    dataLimited: true,
    unresolvedTicker: true,
  });
}
