/**
 * Market entity resolution — companies, tickers, sectors, macro, ETFs, indices.
 * Runs before logicRouter.
 * @module logic/entityResolver
 */

import { isWatchlistPerformanceQuery } from "./engines/userContext.js";
import {
  extractSymbolsFromPrompt,
  getTickerDisplayName,
  isKnownLogicTicker,
} from "./engines/tickerCatalog.js";
import {
  isTickerLikeQuery,
  resolveTickerFromPrompt,
} from "./engines/tickerResolver.js";
import { resetTickerQueryContext, rememberResolvedTicker } from "./engines/tickerQueryContext.js";

/** @typedef {'company'|'ticker'|'sector'|'sector_theme'|'macro'|'etf'|'index'|'market'} EntityType */

/**
 * @typedef {Object} ResolvedEntity
 * @property {EntityType} entityType
 * @property {string|null} symbol
 * @property {string|null} companyName
 * @property {number} confidence
 */

const STOPWORDS = new Set([
  "WHAT", "WHATS", "IS", "ARE", "WAS", "WERE", "THE", "A", "AN", "ON", "IN", "AT",
  "TO", "FOR", "OF", "AND", "OR", "MY", "ME", "SHOW", "LATEST", "NEWS", "TODAY",
  "WHY", "HOW", "GET", "GIVE", "ANALYZE", "EXPLAIN", "TELL", "ABOUT", "WITH",
  "FROM", "THAT", "THIS", "IT", "ITS", "BE", "BEEN", "ANY", "ALL", "SOME",
  "CURRENT", "MARKET", "STOCK", "STOCKS", "SHARE", "PRICE", "MOVING", "MOVE",
  "HAPPENING", "HAPPENED", "UPDATE", "UPDATES", "READ", "BRIEF", "REGIME", "RISK",
]);

const INDEX_ALIASES = [
  ["s&p 500", "SPY", "S&P 500", "index"],
  ["s and p 500", "SPY", "S&P 500", "index"],
  ["sp500", "SPY", "S&P 500", "index"],
  ["s&p500", "SPY", "S&P 500", "index"],
  ["nasdaq 100", "QQQ", "Nasdaq 100", "index"],
  ["nasdaq", "QQQ", "Nasdaq", "index"],
  ["dow jones", "DIA", "Dow Jones", "index"],
  ["dow", "DIA", "Dow", "index"],
  ["russell 2000", "IWM", "Russell 2000", "index"],
  ["vix", "VIX", "VIX", "index"],
];

const ETF_ALIASES = [
  ["spy", "SPY", "SPDR S&P 500 ETF", "etf"],
  ["qqq", "QQQ", "Invesco QQQ", "etf"],
  ["dia", "DIA", "SPDR Dow ETF", "etf"],
  ["iwm", "IWM", "Russell 2000 ETF", "etf"],
];

const SECTOR_THEMES = [
  [/ai stocks|artificial intelligence stocks|ai sector|ai names/i, "XLK", "AI / Technology theme", "sector_theme", 78],
  [/semiconductor|chip stocks|semi stocks/i, "SOX", "Semiconductors", "sector_theme", 76],
  [/tech stocks|technology sector/i, "XLK", "Technology", "sector_theme", 72],
  [/energy sector|oil stocks/i, "XLE", "Energy", "sector_theme", 70],
  [/financials|bank stocks/i, "XLF", "Financials", "sector_theme", 70],
  [/health care|healthcare stocks/i, "XLV", "Health Care", "sector_theme", 68],
];

const MACRO_KEYWORDS = [
  [/federal reserve|the fed\b|fomc|powell/i, null, "Federal Reserve", "macro", 74],
  [/interest rates|rates rise|rates cut|yield curve/i, null, "Interest rates", "macro", 72],
  [/inflation|cpi|pce/i, null, "Inflation", "macro", 70],
  [/oil price|crude oil|opec/i, null, "Oil / Energy macro", "macro", 68],
  [/recession|gdp|payrolls|jobs report/i, null, "Growth / labour macro", "macro", 66],
];

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

/**
 * @param {string} prompt
 * @returns {ResolvedEntity[]}
 */
