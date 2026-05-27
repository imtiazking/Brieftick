/**
 * Logic ticker resolver — delegates to shared Movers symbol lookup.
 * @module logic/engines/tickerResolver
 */

import { logicDebug } from "../logicDebug.js";
import { buildLogicResponse, LOGIC_DISCLAIMER } from "../types.js";
import {
  extractTickerCandidate,
  lookupMoversSymbol,
  resolveMoversSymbolFromPrompt,
  normalizePromptText,
} from "../../lib/moversSymbolLookup.js";

export { normalizePromptText as normalizePrompt };

/** @typedef {'equity'|'etf'|'index'|'adr'} TickerAssetType */

/**
 * @typedef {Object} TickerResolveResult
 * @property {boolean} ok
 * @property {string} [symbol]
 * @property {string} [name]
 * @property {TickerAssetType} [assetType]
 * @property {string} [exchange]
 * @property {string} [sector]
 * @property {number} [confidence]
 * @property {string} [matchedKey]
 * @property {string} [source]
 * @property {{ symbol: string, name: string }[]} [suggestions]
 * @property {string} [rawInput]
 * @property {string} [candidate]
 */

const MIN_CONFIDENCE = 72;

/**
 * @param {string} prompt
 */
export function isTickerLikeQuery(prompt) {
  const t = normalizePromptText(prompt);
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
 * @param {import('../../lib/moversSymbolLookup.js').MoversLookupResult} movers
 * @returns {TickerResolveResult}
 */
function fromMoversLookup(movers) {
  return {
    ok: movers.ok && (movers.confidence || 0) >= MIN_CONFIDENCE,
    symbol: movers.symbol,
    name: movers.name,
    assetType: movers.assetType || "equity",
    exchange: movers.exchange,
    sector: movers.sector,
    confidence: movers.confidence,
    matchedKey: movers.candidate,
    source: movers.source || "moversSymbolLookup",
    rawInput: movers.rawInput,
    candidate: movers.candidate,
    suggestions: movers.suggestions || [],
  };
}

/**
 * @param {TickerResolveResult} result
 */
function logResolution(result) {
  logicDebug("tickerResolver.candidate", result.candidate);
  logicDebug("tickerResolver.lookup", {
    source: result.source,
    symbol: result.symbol,
    name: result.name,
    confidence: result.confidence,
    exchange: result.exchange,
    assetType: result.assetType,
    sector: result.sector,
  });
}

/**
 * @param {string} prompt
 * @param {{ watchlistSymbols?: string[] }} [options]
 * @returns {TickerResolveResult}
 */
export function resolveTickerFromPrompt(prompt, options = {}) {
  void options;
  const rawInput = String(prompt || "").trim();
  logicDebug("tickerResolver.raw", rawInput);

  const candidate = extractTickerCandidate(prompt);
  logicDebug("tickerResolver.extractedCandidate", candidate);

  const movers = resolveMoversSymbolFromPrompt(prompt);
  const result = fromMoversLookup({ ...movers, rawInput, candidate: movers.candidate || candidate });

  if (result.ok) {
    logResolution(result);
    logicDebug("tickerResolver.resolved", {
      rawInput,
      candidate: result.candidate,
      lookupSource: result.source,
      symbol: result.symbol,
      name: result.name,
      confidence: result.confidence,
    });
    return result;
  }

  logicDebug("tickerResolver.unresolved", {
    rawInput,
    candidate,
    lookupSource: movers.source,
    suggestions: movers.suggestions,
  });

  return {
    ok: false,
    rawInput,
    candidate,
    confidence: 0,
    source: movers.source || "movers-unresolved",
    suggestions: movers.suggestions || [],
  };
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

/** Re-export for tests */
export { lookupMoversSymbol, extractTickerCandidate };
