/**
 * Intent detection — classifies user goal before module routing.
 * @module logic/intentDetect
 */

import { resolvePrimaryEntity } from "./entityResolver.js";
import { detectLogicMode } from "./modeDetect.js";
import { logicDebug } from "./shared.js";

/** @typedef {'ticker_intelligence'|'market_pulse'|'risk_regime'|'portfolio_logic'|'sector_rotation'|'daily_brief'|'scenario_analysis'} LogicIntent */

/** @type {Record<import('./types.js').LogicMode, LogicIntent>} */
const MODE_TO_INTENT = {
  ticker: "ticker_intelligence",
  "market-pulse": "market_pulse",
  "risk-regime": "risk_regime",
  portfolio: "portfolio_logic",
  "sector-rotation": "sector_rotation",
  "daily-brief": "daily_brief",
  scenario: "scenario_analysis",
};

/** @type {Record<LogicIntent, string>} */
export const INTENT_LABELS = {
  ticker_intelligence: "Ticker Intelligence",
  market_pulse: "Market Pulse",
  risk_regime: "Risk Regime",
  portfolio_logic: "Portfolio Logic",
  sector_rotation: "Sector Rotation",
  daily_brief: "Daily Brief",
  scenario_analysis: "Scenario Analysis",
};

/**
 * @typedef {Object} IntentResult
 * @property {LogicIntent} intent
 * @property {import('./types.js').LogicMode} mode
 * @property {string} label
 */

/**
 * @param {string} prompt
 * @param {import('./entityResolver.js').ResolvedEntity} [primaryEntity]
 * @returns {IntentResult}
 */
export function detectIntent(prompt, primaryEntity) {
  const entity = primaryEntity || resolvePrimaryEntity(prompt);
  const mode = detectLogicMode(prompt, entity);
  const intent = MODE_TO_INTENT[mode] || "market_pulse";
  const result = {
    intent,
    mode,
    label: INTENT_LABELS[intent],
  };
  logicDebug("intent detected", result);
  return result;
}
