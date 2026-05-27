/**
 * Inferred portfolio from watchlist when no explicit weighted book is saved.
 * @module logic/engines/inferredPortfolioContext
 */

import { loadSavedPortfolio } from "../portfolioParser.js";
import { buildPortfolioProfile } from "../portfolioProfile.js";
import { getPortfolioHoldings } from "../shared.js";
import { getLogicWatchlist } from "../watchlistStore.js";
import { logicDebug } from "../shared.js";

/** @typedef {'explicit'|'inferred_watchlist'|'sample'} PortfolioContextSource */

/**
 * @typedef {Object} ResolvedPortfolioContext
 * @property {import('../portfolioProfile.js').ParsedHolding[]} holdings
 * @property {import('../portfolioProfile.js').PortfolioProfile} profile
 * @property {PortfolioContextSource} source
 * @property {boolean} isInferred
 * @property {string} contextLabel
 * @property {string} hint
 * @property {string[]} inferenceNotes
 */

const SAMPLE_HOLDINGS = [
  { symbol: "NVDA", weight: 18 },
  { symbol: "AAPL", weight: 12 },
  { symbol: "MSFT", weight: 10 },
];

/**
 * User saved weights or portfolio tab paste — overrides watchlist inference.
 */
export function hasExplicitPortfolio() {
  const saved = loadSavedPortfolio();
  if (saved?.holdings?.length) {
    const total = saved.holdings.reduce((s, h) => s + (h.weight || 0), 0);
    if (total > 0) return true;
  }
  const dom = getPortfolioHoldings();
  if (dom.length && dom.some((h) => (h.weight || 0) > 0)) return true;
  return false;
}

/**
 * @param {string[]} symbols
 * @returns {import('../portfolioProfile.js').ParsedHolding[]}
 */
export function buildEqualWeightHoldings(symbols) {
  const list = [...new Set(symbols.map((s) => String(s).toUpperCase()).filter(Boolean))];
  const n = list.length;
  if (!n) return [];

  let weight = Math.round((100 / n) * 10) / 10;
  const holdings = list.map((symbol) => ({ symbol, weight }));
  const sum = holdings.reduce((s, h) => s + h.weight, 0);
  const drift = Math.round((100 - sum) * 10) / 10;
  if (holdings.length && Math.abs(drift) >= 0.1) {
    holdings[0].weight = Math.round((holdings[0].weight + drift) * 10) / 10;
  }
  return holdings;
}

/**
 * Soft concentration nudge for clustered AI / semiconductor watchlists.
 * @param {import('../portfolioProfile.js').ParsedHolding[]} holdings
 */
export function applySoftConcentrationInference(holdings) {
  const AI_SYMS = new Set([
    "NVDA",
    "AMD",
    "AVGO",
    "TSM",
    "ASML",
    "MU",
    "ARM",
    "SMCI",
    "MSFT",
    "META",
    "GOOGL",
    "GOOG",
  ]);
  const aiLines = holdings.filter((h) => AI_SYMS.has(h.symbol));
  if (aiLines.length < 3 || aiLines.length / holdings.length < 0.45) {
    return holdings;
  }

  const boosted = holdings.map((h) => ({
    ...h,
    weight: AI_SYMS.has(h.symbol) ? h.weight * 1.12 : h.weight * 0.92,
  }));
  const total = boosted.reduce((s, h) => s + h.weight, 0);
  return boosted.map((h) => ({
    symbol: h.symbol,
    weight: Math.round((h.weight / total) * 1000) / 10,
  }));
}

/**
 * @param {import('../portfolioProfile.js').PortfolioProfile} profile
 * @param {string[]} symbols
 */
