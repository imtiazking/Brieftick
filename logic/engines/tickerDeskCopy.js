/**
 * Ticker desk copy — symbol-specific fallback answers (no generic template jargon).
 * @module logic/engines/tickerDeskCopy
 */

import { buildLogicResponse, LOGIC_DISCLAIMER } from "../types.js";
import { getTickerDisplayName } from "./tickerCatalog.js";
import {
  applyTickerVoiceVariation,
  applyTickerVoiceToResponse,
} from "./tickerVoiceVariation.js";

/** Phrases to strip or reject in ticker answers. */
export const GENERIC_TICKER_PHRASE_RE =
  /in focus on today'?s tape|headline sensitivity|sector beta remain(?:s)? the primary channels?|macro rates framing the move|contextual read while live feeds|live feeds connect|catalyst sensitivity plus sector beta|Moves reflect catalyst sensitivity|historical catalyst behavior|read through headlines and sector tone rather than price alone|tape in focus|while live feeds reconnect|attention on headline flow and sector beta/i;

const SEMIS = new Set([
  "NVDA", "AMD", "INTC", "AVGO", "MU", "ASML", "TSM", "ARM", "SMCI", "SOX", "SMH",
]);
const MEGA_TECH = new Set([
  "AAPL", "MSFT", "GOOGL", "GOOG", "AMZN", "META", "NFLX", "ORCL", "CRM", "ADBE",
]);
const HIGH_BETA_GROWTH = new Set(["TSLA", "RIVN", "COIN", "PLTR", "ARKK", "UBER"]);
const FINANCIALS = new Set(["JPM", "GS", "BAC", "XLF"]);
const ENERGY = new Set(["XOM", "CVX", "USO", "UNG", "XLE"]);
const PRECIOUS = new Set(["GLD", "SLV", "GDX"]);
const DOLLAR = new Set(["UUP", "USD"]);
const INDICES = new Set(["SPY", "QQQ", "DIA", "IWM", "SPX", "NDX"]);

/** @type {Record<string, { sector: string, style?: 'appears' }>} */
const NAMED_PROFILES = {
  TSLA: {
    sector: "broader high-beta growth sentiment",
  },
  NVDA: {
    sector: "broader AI and semiconductor sentiment",
    weak:
      "with no single company-specific headline clearly driving the move",
  },
  AAPL: {
    sector: "mega-cap technology sentiment",
    style: "appears",
    weak: "rather than a stock-specific catalyst",
  },
  MSFT: { sector: "mega-cap software and cloud sentiment" },
  GOOGL: { sector: "mega-cap technology and advertising sentiment" },
  GOOG: { sector: "mega-cap technology and advertising sentiment" },
  AMZN: { sector: "consumer and cloud mega-cap sentiment" },
  META: { sector: "mega-cap communication services sentiment" },
  AMD: { sector: "semiconductor and AI hardware sentiment" },
  GLD: { sector: "gold and real-yield sentiment", weak: "rather than a single headline" },
  USO: { sector: "crude and energy complex sentiment" },
  UUP: { sector: "dollar and rate-differential sentiment" },
  USD: { sector: "dollar and rate-differential sentiment" },
  SPY: { sector: "broad U.S. equity sentiment" },
  QQQ: { sector: "growth and mega-cap technology sentiment" },
};

/**
 * @param {string} symbol
 */
function inferSectorPhrase(symbol) {
  const s = String(symbol || "").toUpperCase();
  if (NAMED_PROFILES[s]) return NAMED_PROFILES[s].sector;
  if (SEMIS.has(s)) return "semiconductor and AI hardware sentiment";
  if (MEGA_TECH.has(s)) return "mega-cap technology sentiment";
  if (HIGH_BETA_GROWTH.has(s)) return "high-beta growth sentiment";
  if (FINANCIALS.has(s)) return "financials and rate-sensitive bank sentiment";
  if (ENERGY.has(s)) return "energy and commodity sentiment";
  if (PRECIOUS.has(s)) return "gold and safe-haven sentiment";
  if (DOLLAR.has(s)) return "dollar and FX sentiment";
  if (INDICES.has(s)) return "broad equity index sentiment";
  return "broader market sentiment";
}

/**
 * @param {string} symbol
 */
export function getTickerDeskProfile(symbol) {
  const s = String(symbol || "").toUpperCase();
  return (
    NAMED_PROFILES[s] || {
      sector: inferSectorPhrase(s),
    }
  );
}

