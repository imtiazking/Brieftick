/**
 * Portfolio profile — sector, theme, concentration and macro sensitivity inference.
 * @module logic/portfolioProfile
 */

/** @type {Record<string, { sector: string, themes: string[] }>} */
export const SYMBOL_PROFILE = {
  NVDA: { sector: "Semiconductors", themes: ["AI infrastructure", "Mega-cap growth"] },
  AMD: { sector: "Semiconductors", themes: ["AI infrastructure", "Semiconductors"] },
  MSFT: { sector: "Technology", themes: ["AI infrastructure", "Mega-cap growth", "Cloud"] },
  META: { sector: "Technology", themes: ["AI infrastructure", "Mega-cap growth"] },
  AAPL: { sector: "Technology", themes: ["Mega-cap growth", "Consumer tech"] },
  GOOGL: { sector: "Technology", themes: ["AI infrastructure", "Mega-cap growth"] },
  GOOG: { sector: "Technology", themes: ["AI infrastructure", "Mega-cap growth"] },
  AVGO: { sector: "Semiconductors", themes: ["AI infrastructure", "Semiconductors"] },
  TSM: { sector: "Semiconductors", themes: ["AI infrastructure", "Semiconductors"] },
  SMCI: { sector: "Technology", themes: ["AI infrastructure", "High beta"] },
  ASML: { sector: "Semiconductors", themes: ["AI infrastructure", "Semiconductors"] },
  MU: { sector: "Semiconductors", themes: ["AI infrastructure", "Semiconductors"] },
  ARM: { sector: "Semiconductors", themes: ["AI infrastructure", "Semiconductors"] },
  AMZN: { sector: "Consumer Discretionary", themes: ["Mega-cap growth", "Rates sensitive"] },
  TSLA: { sector: "Consumer Discretionary", themes: ["High beta", "Rates sensitive"] },
  JPM: { sector: "Financials", themes: ["Rates sensitive", "Financials"] },
  BAC: { sector: "Financials", themes: ["Rates sensitive", "Financials"] },
  XLF: { sector: "Financials", themes: ["Rates sensitive"] },
  XLE: { sector: "Energy", themes: ["Oil sensitivity", "Geopolitical"] },
  XOM: { sector: "Energy", themes: ["Oil sensitivity"] },
  KO: { sector: "Consumer Staples", themes: ["Defensive"] },
  PG: { sector: "Consumer Staples", themes: ["Defensive"] },
  JNJ: { sector: "Healthcare", themes: ["Defensive"] },
  WMT: { sector: "Consumer Staples", themes: ["Defensive"] },
  COST: { sector: "Consumer Staples", themes: ["Defensive"] },
  XLP: { sector: "Consumer Staples", themes: ["Defensive"] },
  XLU: { sector: "Utilities", themes: ["Defensive", "Rates sensitive"] },
  IWM: { sector: "Small Cap", themes: ["Cyclicals", "Rates sensitive"] },
  QQQ: { sector: "Technology", themes: ["Mega-cap growth", "Rates sensitive"] },
  SPY: { sector: "Broad Market", themes: ["Beta"] },
  CASH: { sector: "Cash", themes: ["Liquidity"] },
};

/**
 * @typedef {Object} ParsedHolding
 * @property {string} symbol
 * @property {number} weight
 * @property {string} [sector]
 * @property {string[]} [themes]
 */

/**
 * @typedef {Object} PortfolioProfile
 * @property {ParsedHolding[]} holdings
 * @property {number} positionCount
 * @property {number} topThreeWeight
 * @property {string[]} topSymbols
 * @property {string} concentrationLabel
 * @property {Record<string, number>} sectorWeights
 * @property {Record<string, number>} themeWeights
 * @property {number} aiWeight
 * @property {number} megaCapWeight
 * @property {number} defensiveWeight
 * @property {{ rates: string, volatility: string, liquidity: string, geopolitical: string, earnings: string }} sensitivity
 * @property {string} growthDefensiveTilt
 * @property {boolean} hasUserHoldings
 */

