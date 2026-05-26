/**
 * Dynamic card schemas — labels per question type (same card keys, different labels).
 * @module logic/cardSchemas
 */

/**
 * @typedef {Object} CardSchemaEntry
 * @property {string} key
 * @property {string} label
 * @property {boolean} [optional]
 * @property {boolean} [fullWidth]
 */

/** @type {Record<string, CardSchemaEntry[]>} */
export const CARD_SCHEMAS = {
  geopolitical: [
    { key: "snapshot", label: "Situation" },
    { key: "catalyst", label: "Oil Impact" },
    { key: "macroContext", label: "Risk Assets" },
    { key: "sectorImpact", label: "Safe Havens" },
    { key: "volatility", label: "Volatility" },
    { key: "aiSummary", label: "Logic Summary", fullWidth: true },
  ],
  ticker: [
    { key: "snapshot", label: "Price Action" },
    { key: "catalyst", label: "Catalyst" },
    { key: "macroContext", label: "Earnings" },
    { key: "sectorImpact", label: "Positioning" },
    { key: "volatility", label: "Risk" },
    { key: "aiSummary", label: "Summary", fullWidth: true },
  ],
  causal: [
    { key: "catalyst", label: "Cost Impact" },
    { key: "macroContext", label: "Margin Effect" },
    { key: "sectorImpact", label: "Sector Winners" },
    { key: "sectorRisks", label: "Sector Losers", optional: true },
    { key: "volatility", label: "Inflation Transmission" },
    { key: "aiSummary", label: "Logic Summary", fullWidth: true },
  ],
  supply_chain: [
    { key: "catalyst", label: "Cost Impact" },
    { key: "macroContext", label: "Margin Effect" },
    { key: "sectorImpact", label: "Sector Winners" },
    { key: "sectorRisks", label: "Sector Losers", optional: true },
    { key: "volatility", label: "Inflation Transmission" },
    { key: "aiSummary", label: "Logic Summary", fullWidth: true },
  ],
  scenario: [
    { key: "snapshot", label: "Scenario Snapshot" },
    { key: "catalyst", label: "Market Impact" },
    { key: "sectorImpact", label: "Sector Winners" },
    { key: "sectorRisks", label: "Sector Risks", optional: true },
    { key: "volatility", label: "Volatility Outlook" },
    { key: "aiSummary", label: "Logic Summary", fullWidth: true },
  ],
  briefing: [
    { key: "catalyst", label: "Key Driver" },
    { key: "macroContext", label: "Macro" },
    { key: "sectorImpact", label: "Sectors" },
    { key: "volatility", label: "Volatility" },
    { key: "aiSummary", label: "Logic Summary", fullWidth: true },
  ],
  geopolitical_briefing: [
    { key: "snapshot", label: "Situation" },
    { key: "catalyst", label: "Oil Impact" },
    { key: "macroContext", label: "Risk Assets" },
    { key: "sectorImpact", label: "Safe Havens" },
    { key: "volatility", label: "Volatility" },
    { key: "aiSummary", label: "Logic Summary", fullWidth: true },
  ],
  macro_interpretation: [
    { key: "catalyst", label: "Expectations" },
    { key: "macroContext", label: "Growth & Earnings" },
    { key: "sectorImpact", label: "Positioning & Narrative" },
    { key: "volatility", label: "Rates & Liquidity" },
    { key: "aiSummary", label: "Logic Summary", fullWidth: true },
  ],
  default: [
    { key: "snapshot", label: "Snapshot" },
    { key: "catalyst", label: "Catalyst" },
    { key: "macroContext", label: "Macro Context" },
    { key: "sectorImpact", label: "Sector Impact" },
    { key: "volatility", label: "Volatility" },
    { key: "aiSummary", label: "Summary", fullWidth: true },
  ],
};

/**
 * @param {import('./types.js').LogicResponse} res
 * @returns {CardSchemaEntry[]}
 */
export function resolveCardSchema(res) {
  const kind = res.questionKind || res.cardSchemaId;
  const mode = res.mode;
  if (kind === "geopolitical" && mode === "briefing") return CARD_SCHEMAS.geopolitical_briefing;
  if (kind === "geopolitical") return CARD_SCHEMAS.geopolitical;
  if (mode === "ticker" || kind === "ticker") return CARD_SCHEMAS.ticker;
  if (mode === "causal") return CARD_SCHEMAS.causal;
  if (mode === "macro-interpretation" || kind === "macro_interpretation")
    return CARD_SCHEMAS.macro_interpretation;
  if (kind === "supply_chain") return CARD_SCHEMAS.supply_chain;
  if (mode === "scenario") return CARD_SCHEMAS.scenario;
  if (mode === "briefing") return CARD_SCHEMAS.briefing;
  return CARD_SCHEMAS.default;
}
