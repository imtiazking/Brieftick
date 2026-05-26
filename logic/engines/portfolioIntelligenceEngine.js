/**
 * Portfolio intelligence engine — hooks for holdings-aware reasoning (simulated when empty).
 * @module logic/engines/portfolioIntelligenceEngine
 */

import { logicDebug } from "../shared.js";
import { concise } from "./topicContext.js";

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
 * @property {boolean} simulated
 * @property {number} relevance
 */

const AI_SYMBOLS = /^(NVDA|AMD|MSFT|GOOGL|GOOG|META|AVGO|SMCI|ARM|TSM)/i;
const RATE_SENSITIVE = /^(XLF|JPM|BAC|HD|LOW|DHI|LEN|IWM|QQQ)/i;
const DEFENSIVE = /^(KO|PG|JNJ|WMT|COST|XLP|XLU)/i;

/**
 * @param {object} ctx
 * @param {object} [marketIntelligence]
 * @returns {PortfolioIntelligenceInsight}
 */
export function analyzePortfolioIntelligence(ctx, marketIntelligence) {
  const prompt = (ctx.prompt || "").toLowerCase();
  const portfolio = ctx.portfolioMemory || {
    holdings: [
      { symbol: "NVDA", weight: 18 },
      { symbol: "AAPL", weight: 12 },
      { symbol: "MSFT", weight: 10 },
    ],
    concentrationLabel: "High concentration",
    hint: "Sample growth-tilted book for contextual exposure read.",
    positionCount: 3,
    topThreeWeight: 40,
    topSymbols: ["NVDA", "AAPL", "MSFT"],
  };
  const holdings = portfolio.holdings || [];
  const simulated = !ctx.portfolioMemory?.holdings?.length || portfolio.hint?.includes("sample");
  const mi = marketIntelligence || ctx.marketIntelligence;

  /** @type {PortfolioExposure[]} */
  const exposures = [];
  /** @type {string[]} */
  const warnings = [];

  let aiWeight = 0;
  let rateWeight = 0;
  let defensiveWeight = 0;

  for (const h of holdings) {
    const sym = String(h.symbol || "").toUpperCase();
    const w = h.weight || 0;
    if (AI_SYMBOLS.test(sym)) aiWeight += w;
    if (RATE_SENSITIVE.test(sym)) rateWeight += w;
    if (DEFENSIVE.test(sym)) defensiveWeight += w;
  }

  if (simulated) {
    aiWeight = 38;
    rateWeight = 22;
  }

  if (aiWeight >= 25 || /\bai\b|portfolio|holdings|concentration/i.test(prompt)) {
    exposures.push({
      theme: "AI concentration",
      level: aiWeight >= 35 ? "elevated" : "moderate",
      note: "Your portfolio appears increasingly dependent on AI capex resilience.",
    });
  }

  if (rateWeight >= 20 || /rates|yields|duration/i.test(prompt)) {
    exposures.push({
      theme: "Rate sensitivity",
      level: rateWeight >= 30 ? "elevated" : "moderate",
      note: "Duration and financial conditions remain a primary beta channel for the book.",
    });
  }

  if (ctx.regime?.primary === "geopolitical_stress" || /iran|war|oil/i.test(prompt)) {
    exposures.push({
      theme: "Geopolitical exposure",
      level: "moderate",
      note: "Energy and defense channels may matter more than index calm suggests.",
    });
  }

  if (mi?.stress?.primary === "liquidity_fragility" || /liquidity/i.test(prompt)) {
    exposures.push({
      theme: "Liquidity sensitivity",
      level: "elevated",
      note: "Liquidity regime shifts could hit high-beta sleeves before macro headlines catch up.",
    });
  }

  if (mi?.stress?.primary === "vol_compression_risk" || mi?.divergence?.divergences?.length) {
    exposures.push({
      theme: "Volatility vulnerability",
      level: "moderate",
      note: "Compressed vol beneath macro uncertainty raises gap-risk for concentrated books.",
    });
  }

  exposures.push({
    theme: "Earnings dependence",
    level: aiWeight >= 30 ? "elevated" : "moderate",
    note: "Mega-cap earnings revisions remain the marginal driver for growth-tilted portfolios.",
  });

  if (portfolio.concentrationLabel?.includes("High")) {
    warnings.push("Portfolio concentration risk remains elevated.");
  }
  if (mi?.positioning?.themes?.includes("crowded AI / mega-cap growth")) {
    warnings.push("Current positioning may be vulnerable to growth-scare rotations.");
  }

  let relevance = 0.35;
  if (/portfolio|holdings|my book|exposure|concentration/i.test(prompt)) relevance = 0.85;
  if (ctx.mode === "portfolio") relevance = 0.9;

  const headline = concise(
    warnings[0] ||
      exposures[0]?.note ||
      "Portfolio macro channels align with index leadership — monitor breadth and rates.",
    220
  );

  logicDebug("portfolioIntelligenceEngine", {
    simulated,
    exposures: exposures.length,
    relevance,
  });

  return {
    headline,
    exposures: exposures.slice(0, 5),
    warnings,
    simulated,
    relevance: Math.min(1, relevance),
  };
}

/**
 * Hooks for future brokerage / saved watchlist integrations.
 * @param {object} _holdingsPayload
 */
export function ingestPortfolioHoldings(_holdingsPayload) {
  logicDebug("portfolioIntelligenceEngine.ingest", "hook only — not wired to brokerage");
  return { ok: false, reason: "preview_architecture_only" };
}

/**
 * @param {string[]} symbols
 */
export function ingestWatchlistThemes(symbols) {
  logicDebug("portfolioIntelligenceEngine.watchlist", symbols?.length || 0);
  return { symbols: symbols || [], themes: ["watchlist_hook"] };
}
