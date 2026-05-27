/**
 * Portfolio-aware Logic memory — exposure, concentration, macro sensitivity.
 * @module logic/portfolioMemory
 */

import { resolvePortfolioContext } from "./engines/inferredPortfolioContext.js";
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
 * @property {import('./engines/inferredPortfolioContext.js').PortfolioContextSource} source
 * @property {boolean} isInferred
 * @property {string} contextLabel
 * @property {string[]} inferenceNotes
 */

/**
 * @returns {PortfolioMemory}
 */
export function buildPortfolioMemory() {
  const resolved = resolvePortfolioContext();
  const profile = resolved.profile;
  const top3 = profile.topSymbols;
  const topThreeWeight = profile.topThreeWeight;
  const concentrationLabel = profile.concentrationLabel;

  const memory = {
    holdings: resolved.holdings,
    profile,
    positionCount: profile.positionCount,
    topThreeWeight,
    topSymbols: top3,
    concentrationLabel,
    hint: resolved.hint,
    source: resolved.source,
    isInferred: resolved.isInferred,
    contextLabel: resolved.contextLabel,
    inferenceNotes: resolved.inferenceNotes,
  };

  logicDebug("portfolioMemory", {
    source: memory.source,
    positions: memory.positionCount,
    inferred: memory.isInferred,
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

  if (portfolio.isInferred) {
    optional.portfolioContextLabel = portfolio.contextLabel;
    optional.inferredPortfolioProfile = conciseInferenceLabel(portfolio);
    if (portfolio.inferenceNotes?.[0]) {
      optional.estimatedFactorConcentration = portfolio.inferenceNotes[0].slice(0, 200);
    }
  } else if (portfolio.source === "explicit") {
    optional.portfolioContextLabel = "Saved portfolio weights";
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
    portfolioContextSource: portfolio.source,
    portfolioContextLabel: portfolio.contextLabel,
    isInferredPortfolio: portfolio.isInferred,
  };
}

/**
 * @param {PortfolioMemory} portfolio
 */
function conciseInferenceLabel(portfolio) {
  const p = portfolio.profile;
  return `Inferred portfolio profile · ${portfolio.contextLabel} · ${p.positionCount} names · AI ~${p.aiWeight}%`;
}
