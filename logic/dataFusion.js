/**
 * Data fusion — merges multi-source raw data into structured intelligence.
 * @module logic/dataFusion
 */

import { logicDebug } from "./shared.js";
import { formatSourceAttribution } from "./sourceRouter.js";
import { multiSourceFetch } from "./multiSourceFetch.js";

/**
 * @typedef {Object} FusedQuote
 * @property {string} symbol
 * @property {number|null} price
 * @property {number|null} pctChange
 * @property {string[]} providers
 * @property {boolean} agreement
 * @property {boolean} [stale]
 */

/**
 * @typedef {Object} FusionBundle
 * @property {Record<string, FusedQuote>} quotes
 * @property {{ headlines: object[], live: boolean, delayed: boolean }} news
 * @property {{ score: number, label: string }} sentiment
 * @property {{ vixLabel: string, regime: string }} volatility
 * @property {{ sym: string, label: string, pct: number|null }[]} sectorMoves
 * @property {{ holdings: object[], topWeight: number }} portfolio
 * @property {string[]} failedSources
 * @property {boolean} live
 * @property {number} sourceAgreement
 * @property {number} liveSourceCount
 * @property {boolean} hasQuote
 * @property {boolean} hasNews
 * @property {boolean} [hasStaleQuote]
 * @property {string[]} providers
 * @property {object[]} relatedHeadlines
 * @property {string} [fusionSummary]
 */

const STALE_MS = 5 * 60 * 1000;

function pctClose(a, b) {
  if (a == null || b == null) return false;
  return Math.abs(a - b) <= 1.25;
}

/**
 * @param {import('./multiSourceFetch.js').RawSourceBundle} raw
 * @returns {Record<string, FusedQuote>}
 */
function fuseQuotes(raw) {
  const out = /** @type {Record<string, FusedQuote>} */ ({});
  for (const [symbol, entry] of Object.entries(raw.quotes || {})) {
    const attempts = entry.attempts || [];
    if (!attempts.length) continue;
    const primary = attempts[0];
    const secondary = attempts[1];
    const agreement = attempts.length >= 2 && pctClose(primary.pctChange, secondary.pctChange);
    const stale = attempts.every(
      (a) => a.fetchedAt && Date.now() - a.fetchedAt > STALE_MS
    );
    out[symbol] = {
      symbol,
      price: primary.price ?? null,
      pctChange: primary.pctChange ?? null,
      providers: attempts.map((a) => a.provider),
      agreement,
      stale,
    };
  }
  return out;
}

/**
 * @param {import('./multiSourceFetch.js').RawSourceBundle} raw
 * @param {{ prompt: string, mode: string, primaryEntity: import('./entityResolver.js').ResolvedEntity }} ctx
 * @returns {FusionBundle}
 */
export function fuseMarketData(raw, ctx) {
  const quotes = fuseQuotes(raw);
  const newsPack = raw.news || { headlines: [], live: false };
  const agreementScores = Object.values(quotes).filter((q) => q.agreement);
  const sourceAgreement =
    Object.keys(quotes).length === 0
      ? newsPack.live
        ? 0.55
        : 0.35
      : agreementScores.length / Math.max(1, Object.keys(quotes).length);

  const hasStaleQuote = Object.values(quotes).some((q) => q.stale);
  const liveSourceCount = (newsPack.live ? 1 : 0) + Object.keys(quotes).length;

  const fusionSummary = [
    raw.sentiment?.label,
    raw.volatility?.regime ? `Regime: ${raw.volatility.regime}` : null,
    Object.keys(quotes).length ? `${Object.keys(quotes).length} quote channel(s)` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const bundle = {
    quotes,
    news: newsPack,
    sentiment: raw.sentiment || { score: 0, label: "Mixed sentiment" },
    volatility: raw.volatility || { vixLabel: "Monitored", regime: "Mixed" },
    sectorMoves: raw.sectorMoves || [],
    portfolio: raw.portfolio || { holdings: [], topWeight: 0 },
    failedSources: raw.failedSources || [],
    live: newsPack.live || Object.keys(quotes).length > 0,
    sourceAgreement,
    liveSourceCount,
    hasQuote: Object.keys(quotes).length > 0,
    hasNews: (newsPack.headlines || []).length > 0,
    hasStaleQuote,
    providers: raw.providers || [],
    relatedHeadlines: raw.relatedHeadlines || [],
    fusionSummary,
  };

  logicDebug("dataFusion complete", {
    agreement: sourceAgreement,
    fusionSummary,
    mode: ctx.mode,
  });

  return bundle;
}

/**
 * Full fetch + fuse (pipeline convenience).
 * @param {import('./sourceRouter.js').SourceRoute} sourceRoute
 * @param {object} ctx
 */
export async function fetchAndFuse(sourceRoute, ctx) {
  const raw = await multiSourceFetch(sourceRoute, ctx);
  return fuseMarketData(raw, ctx);
}

/** @deprecated use fetchAndFuse */
export const fetchFusedData = fetchAndFuse;

/**
 * @param {FusionBundle} fusion
 * @param {string} symbol
 */
export function getFusedQuote(fusion, symbol) {
  return fusion.quotes[symbol] || null;
}

/**
 * @param {FusionBundle} fusion
 */
export function fusionAttributionSources(fusion) {
  return formatSourceAttribution(fusion.providers || [], fusion.failedSources);
}
