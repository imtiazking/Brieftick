/**
 * Portfolio-aware Logic memory — exposure, concentration, sector balance.
 * @module logic/portfolioMemory
 */

import { getPortfolioHoldings } from "./shared.js";
import { logicDebug } from "./shared.js";

/**
 * @typedef {Object} PortfolioMemory
 * @property {{ symbol: string, weight: number }[]} holdings
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
  const holdings = getPortfolioHoldings();
  const lines =
    holdings.length > 0
      ? holdings
      : [
          { symbol: "NVDA", weight: 18 },
          { symbol: "AAPL", weight: 12 },
          { symbol: "MSFT", weight: 10 },
        ];

  const sorted = [...lines].sort((a, b) => (b.weight || 0) - (a.weight || 0));
  const top3 = sorted.slice(0, 3);
  const topThreeWeight = top3.reduce((s, h) => s + (h.weight || 0), 0);
  const concentrationLabel =
    topThreeWeight > 40
      ? "High concentration"
      : topThreeWeight > 25
        ? "Moderate concentration"
        : "Balanced book";

  const hintParts = [];
  if (holdings.length) {
    hintParts.push(
      `Portfolio: ${holdings.length} positions; top weights ${top3.map((h) => h.symbol).join(", ")} (${topThreeWeight.toFixed(0)}% in top 3).`
    );
    hintParts.push(`${concentrationLabel} — macro and vol transmission matter for book risk.`);
  } else {
    hintParts.push(
      "No saved portfolio — using sample growth-tilted weights for contextual exposure read."
    );
  }

  const memory = {
    holdings: lines,
    positionCount: holdings.length || lines.length,
    topThreeWeight,
    topSymbols: top3.map((h) => h.symbol),
    concentrationLabel,
    hint: hintParts.join(" "),
  };

  logicDebug("portfolioMemory", {
    positions: memory.positionCount,
    topThreeWeight,
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

  if (mode === "portfolio" || mode === "ticker") {
    optional.portfolioImpact = portfolio.hint.slice(0, 240);
  }
  if (portfolio.concentrationLabel.includes("High")) {
    optional.riskSignal =
      optional.riskSignal ||
      `${portfolio.concentrationLabel} · correlation risk elevated`;
  }

  return { ...res, optionalCards: optional, portfolioHint: portfolio.hint };
}
