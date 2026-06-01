/**
 * Ticker metadata and sector templates for Deep Dive intelligence (Phase A).
 * @module preview/ticker-deep-dive/ticker-meta
 */

import { SYMBOL_PROFILE } from "../../logic/portfolioProfile.js";
import { getTickerDisplayName } from "../../logic/engines/tickerCatalog.js";

/** @typedef {'semis'|'software'|'ev'|'financials'|'energy'|'healthcare'|'industrials'|'general'} SectorTemplateKey */

/** @typedef {{ sym: string, displayName: string, sectorLabel: string, sectorTemplate: SectorTemplateKey, themes: string[], sectorEtf: string }} TickerMeta */

const SEMIS = new Set([
  "NVDA", "AMD", "INTC", "AVGO", "MU", "ASML", "TSM", "ARM", "SMCI", "SOX", "SMH", "SNDK",
]);
const MEGA_TECH = new Set([
  "AAPL", "MSFT", "GOOGL", "GOOG", "AMZN", "META", "NFLX", "ORCL", "CRM", "ADBE",
]);
const EV = new Set(["TSLA", "RIVN", "LCID", "F", "GM", "NIO"]);
const FINANCIALS = new Set(["JPM", "GS", "BAC", "C", "WFC", "MS", "XLF"]);
const ENERGY = new Set(["XOM", "CVX", "COP", "SLB", "EOG", "USO", "UNG", "XLE"]);
const HEALTHCARE = new Set(["JNJ", "LLY", "UNH", "PFE", "MRK", "ABBV", "XLV"]);
const INDUSTRIALS = new Set(["CAT", "DE", "BA", "UPS", "GE", "HON", "XLI"]);
const INDICES = new Set(["SPY", "QQQ", "DIA", "IWM", "SPX", "NDX"]);

/** Sector ETF used for performance context. */
export const SECTOR_ETF_BY_TEMPLATE = {
  semis: "XLK",
  software: "XLK",
  ev: "XLY",
  financials: "XLF",
  energy: "XLE",
  healthcare: "XLV",
  industrials: "XLI",
  general: "SPY",
};

const SECTOR_LABEL = {
  semis: "Semiconductors",
  software: "Software & technology",
  ev: "Electric vehicles & autos",
  financials: "Financials",
  energy: "Energy",
  healthcare: "Healthcare",
  industrials: "Industrials",
  general: "Broad equity",
};

/**
 * @param {string} sym
 * @returns {SectorTemplateKey}
 */
export function inferSectorTemplate(sym) {
  const s = String(sym || "").toUpperCase();
  if (SEMIS.has(s)) return "semis";
  if (EV.has(s)) return "ev";
  if (FINANCIALS.has(s)) return "financials";
  if (ENERGY.has(s)) return "energy";
  if (HEALTHCARE.has(s)) return "healthcare";
  if (INDUSTRIALS.has(s)) return "industrials";
  if (MEGA_TECH.has(s)) return "software";
  if (INDICES.has(s)) return "general";

  const profile = SYMBOL_PROFILE[s];
  if (profile) {
    const sec = profile.sector;
    if (/semiconductor/i.test(sec)) return "semis";
    if (/financial/i.test(sec)) return "financials";
    if (/energy/i.test(sec)) return "energy";
    if (/health/i.test(sec)) return "healthcare";
    if (/staple|utility/i.test(sec)) return "general";
    if (/discretionary/i.test(sec) && /TSLA|auto/i.test(s + profile.themes.join(" ")))
      return "ev";
    if (/technology/i.test(sec)) return "software";
    if (/material|industrial/i.test(sec)) return "industrials";
  }
  return "general";
}

/**
 * @param {string} sym
 * @returns {TickerMeta}
 */
export function getTickerMeta(sym) {
  const key = String(sym || "").toUpperCase();
  const sectorTemplate = inferSectorTemplate(key);
  const profile = SYMBOL_PROFILE[key];
  return {
    sym: key,
    displayName: getTickerDisplayName(key),
    sectorLabel: profile?.sector || SECTOR_LABEL[sectorTemplate],
    sectorTemplate,
    themes: profile?.themes || ["Single stock"],
    sectorEtf: SECTOR_ETF_BY_TEMPLATE[sectorTemplate],
  };
}
