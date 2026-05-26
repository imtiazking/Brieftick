/**
 * Portfolio intelligence engine — personalized concentration, macro sensitivity, risks.
 * @module logic/engines/portfolioIntelligenceEngine
 */

import { logicDebug } from "../shared.js";
import { concise } from "./topicContext.js";
import { buildPortfolioProfile } from "../portfolioProfile.js";
import { loadSavedPortfolio } from "../portfolioParser.js";
import { inferWatchlistExposure } from "../watchlistStore.js";

/**
 * @typedef {Object} PortfolioExposure
 * @property {string} theme
 * @property {string} level
 * @property {string} note
 */

/**
 * @typedef {Object} PortfolioIntelligenceInsight
 * @property {string} headline
 * @property {PortfolioExposure[]} exposures
 * @property {string[]} warnings
 * @property {string[]} personalizedNotes
 * @property {import('../portfolioProfile.js').PortfolioProfile} [profile]
 * @property {boolean} simulated
 * @property {number} relevance
 */

/**
 * @param {object} ctx
 * @param {object} [marketIntelligence]
 * @returns {PortfolioIntelligenceInsight}
 */
export function analyzePortfolioIntelligence(ctx, marketIntelligence) {
  const prompt = (ctx.prompt || "").toLowerCase();
  const saved = loadSavedPortfolio();
  const memoryHoldings = ctx.portfolioMemory?.holdings;
  const holdings =
    memoryHoldings?.length ? memoryHoldings : saved?.holdings?.length ? saved.holdings : [];

  const profile =
    ctx.portfolioProfile ||
    saved?.profile ||
    buildPortfolioProfile(
      holdings.length
        ? holdings
        : [
            { symbol: "NVDA", weight: 18 },
            { symbol: "AAPL", weight: 12 },
            { symbol: "MSFT", weight: 10 },
          ]
    );

  const simulated = !saved?.holdings?.length && !memoryHoldings?.length;
  const mi = marketIntelligence || ctx.marketIntelligence;
  const watchlist = ctx.watchlistExposure || inferWatchlistExposure();

  /** @type {PortfolioExposure[]} */
  const exposures = [];
  /** @type {string[]} */
  const warnings = [];
  /** @type {string[]} */
  const personalizedNotes = [];

  if (profile.aiWeight >= 25) {
    exposures.push({
      theme: "AI concentration",
      level: profile.sensitivity.earnings,
      note:
        profile.aiWeight >= 35
          ? "Portfolio remains highly concentrated in AI infrastructure."
          : "AI-linked exposure is a meaningful share of portfolio beta.",
    });
  }

  if (profile.sensitivity.rates !== "low") {
    exposures.push({
      theme: "Rates sensitivity",
      level: profile.sensitivity.rates,
      note: "Current holdings are increasingly sensitive to real yields and financial conditions.",
    });
  }

  if (profile.topThreeWeight >= 40) {
    warnings.push("Mega-cap concentration risk remains elevated.");
    personalizedNotes.push(
      `Top-three weights (${profile.topSymbols.join(", ")}) near ${profile.topThreeWeight.toFixed(0)}%.`
    );
  }

  if (profile.sensitivity.volatility !== "low") {
    exposures.push({
      theme: "Volatility sensitivity",
      level: profile.sensitivity.volatility,
      note: "High-beta sleeves may gap on vol resets despite calm indices.",
    });
  }

  if (profile.sensitivity.liquidity === "low beta" || profile.cashWeight >= 15) {
    exposures.push({
      theme: "Liquidity buffer",
      level: "moderate",
      note: "Liquidity conditions remain critical for your current exposure profile.",
    });
  } else {
    exposures.push({
      theme: "Liquidity sensitivity",
      level: profile.sensitivity.liquidity,
      note: "Liquidity regime shifts could hit growth-heavy books before headlines catch up.",
    });
  }

  if (profile.sensitivity.geopolitical !== "low") {
    exposures.push({
      theme: "Geopolitical exposure",
      level: profile.sensitivity.geopolitical,
      note: "Energy and defense channels may matter more than index calm suggests.",
    });
  }

  exposures.push({
    theme: "Earnings dependence",
    level: profile.sensitivity.earnings,
    note: `${profile.growthDefensiveTilt} — earnings revisions remain the marginal risk for this book.`,
  });

  if (mi?.positioning?.themes?.some((t) => /AI|mega-cap/i.test(t))) {
    warnings.push("Portfolio may be vulnerable to growth-scare rotations.");
  }

  if (/recession|hard landing|slowdown/i.test(prompt)) {
    warnings.push("Recession-risk pricing would stress cyclical and high-beta weights first.");
  }

  if (/what would hurt|hurt.*most|biggest risk/i.test(prompt)) {
    personalizedNotes.push(
      profile.aiWeight >= 30
        ? "Fastest pain path: AI capex disappointment + higher real yields."
        : "Fastest pain path: rates shock + vol expansion on concentrated weights."
    );
  }

  if (/how exposed.*rates|rates exposure/i.test(prompt)) {
    personalizedNotes.push(`Rates sensitivity: ${profile.sensitivity.rates} (${profile.growthDefensiveTilt}).`);
  }

  if (/ai concentration|concentrated.*ai/i.test(prompt)) {
    personalizedNotes.push(`AI-weighted exposure ~${profile.aiWeight}% of equity sleeve.`);
  }

  if (watchlist.symbols?.length && !simulated) {
    personalizedNotes.push(watchlist.summary);
  }

  let relevance = 0.4;
  if (/portfolio|holdings|my book|exposure|concentration|rates|ai |vulnerable|risk/i.test(prompt)) {
    relevance = 0.9;
  }
  if (ctx.mode === "portfolio") relevance = 0.95;

  const headline = concise(
    warnings[0] ||
      personalizedNotes[0] ||
      exposures[0]?.note ||
      "Portfolio macro channels align with index leadership — monitor breadth and rates.",
    240
  );

  logicDebug("portfolioIntelligenceEngine", {
    simulated,
    aiWeight: profile.aiWeight,
    relevance,
  });

  return {
    headline,
    exposures: exposures.slice(0, 6),
    warnings,
    personalizedNotes,
    profile,
    simulated,
    relevance: Math.min(1, relevance),
  };
}

/** @param {import('../portfolioParser.js').ParsedHolding[]} holdings */
export function ingestPortfolioHoldings(holdings) {
  logicDebug("portfolioIntelligenceEngine.ingest", holdings?.length || 0);
  return {
    ok: true,
    profile: buildPortfolioProfile(holdings || []),
  };
}

/**
 * @param {string[]} symbols
 */
export function ingestWatchlistThemes(symbols) {
  return inferWatchlistExposure(symbols);
}
