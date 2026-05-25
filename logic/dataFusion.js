/**
 * Multi-source market data fusion — fetch, cross-check, validate relevance.
 * @module logic/dataFusion
 */

import { resolveSymbolForPrompt, getHeadlines, getQuote, logicDebug } from "./shared.js";
import { formatSourceAttribution } from "./sourceRouter.js";

/**
 * @typedef {Object} FusedQuote
 * @property {string} symbol
 * @property {number|null} price
 * @property {number|null} pctChange
 * @property {string[]} providers
 * @property {boolean} agreement
 */

/**
 * @typedef {Object} FusionBundle
 * @property {Record<string, FusedQuote>} quotes
 * @property {{ headlines: object[], live: boolean, delayed: boolean }} news
 * @property {string[]} failedSources
 * @property {boolean} live
 * @property {number} sourceAgreement
 * @property {number} liveSourceCount
 * @property {boolean} hasQuote
 * @property {boolean} hasNews
 * @property {string[]} providers
 * @property {object[]} relatedHeadlines
 */

function pctClose(a, b) {
  if (a == null || b == null) return false;
  return Math.abs(a - b) <= 1.25;
}

/**
 * @param {import('./sourceRouter.js').SourceRoute} sourceRoute
 * @param {{ prompt: string, mode: string, primaryEntity: import('./entityResolver.js').ResolvedEntity, entities?: import('./entityResolver.js').ResolvedEntity[] }} ctx
 * @returns {Promise<FusionBundle>}
 */
export async function fetchFusedData(sourceRoute, ctx) {
  const failedSources = [];
  const quotes = /** @type {Record<string, FusedQuote>} */ ({});
  const providers = new Set(sourceRoute.providers || []);

  const symbols = new Set();
  const sym = resolveSymbolForPrompt(ctx.prompt, ctx.primaryEntity);
  if (sym) symbols.add(sym);
  if (ctx.mode === "market-pulse" || ctx.mode === "daily-brief") {
    symbols.add("SPY");
    symbols.add("QQQ");
  }

  const needsQuote = sourceRoute.intents.includes("quote");
  const needsNews =
    sourceRoute.intents.includes("news") ||
    sourceRoute.intents.includes("macro") ||
    sourceRoute.intents.includes("risk");

  logicDebug("API request started", {
    symbols: [...symbols],
    intents: sourceRoute.intents,
  });

  const newsPack = needsNews
    ? await getHeadlines(10)
    : { headlines: [], live: false, delayed: false, failedSources: [] };
  failedSources.push(...(newsPack.failedSources || []));

  if (needsQuote) {
    await Promise.all(
      [...symbols].slice(0, 6).map(async (symbol) => {
        const attempts = [];
        const { quote: q1, failedSources: f1 } = await getQuote(symbol);
        failedSources.push(...f1);
        if (q1) attempts.push({ provider: "finnhub", pct: q1.pctChange, price: q1.price });

        const api = window.BriefTickAPI;
        if (api?.keys?.twelvedata && typeof api.getQuotes === "function") {
          try {
            const batch = await api.getQuotes([symbol]);
            const q2 = batch?.[symbol];
            if (q2?.pctChange != null) {
              attempts.push({ provider: "twelvedata", pct: q2.pctChange, price: q2.price });
              providers.add("twelvedata");
            }
          } catch (e) {
            failedSources.push(`twelvedata:${symbol}:${e.message || "error"}`);
          }
        }

        const primary = attempts[0];
        const secondary = attempts[1];
        const agreement =
          attempts.length >= 2 && pctClose(primary?.pct, secondary?.pct);
        if (primary) {
          quotes[symbol] = {
            symbol,
            price: primary.price ?? null,
            pctChange: primary.pct ?? null,
            providers: attempts.map((a) => a.provider),
            agreement,
          };
          if (agreement) providers.add("twelvedata");
        }
      })
    );
  }

  const symUpper = (sym || "").toUpperCase();
  const nameLower = (ctx.primaryEntity?.companyName || "").toLowerCase();
  const relatedHeadlines = (newsPack.headlines || []).filter((n) => {
    const h = `${n.headline || ""} ${n.summary || ""}`.toUpperCase();
    if (!symUpper && !nameLower) return true;
    return h.includes(symUpper) || (nameLower && h.includes(nameLower.toUpperCase()));
  });

  const liveSourceCount =
    (newsPack.live ? 1 : 0) + Object.keys(quotes).length;
  const agreementScores = Object.values(quotes).filter((q) => q.agreement);
  const sourceAgreement =
    Object.keys(quotes).length === 0
      ? newsPack.live
        ? 0.55
        : 0.35
      : agreementScores.length / Math.max(1, Object.keys(quotes).length);

  const bundle = {
    quotes,
    news: newsPack,
    failedSources,
    live: newsPack.live || Object.keys(quotes).length > 0,
    sourceAgreement,
    liveSourceCount,
    hasQuote: Object.keys(quotes).length > 0,
    hasNews: (newsPack.headlines || []).length > 0,
    providers: [...providers],
    relatedHeadlines,
  };

  logicDebug("API response received", {
    live: bundle.live,
    quotes: Object.keys(quotes),
    newsCount: newsPack.headlines?.length || 0,
    agreement: sourceAgreement,
    relatedNews: relatedHeadlines.length,
  });

  return bundle;
}

/**
 * @param {FusionBundle} fusion
 * @param {string} symbol
 */
export function getFusedQuote(fusion, symbol) {
  return fusion.quotes[symbol] || null;
}

/**
 * @param {FusionBundle} fusion
 * @param {import('./types.js').LogicMode} mode
 */
export function fusionAttributionSources(fusion, mode) {
  return formatSourceAttribution(fusion.providers || [], fusion.failedSources);
}
