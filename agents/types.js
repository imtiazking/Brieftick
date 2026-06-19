/**
 * FORGENIQ AI Market Agent — shared types & response helpers.
 * @module agents/types
 */

export const AGENT_DISCLAIMER =
  "Market intelligence, not financial advice.";

/** @typedef {'market-pulse'|'ticker'|'portfolio'|'sector-rotation'|'risk-regime'|'daily-brief'|'scenario'} AgentMode */

/**
 * @typedef {Object} AgentResponse
 * @property {string} title
 * @property {string} summary
 * @property {string[]} keyDrivers
 * @property {string[]} signals
 * @property {number} confidence
 * @property {string[]} sources
 * @property {string} disclaimer
 * @property {AgentMode} [mode]
 * @property {boolean} [usedAI]
 * @property {boolean} [mockData]
 */

export const AGENT_MODES = [
  {
    id: "market-pulse",
    label: "Market Pulse",
    desc: "Overall market direction and tone",
    icon: "MP",
  },
  {
    id: "ticker",
    label: "Ticker Analysis",
    desc: "Why a symbol is moving",
    icon: "TK",
  },
  {
    id: "portfolio",
    label: "Portfolio Analysis",
    desc: "Exposure and concentration context",
    icon: "PF",
  },
  {
    id: "sector-rotation",
    label: "Sector Rotation",
    desc: "Leadership and laggards",
    icon: "SR",
  },
  {
    id: "risk-regime",
    label: "Risk Regime",
    desc: "Risk-on / risk-off conditions",
    icon: "RR",
  },
  {
    id: "daily-brief",
    label: "Daily Brief",
    desc: "Concise session intelligence",
    icon: "DB",
  },
  {
    id: "scenario",
    label: "Scenario Analysis",
    desc: "Hypothetical macro scenarios",
    icon: "SC",
  },
];

/**
 * @param {Partial<AgentResponse> & { title: string, summary: string }} partial
 * @returns {AgentResponse}
 */
export function buildAgentResponse(partial) {
  return {
    title: partial.title,
    summary: partial.summary,
    keyDrivers: partial.keyDrivers || [],
    signals: partial.signals || [],
    confidence: typeof partial.confidence === "number" ? partial.confidence : 62,
    sources: partial.sources || ["FORGENIQ intelligence layer"],
    disclaimer: partial.disclaimer || AGENT_DISCLAIMER,
    mode: partial.mode,
    usedAI: !!partial.usedAI,
    mockData: !!partial.mockData,
  };
}
