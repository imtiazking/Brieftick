/**
 * Portfolio-aware Logic memory — exposure, concentration, macro sensitivity.
 * @module logic/portfolioMemory
 */

import { loadSavedPortfolio } from "./portfolioParser.js";
import { buildPortfolioProfile } from "./portfolioProfile.js";
import { getPortfolioHoldings } from "./shared.js";
import { logicDebug } from "./shared.js";
import { resolvePortfolioContext } from "./engines/inferredPortfolioContext.js";

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
 * @param {import('./engines/inferredPortfolioContext.js').ResolvedPortfolioContext} [portfolioContext]
 * @returns {PortfolioMemory}
 */
export function buildPortfolioMemoryFromContext(portfolioContext) {
  const resolved = portfolioContext || resolvePortfolioContext();
  const lines = resolved.holdings;
  const profile = resolved.profile;
  const top3 = profile.topSymbols;
  const topThreeWeight = profile.topThreeWeight;

  const memory = {
    holdings: lines,
    profile,
    positionCount: profile.positionCount,
    topThreeWeight,
    topSymbols: top3,
    concentrationLabel: profile.concentrationLabel,
    hint: resolved.hint || "",
    portfolioSource: resolved.source,
    isInferred: resolved.isInferred,
    contextLabel: resolved.contextLabel,
  };

  logicDebug("portfolioMemory", {
    source: resolved.source,
    positions: memory.positionCount,
    aiWeight: profile.aiWeight,
  });

  return memory;
}

/**
 * @returns {PortfolioMemory}
 */
export function buildPortfolioMemory() {
  return buildPortfolioMemoryFromContext(resolvePortfolioContext());
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
