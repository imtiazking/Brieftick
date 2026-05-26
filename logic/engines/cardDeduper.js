/**
 * Card deduplication — prevent repeated sections and duplicate copy.
 * @module logic/engines/cardDeduper
 */

import { logicDebug } from "../shared.js";

/**
 * @param {string} text
 */
function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 90);
}

/**
 * @param {import('../types.js').LogicResponse} res
 * @param {import('../cardSchemas.js').CardSchemaEntry[]} [schema]
 */
export function cardDeduper(res, schema = []) {
  const schemaKeys = new Set(schema.map((s) => s.key));
  const cards = { ...(res.cards || {}) };
  const optional = { ...(res.optionalCards || {}) };
  const seen = new Map();

  const dropIfDuplicate = (key, text) => {
    const n = normalize(text);
    if (!n || n.length < 12) return "";
    if (seen.has(n)) {
      logicDebug("cardDeduper drop", { key, duplicateOf: seen.get(n) });
      return "";
    }
    seen.set(n, key);
    return text;
  };

  for (const key of Object.keys(cards)) {
    cards[key] = dropIfDuplicate(key, cards[key]);
  }

  for (const key of Object.keys(optional)) {
    optional[key] = dropIfDuplicate(`opt:${key}`, optional[key]);
  }

  if (schemaKeys.has("sectorRisks")) {
    const win = normalize(cards.sectorImpact);
    const lose =
      normalize(optional.sectorRisks) || normalize(cards.sectorRisks);
    if (win && lose && win === lose) optional.sectorRisks = "";
    if (win && lose && win.includes(lose.slice(0, 40))) optional.sectorRisks = "";
  }

  const direct = normalize(res.directAnswer);
  if (direct) {
    for (const key of Object.keys(cards)) {
      if (normalize(cards[key]) === direct && key !== "snapshot") cards[key] = "";
    }
    if (normalize(cards.aiSummary) === direct) {
      cards.aiSummary = "";
    }
  }

  if (
    normalize(cards.catalyst) &&
    normalize(cards.catalyst) === normalize(cards.macroContext)
  ) {
    cards.macroContext = "";
  }

  return {
    ...res,
    cards,
    optionalCards: Object.fromEntries(
      Object.entries(optional).filter(([, v]) => v && String(v).trim())
    ),
    deduped: true,
  };
}