export function resolveEntities(prompt) {
  const normalized = normalizePrompt(prompt);
  if (!normalized) {
    return [{ entityType: "market", symbol: null, companyName: null, confidence: 40 }];
  }

  const found = /** @type {ResolvedEntity[]} */ ([]);
  const usedSpans = [];

  const tryAdd = (entity) => {
    const key = `${entity.entityType}:${entity.symbol}:${entity.companyName}`;
    if (found.some((e) => `${e.entityType}:${e.symbol}:${e.companyName}` === key)) return;
    found.push(entity);
  };

  const tickerHit = resolveTickerFromPrompt(prompt);
  if (tickerHit.ok && tickerHit.symbol) {
    tryAdd({
      entityType: tickerHit.assetType === "etf" ? "etf" : "company",
      symbol: tickerHit.symbol,
      companyName: tickerHit.name,
      confidence: tickerHit.confidence,
    });
  }

  for (const [alias, symbol, name, type] of INDEX_ALIASES) {
    if (normalized.includes(alias)) {
      tryAdd({
        entityType: type,
        symbol,
        companyName: name,
        confidence: 88,
      });
    }
  }

  for (const [alias, symbol, name, type] of ETF_ALIASES) {
    if (normalized.includes(alias)) {
      tryAdd({
        entityType: type,
        symbol,
        companyName: name,
        confidence: 86,
      });
    }
  }

  if (!isTickerLikeQuery(prompt)) {
    for (const [re, symbol, name, type, conf] of SECTOR_THEMES) {
      if (re.test(normalized)) {
        tryAdd({
          entityType: type,
          symbol,
          companyName: name,
          confidence: conf,
        });
      }
    }
  }

  for (const [re, symbol, name, type, conf] of MACRO_KEYWORDS) {
    if (re.test(normalized)) {
      tryAdd({
        entityType: type,
        symbol,
        companyName: name,
        confidence: conf,
      });
    }
  }

  const trimmed = (prompt || "").trim();
  const firstToken = trimmed.split(/\s+/)[0]?.replace(/[^A-Za-z0-9.]/g, "").toUpperCase() || "";
  const isBareTickerPrompt =
    trimmed.split(/\s+/).length === 1 && isKnownLogicTicker(firstToken);

  const allowWatchlist = !isTickerLikeQuery(prompt);

  if (!isWatchlistPerformanceQuery(prompt)) {
    for (const sym of extractSymbolsFromPrompt(prompt, [], { allowWatchlist })) {
      if (STOPWORDS.has(sym)) continue;
      const hasDollar = (prompt || "").toUpperCase().includes(`$${sym}`);
      if (sym === firstToken && !hasDollar && !isBareTickerPrompt) continue;
      tryAdd({
        entityType: "ticker",
        symbol: sym,
        companyName: getTickerDisplayName(sym),
        confidence: hasDollar ? 92 : 86,
      });
    }
  }

  found.sort((a, b) => b.confidence - a.confidence);
  if (!found.length) {
    return [{ entityType: "market", symbol: null, companyName: null, confidence: 35 }];
  }
  return found;
}

/**
 * @param {string} prompt
 * @returns {ResolvedEntity}
 */
/**
 * @param {string} prompt
 * @param {{ watchlistSymbols?: string[] }} [options]
 */
export function resolvePrimaryEntity(prompt, options = {}) {
  resetTickerQueryContext();

  const resolution = resolveTickerFromPrompt(prompt, options);
  if (resolution.ok && resolution.symbol) {
    const entity = {
      entityType: resolution.assetType === "etf" ? "etf" : "ticker",
      symbol: resolution.symbol,
      companyName: resolution.name || getTickerDisplayName(resolution.symbol),
      confidence: resolution.confidence,
    };
    rememberResolvedTicker({
      symbol: entity.symbol,
      name: entity.companyName,
    });
    return entity;
  }

  if (isTickerLikeQuery(prompt)) {
    return {
      entityType: "unresolved",
      symbol: null,
      companyName: null,
      confidence: 0,
      unresolved: true,
      suggestions: resolution.suggestions || [],
    };
  }

  const allowWatchlist = true;
  const fromPrompt = extractSymbolsFromPrompt(
    prompt,
    allowWatchlist ? options.watchlistSymbols || [] : [],
    { allowWatchlist }
  );
  if (fromPrompt.length) {
    const sym = fromPrompt[0];
    const entity = {
      entityType: isKnownLogicTicker(sym) ? "ticker" : "etf",
      symbol: sym,
      companyName: getTickerDisplayName(sym),
      confidence: 90,
    };
    rememberResolvedTicker({ symbol: entity.symbol, name: entity.companyName });
    return entity;
  }

  const entities = resolveEntities(prompt);
  const priority = ["company", "etf", "index", "ticker", "sector_theme", "macro", "market"];
  for (const type of priority) {
    const hit = entities.find((e) => e.entityType === type && e.symbol);
    if (hit) return hit;
  }
  const company = entities.find((e) => e.entityType === "company");
  if (company) return company;
  return entities[0] || { entityType: "market", symbol: null, companyName: null, confidence: 35 };
}

/**
 * All ticker targets for a prompt (compare / multi-name questions).
 * @param {string} prompt
 * @param {{ watchlistSymbols?: string[] }} [options]
 */
export function resolveTickerTargets(prompt, options = {}) {
  const resolution = resolveTickerFromPrompt(prompt, options);
  if (resolution.ok && resolution.symbol) return [resolution.symbol];

  const allowWatchlist = !isTickerLikeQuery(prompt);
  const fromPrompt = extractSymbolsFromPrompt(
    prompt,
    allowWatchlist ? options.watchlistSymbols || [] : [],
    { allowWatchlist }
  );
  if (fromPrompt.length) return fromPrompt;
  const primary = resolvePrimaryEntity(prompt, options);
  return primary.symbol ? [primary.symbol] : [];
}
