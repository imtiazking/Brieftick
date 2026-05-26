/**
 * Brieftick Logic — shared types & intelligence card helpers.
 * @module logic/types
 */

export const LOGIC_DISCLAIMER =
  "Market intelligence, not financial advice.";

export const LIMITED_DATA_MSG =
  "Live market confirmation currently limited.";

/** @typedef {'market-pulse'|'ticker'|'portfolio'|'sector-rotation'|'risk-regime'|'daily-brief'|'scenario'|'briefing'} LogicMode */

/**
 * @typedef {Object} IntelligenceCards
 * @property {string} snapshot
 * @property {string} catalyst
 * @property {string} macroContext
 * @property {string} sectorImpact
 * @property {string} volatility
 * @property {string} aiSummary
 */

/**
 * @typedef {Object} LogicResponse
 * @property {string} title
 * @property {string} [directAnswer]
 * @property {string} [questionKind]
 * @property {string} summary
 * @property {IntelligenceCards} cards
 * @property {string[]} keyDrivers
 * @property {string[]} signals
 * @property {number} confidence
 * @property {'high'|'moderate'|'limited'|'partial'} [confidenceLevel]
 * @property {string} [confidenceLabel]
 * @property {{ riskSignal?: string, relatedMovers?: string, portfolioImpact?: string }} [optionalCards]
 * @property {string} [memoryHint]
 * @property {string[]} sources
 * @property {string} disclaimer
 * @property {LogicMode} [mode]
 * @property {string} [modeLabel]
 * @property {string} [scenarioId]
 * @property {boolean} [usedAI]
 * @property {boolean} [mockData]
 * @property {boolean} [dataLimited]
 * @property {string[]} [failedSources]
 */

export const LOGIC_MODES = [
  {
    id: "market-pulse",
    label: "Market Pulse Logic",
    desc: "Overall market direction and tone",
    icon: "MP",
  },
  {
    id: "ticker",
    label: "Ticker Intelligence Logic",
    desc: "Ticker moves, news, and catalysts",
    icon: "TK",
  },
  {
    id: "portfolio",
    label: "Portfolio Logic",
    desc: "Exposure and concentration context",
    icon: "PF",
  },
  {
    id: "sector-rotation",
    label: "Sector Rotation Logic",
    desc: "Leadership and laggards",
    icon: "SR",
  },
  {
    id: "risk-regime",
    label: "Risk Regime Logic",
    desc: "Risk-on / risk-off conditions",
    icon: "RR",
  },
  {
    id: "daily-brief",
    label: "Daily Brief Logic",
    desc: "Concise session intelligence",
    icon: "DB",
  },
  {
    id: "scenario",
    label: "Scenario Analysis Logic",
    desc: "Hypothetical macro scenarios",
    icon: "SC",
  },
  {
    id: "briefing",
    label: "Market Briefing Logic",
    desc: "Concise answers for news and macro topics",
    icon: "BR",
  },
];

/**
 * @param {Partial<LogicResponse> & { title: string, summary: string }} partial
 * @returns {LogicResponse}
 */
export function buildLogicResponse(partial) {
  const summary = partial.summary || "";
  const drivers = partial.keyDrivers || [];
  const signals = partial.signals || [];
  const cards = partial.cards || inferCards(summary, drivers, signals, partial);

  return {
    title: partial.title,
    directAnswer: partial.directAnswer,
    questionKind: partial.questionKind,
    summary,
    cards,
    keyDrivers: drivers,
    signals,
    confidence: typeof partial.confidence === "number" ? partial.confidence : 62,
    confidenceLevel: partial.confidenceLevel,
    confidenceLabel: partial.confidenceLabel,
    optionalCards: partial.optionalCards || {},
    memoryHint: partial.memoryHint,
    sources: partial.sources || ["Brieftick Logic"],
    disclaimer: partial.disclaimer || LOGIC_DISCLAIMER,
    mode: partial.mode,
    modeLabel: partial.modeLabel,
    usedAI: !!partial.usedAI,
    mockData: !!partial.mockData,
    dataLimited: !!partial.dataLimited,
    failedSources: partial.failedSources || [],
  };
}

/**
 * @param {string} summary
 * @param {string[]} drivers
 * @param {string[]} signals
 * @param {Partial<LogicResponse>} partial
 * @returns {IntelligenceCards}
 */
function inferCards(summary, drivers, signals, partial) {
  return {
    snapshot: partial.cards?.snapshot || summary.slice(0, 220),
    catalyst: partial.cards?.catalyst || drivers[0] || "Headline and flow-driven narrative",
    macroContext:
      partial.cards?.macroContext ||
      drivers[1] ||
      "Rates, inflation path, and policy tone remain the macro anchor",
    sectorImpact:
      partial.cards?.sectorImpact ||
      drivers[2] ||
      "Sector sympathy and factor rotation shape relative performance",
    volatility:
      partial.cards?.volatility ||
      signals.find((s) => /vol|vix|risk/i.test(s)) ||
      signals[0] ||
      "Volatility channel active; monitor regime shifts",
    aiSummary: partial.cards?.aiSummary || summary,
  };
}