/**
 * @param {string} headline
 * @param {string} symbol
 * @param {string} displayName
 */
export function isSymbolSpecificHeadline(headline, symbol, displayName) {
  const h = String(headline || "").trim();
  if (!h || h.length < 12) return false;
  if (GENERIC_TICKER_PHRASE_RE.test(h)) return false;
  const sym = String(symbol || "").toUpperCase();
  const name = String(displayName || "").trim();
  const upper = h.toUpperCase();
  if (sym && upper.includes(sym)) return true;
  if (name.length > 2 && h.toLowerCase().includes(name.toLowerCase())) return true;
  const companyHints = {
    NVDA: /nvidia|nvda/i,
    TSLA: /tesla|tsla|musk|cybertruck|ev\b/i,
    AAPL: /apple|aapl|iphone|tim cook/i,
    MSFT: /microsoft|msft|azure|openai partner/i,
    META: /meta|facebook|zuckerberg|instagram|whatsapp/i,
    AMZN: /amazon|amzn|aws|bezos/i,
    GOOGL: /google|alphabet|googl|gemini/i,
    GOOG: /google|alphabet|goog|gemini/i,
  };
  const re = companyHints[sym];
  return re ? re.test(h) : false;
}

/**
 * @param {string} headline
 */
function shortenHeadline(headline) {
  const h = String(headline || "").replace(/\s+/g, " ").trim();
  if (h.length <= 110) return h;
  const cut = h.slice(0, 107);
  const sp = cut.lastIndexOf(" ");
  return `${(sp > 60 ? cut.slice(0, sp) : cut).trim()}…`;
}

/**
 * @param {{ symbol: string, displayName?: string, quote?: { pctChange?: number }|null, headline?: string|null }} input
 * @returns {string}
 */
export function buildTickerDeskAnswer(input) {
  const symbol = String(input.symbol || "").toUpperCase();
  const name = input.displayName || getTickerDisplayName(symbol) || symbol;
  const headline = input.headline?.trim() || "";

  return applyTickerVoiceVariation({
    symbol,
    displayName: name,
    quote: input.quote ?? null,
    headline: headline ? shortenHeadline(headline) : "",
    text: input.text ?? null,
  });
}

/**
 * @param {import('../types.js').LogicResponse} res
 */
export function stripGenericTickerPhrases(text) {
  let s = String(text || "");
  if (!s) return "";
  s = s.replace(GENERIC_TICKER_PHRASE_RE, " ");
  return s.replace(/\s+/g, " ").trim();
}

/**
 * @param {object} ctx
 * @param {string} symbol
 * @param {string} displayName
 * @param {{ pctChange?: number }|null} [quote]
 * @param {string} [headline]
 */
export function buildTickerDeskLogicResponse(ctx, symbol, displayName, quote, headline) {
  const direct = buildTickerDeskAnswer({
    symbol,
    displayName,
    quote,
    headline,
  });

  const sectorLine = getTickerDeskProfile(symbol).sector;
  const catalystLine = isSymbolSpecificHeadline(headline, symbol, displayName)
    ? shortenHeadline(headline)
    : "Macro and sector tone — not a dominant name-specific headline.";

  return buildLogicResponse({
    title: displayName,
    directAnswer: direct,
    summary: direct,
    cards: {
      snapshot: direct,
      catalyst: catalystLine,
      macroContext: /rates|dollar|gold|oil|energy/i.test(sectorLine)
        ? sectorLine.charAt(0).toUpperCase() + sectorLine.slice(1)
        : "Rates and risk appetite remain part of the backdrop.",
      sectorImpact: sectorLine.charAt(0).toUpperCase() + sectorLine.slice(1),
      volatility:
        quote && Math.abs(quote.pctChange) > 2
          ? "Larger-than-usual session move"
          : "Typical session volatility",
      aiSummary: direct,
    },
    keyDrivers: [
      catalystLine.slice(0, 90),
      sectorLine.slice(0, 90),
    ],
    signals: quote
      ? [`${symbol} ${quote.pctChange >= 0 ? "+" : ""}${quote.pctChange.toFixed(2)}%`]
      : [`${symbol} · desk read`],
    confidence: quote ? 58 : 48,
    sources: ctx.fusion ? ["Brieftick Logic"] : ["Brieftick Logic · desk"],
    disclaimer: LOGIC_DISCLAIMER,
    mode: "ticker",
    primarySymbol: symbol,
    dataLimited: true,
    mockData: !quote,
  });
}
