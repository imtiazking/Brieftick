/**
 * Logic ticker catalog — display names & quote aliases; resolution uses Movers lookup.
 * @module logic/engines/tickerCatalog
 */

import {
  getMoversSymbolRow,
  isMoversSearchableSymbol,
  MOVERS_SYMBOL_DIRECTORY,
} from "../../lib/moversSymbolLookup.js";

/** @type {Set<string>} */
export const LOGIC_TICKER_CATALOG = new Set([
  "NVDA", "TSLA", "AAPL", "MSFT", "GOOGL", "GOOG", "AMZN", "META", "AMD", "INTC",
  "AVGO", "SMCI", "SPY", "QQQ", "DIA", "IWM", "XOM", "CVX", "JPM", "GS", "NFLX",
  "CRM", "COST", "LLY", "JNJ", "BAC", "CAT", "BA", "RIVN", "SOX", "XLK", "XLF",
  "XLE", "XLV", "XLP", "XLU", "SPX", "NDX", "MU", "ARM", "ASML", "TSM", "PLTR",
  "COIN", "UBER", "DIS", "ORCL", "BRK.B", "GLD", "SLV", "GDX", "USO", "UNG",
  "SNOW", "NOK",
  "UUP", "USD", "TLT", "HYG", "LQD", "VNQ", "ARKK", "SMH", "IBIT",
]);

/** User-facing symbol → quote API symbol when the tape uses a proxy ETF. */
export const QUOTE_SYMBOL_ALIAS = {
  USD: "UUP",
};

/** @type {Record<string, string>} */
export const TICKER_DISPLAY_NAMES = {
  GLD: "Gold ETF",
  SLV: "Silver ETF",
  GDX: "Gold miners ETF",
  USO: "US Oil Fund",
  UNG: "Natural Gas ETF",
  UUP: "US Dollar Bullish ETF",
  USD: "US dollar (UUP proxy)",
  SPY: "S&P 500 ETF",
  QQQ: "Nasdaq 100 ETF",
  DIA: "Dow ETF",
  IWM: "Russell 2000 ETF",
  NVDA: "Nvidia",
  AAPL: "Apple",
  MSFT: "Microsoft",
  TSLA: "Tesla",
  META: "Meta",
  AMD: "AMD",
  SNOW: "Snowflake",
  MU: "Micron",
  INTC: "Intel",
  NOK: "Nokia",
  GOOGL: "Alphabet",
  AMZN: "Amazon",
  JPM: "JPMorgan",
};

/**
 * @param {string} sym
 */
export function isKnownLogicTicker(sym) {
  const s = String(sym || "").toUpperCase().trim();
  return LOGIC_TICKER_CATALOG.has(s) || !!getMoversSymbolRow(s) || isMoversSearchableSymbol(s);
}

for (const [symbol, name] of MOVERS_SYMBOL_DIRECTORY) {
  if (!TICKER_DISPLAY_NAMES[symbol]) {
    TICKER_DISPLAY_NAMES[symbol] = name.split(" · ")[0];
  }
  LOGIC_TICKER_CATALOG.add(symbol);
}

/**
 * @param {string} sym
 */
export function resolveQuoteSymbol(sym) {
  const s = String(sym || "").toUpperCase().trim();
  return QUOTE_SYMBOL_ALIAS[s] || s;
}

/**
 * @param {string} sym
 */
export function getTickerDisplayName(sym) {
  const s = String(sym || "").toUpperCase().trim();
  return TICKER_DISPLAY_NAMES[s] || getMoversSymbolRow(s)?.name || s;
}

/**
 * Extract valid tickers mentioned in the prompt (watchlist + catalog).
 * @param {string} prompt
 * @param {string[]} [extraSymbols]
 * @returns {string[]}
 */
export function extractSymbolsFromPrompt(prompt, extraSymbols = [], opts = {}) {
  const text = String(prompt || "").toUpperCase();
  if (!text || text.length < 2) return [];

  /** @type {string[]} */
  const found = [];
  const seen = new Set();

  const extras =
    opts.allowWatchlist === false ? [] : extraSymbols.map((s) => String(s).toUpperCase());

  const catalog = [...LOGIC_TICKER_CATALOG, ...extras]
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);

  for (const ticker of catalog) {
    const escaped = ticker.replace(/\./g, "\\.");
    const re = new RegExp(`(?:\\$|\\b)${escaped}(?:\\b|$)`, "g");
    if (re.test(text)) {
      if (!seen.has(ticker)) {
        seen.add(ticker);
        found.push(ticker);
      }
    }
  }

  const fromRegex = text.match(/\$?([A-Z]{1,5})\b/g) || [];
  for (const raw of fromRegex) {
    const sym = raw.replace("$", "");
    if (isKnownLogicTicker(sym) && !seen.has(sym)) {
      seen.add(sym);
      found.push(sym);
    }
  }

  return found;
}
