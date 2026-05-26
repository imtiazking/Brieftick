/**
 * Portfolio-aware Logic memory — exposure, concentration, macro sensitivity.
 * @module logic/portfolioMemory
 */

import { loadSavedPortfolio } from "./portfolioParser.js";
import { buildPortfolioProfile } from "./portfolioProfile.js";
import { getPortfolioHoldings } from "./shared.js";
import { logicDebug } from "./shared.js";

/**
 * @typedef {Object} PortfolioMemory
 * @property {{ symbol: string, weight: number }[]} holdings
 * @property {import('./portfolioProfile.js').PortfolioProfile} profile
 * @property {number} positionCount
 * @property {number} topThreeWeight
 * @property {string[]} topSymbols
 * @property {string} concentrationLabel
 * @property {string} hint
 */

/**
 * @returns {PortfolioMemory}
 */
export function buildPortfolioMemory() {
  const saved = loadSavedPortfolio();
  const fromDom = getPortfolioHoldings();
  const holdings =
    fromDom.length > 0 ? fromDom : saved?.holdings?.length ? saved.holdings : [];

  const lines =
    holdings.length > 0
      ? holdings
      : [
          { symbol: "NVDA", weight: 18 },
          { symbol: "AAPL", weight: 12 },
          { symbol: "MSFT", weight: 10 },
        ];

  const profile = buildPortfolioProfile(lines);
  const top3 = profile.topSymbols;
  const topThreeWeight = profile.topThreeWeight;
  const concentrationLabel = profile.concentrationLabel;

  const hintParts = [];
  if (holdings.length && saved?.holdings?.length) {
    hintParts.push(
      `Portfolio: ${profile.positionCount} positions; top ${top3.join(", ")} (${topThreeWeight.toFixed(0)}% top-3).`
    );
    hintParts.push(
      `AI ~${profile.aiWeight}% · rates ${profile.sensitivity.rates} · ${profile.growthDefensiveTilt}.`
    );
  } else {
    hintParts.push(
      "No saved portfolio — paste holdings in Logic or Portfolio tab for personalized reads."
    );
  }

  const memory = {
    holdings: lines,
    profile,
    positionCount: profile.positionCount,
    topThreeWeight,
    topSymbols: top3,
    concentrationLabel,
    hint: hintParts.join(" "),
  };

  logicDebug("portfolioMemory", {
    positions: memory.positionCount,
    aiWeight: profile.aiWeight,
  });

  return memory;
}

/**
 * @param {import('./types.js').LogicResponse} res
 * @param {PortfolioMemory} portfolio
 * @param {import('./types.js').LogicMode} mode
 */
export function applyPortfolioMemoryToResponse(res, portfolio, mode) {
  if (!portfolio?.hint) return res;
  const optional = { ...(res.optionalCards || {}) };
  const profile = portfolio.profile;

  if (mode === "portfolio" || mode === "ticker" || /portfolio/i.test(res.mode || "")) {
    optional.portfolioImpact = (portfolio.hint || "").slice(0, 240);
  }
  if (profile?.aiWeight >= 30) {
    optional.riskSignal =
      optional.riskSignal ||
      `AI concentration ~${profile.aiWeight}% · ${portfolio.concentrationLabel}`;
  } else if (portfolio.concentrationLabel.includes("High")) {
    optional.riskSignal =
      optional.riskSignal || `${portfolio.concentrationLabel} · correlation risk elevated`;
  }

  return {
    ...res,
    optionalCards: optional,
    portfolioHint: portfolio.hint,
    portfolioProfile: profile,
  };
}