/**
 * @param {ParsedHolding[]} holdings
 * @returns {PortfolioProfile}
 */
export function buildPortfolioProfile(holdings) {
  const lines = (holdings || []).filter((h) => h.symbol && h.symbol !== "CASH");
  const cashLine = (holdings || []).find((h) => h.symbol === "CASH");
  const cashWeight = cashLine?.weight || 0;

  const enriched = lines.map((h) => {
    const sym = String(h.symbol).toUpperCase();
    const meta = SYMBOL_PROFILE[sym] || { sector: "Equity", themes: ["Single stock"] };
    return {
      symbol: sym,
      weight: h.weight || 0,
      sector: meta.sector,
      themes: meta.themes,
    };
  });

  const totalWeight =
    enriched.reduce((s, h) => s + h.weight, 0) + cashWeight || 100;
  const norm = totalWeight > 0 ? 100 / totalWeight : 1;
  for (const h of enriched) h.weight = Math.round(h.weight * norm * 10) / 10;
  const normalizedCash = Math.round(cashWeight * norm * 10) / 10;

  const sorted = [...enriched].sort((a, b) => b.weight - a.weight);
  const top3 = sorted.slice(0, 3);
  const topThreeWeight = top3.reduce((s, h) => s + h.weight, 0);

  const concentrationLabel =
    topThreeWeight > 55
      ? "Very high concentration"
      : topThreeWeight > 40
        ? "High concentration"
        : topThreeWeight > 25
          ? "Moderate concentration"
          : "Balanced book";

  /** @type {Record<string, number>} */
  const sectorWeights = {};
  /** @type {Record<string, number>} */
  const themeWeights = {};
  let aiWeight = 0;
  let megaCapWeight = 0;
  let defensiveWeight = 0;

  for (const h of enriched) {
    sectorWeights[h.sector] = (sectorWeights[h.sector] || 0) + h.weight;
    for (const th of h.themes) {
      themeWeights[th] = (themeWeights[th] || 0) + h.weight;
    }
    if (/AI infrastructure|Semiconductors/i.test(h.themes.join(" "))) aiWeight += h.weight;
    if (/Mega-cap growth/i.test(h.themes.join(" "))) megaCapWeight += h.weight;
    if (/Defensive/i.test(h.themes.join(" "))) defensiveWeight += h.weight;
  }

  const growthDefensiveTilt =
    defensiveWeight > aiWeight + 10
      ? "Defensive tilt"
      : aiWeight > defensiveWeight + 15
        ? "Growth / AI tilt"
        : "Balanced growth-defensive mix";

  const level = (pct, hi, med) =>
    pct >= hi ? "elevated" : pct >= med ? "moderate" : "low";

  const ratesPct =
    (themeWeights["Rates sensitive"] || 0) +
    (sectorWeights["Financials"] || 0) * 0.5 +
    megaCapWeight * 0.3;
  const volPct = aiWeight * 0.6 + (100 - defensiveWeight) * 0.2;
  const geoPct = themeWeights["Oil sensitivity"] || themeWeights["Geopolitical"] || 0;

  return {
    holdings: enriched,
    positionCount: enriched.length,
    topThreeWeight,
    topSymbols: top3.map((h) => h.symbol),
    concentrationLabel,
    sectorWeights,
    themeWeights,
    aiWeight: Math.round(aiWeight * 10) / 10,
    megaCapWeight: Math.round(megaCapWeight * 10) / 10,
    defensiveWeight: Math.round(defensiveWeight * 10) / 10,
    cashWeight: normalizedCash,
    sensitivity: {
      rates: level(ratesPct, 35, 20),
      volatility: level(volPct, 40, 22),
      liquidity: normalizedCash >= 20 ? "low beta" : level(100 - normalizedCash, 70, 50),
      geopolitical: level(geoPct, 25, 12),
      earnings: level(aiWeight + megaCapWeight, 45, 25),
    },
    growthDefensiveTilt,
    hasUserHoldings: enriched.length > 0,
  };
}