function buildInferenceNotes(profile, symbols) {
  /** @type {string[]} */
  const notes = [];
  if (profile.aiWeight >= 35) {
    notes.push("AI infrastructure concentration inferred from watchlist clustering.");
  }
  if ((profile.sectorWeights?.Semiconductors || 0) >= 25) {
    notes.push("Semiconductor sector overlap is a dominant sleeve.");
  }
  if (profile.megaCapWeight >= 40) {
    notes.push("Crowded mega-cap leadership exposure via large-cap tech names.");
  }
  if (profile.sensitivity?.rates !== "low") {
    notes.push("Duration-sensitive growth beta is elevated versus a balanced book.");
  }
  if (profile.sensitivity?.liquidity !== "low beta") {
    notes.push("Liquidity regime shifts may matter more than headline index calm.");
  }
  if (!notes.length) {
    notes.push(
      `Equal-weight proxy across ${symbols.length} watchlist names — factor mix: ${profile.growthDefensiveTilt}.`
    );
  }
  return notes;
}

/**
 * @param {import('../portfolioProfile.js').PortfolioProfile} profile
 * @param {PortfolioContextSource} source
 */
function explicitHint(profile, source) {
  if (source !== "explicit") return "";
  return `Portfolio: ${profile.positionCount} positions; top ${profile.topSymbols.join(", ")} (${profile.topThreeWeight.toFixed(0)}% top-3). AI ~${profile.aiWeight}% · rates ${profile.sensitivity.rates} · ${profile.growthDefensiveTilt}.`;
}

/**
 * @returns {ResolvedPortfolioContext}
 */
export function resolvePortfolioContext() {
  if (hasExplicitPortfolio()) {
    const saved = loadSavedPortfolio();
    const dom = getPortfolioHoldings();
    const holdings =
      dom.length && dom.some((h) => h.weight > 0)
        ? dom
        : saved?.holdings || [];
    const profile = buildPortfolioProfile(holdings);
    const ctx = {
      holdings,
      profile: {
        ...profile,
        portfolioSource: "explicit",
        hasExplicitWeights: true,
        isInferredFromWatchlist: false,
      },
      source: "explicit",
      isInferred: false,
      contextLabel: "Saved portfolio",
      hint: explicitHint(profile, "explicit"),
      inferenceNotes: [],
    };
    logicDebug("resolvePortfolioContext", { source: "explicit", n: holdings.length });
    return ctx;
  }

  const symbols = getLogicWatchlist();
  if (symbols.length) {
    let holdings = buildEqualWeightHoldings(symbols);
    holdings = applySoftConcentrationInference(holdings);
    const profile = buildPortfolioProfile(holdings);
    const inferenceNotes = buildInferenceNotes(profile, symbols);
    const hint = [
      `Watchlist-derived portfolio interpretation active — equal-weight proxy across ${symbols.length} names.`,
      `Top weights: ${profile.topSymbols.slice(0, 3).join(", ")}.`,
      `AI ~${profile.aiWeight}% · ${profile.growthDefensiveTilt} · rates sensitivity ${profile.sensitivity.rates}.`,
      inferenceNotes[0] || "",
    ]
      .filter(Boolean)
      .join(" ");

    const ctx = {
      holdings,
      profile: {
        ...profile,
        portfolioSource: "inferred_watchlist",
        hasExplicitWeights: false,
        isInferredFromWatchlist: true,
      },
      source: "inferred_watchlist",
      isInferred: true,
      contextLabel: "Watchlist-derived exposure",
      hint,
      inferenceNotes,
    };
    logicDebug("resolvePortfolioContext", {
      source: "inferred_watchlist",
      n: symbols.length,
      aiWeight: profile.aiWeight,
    });
    return ctx;
  }

  const holdings = SAMPLE_HOLDINGS;
  const profile = buildPortfolioProfile(holdings);
  return {
    holdings,
    profile: {
      ...profile,
      portfolioSource: "sample",
      hasExplicitWeights: false,
      isInferredFromWatchlist: false,
    },
    source: "sample",
    isInferred: false,
    contextLabel: "Illustrative sample book",
    hint: "No saved portfolio or watchlist — paste holdings or add watchlist tickers for personalized reads.",
    inferenceNotes: [],
  };
}
