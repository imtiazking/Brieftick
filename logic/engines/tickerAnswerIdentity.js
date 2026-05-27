/**
 * Validate final ticker answer mentions the resolved symbol/company.
 * @module logic/engines/tickerAnswerIdentity
 */

import { logicDebug } from "../logicDebug.js";
import { buildTickerDeskLogicResponse } from "./tickerDeskCopy.js";
import { getTickerDisplayName } from "./tickerCatalog.js";

/** Symbol → regexes that must NOT appear when that symbol was resolved. */
const WRONG_IDENTITY_PATTERNS = {
  INTC: [/\bnvidia\b/i, /\bnvda\b/i],
  NOK: [/\bnvidia\b/i, /\bnvda\b/i, /\bsemiconductor\b/i, /\bai-linked\b/i],
  SNOW: [/\bnvidia\b/i, /\bnvda\b/i],
  MU: [/\bnvidia\b/i, /\bnvda\b/i],
  GOOGL: [/\bnvidia\b/i, /\bnvda\b/i],
  AAPL: [/\bnvidia\b/i, /\bnvda\b/i],
  JPM: [/\bnvidia\b/i, /\bnvda\b/i, /\bsemiconductor\b/i],
  TSLA: [/\bnvidia\b/i, /\bnvda\b/i],
  GLD: [/\bnvidia\b/i, /\bnvda\b/i, /\bsemiconductor\b/i],
};

/**
 * @param {string} text
 * @param {{ symbol: string, companyName?: string }} entity
 */
export function validateTickerAnswerIdentity(text, entity) {
  const sym = String(entity?.symbol || "").toUpperCase();
  if (!sym) return true;

  const body = String(text || "");
  const upper = body.toUpperCase();
  const name = entity.companyName || getTickerDisplayName(sym);

  const mentionsSymbol = upper.includes(sym);
  const mentionsName =
    name && name.length > 2 && body.toLowerCase().includes(name.toLowerCase());

  const aliasNames = {
    GOOGL: ["alphabet", "google"],
    GOOG: ["alphabet", "google"],
    META: ["meta", "facebook"],
  };
  const mentionsAlias = (aliasNames[sym] || []).some((a) =>
    body.toLowerCase().includes(a)
  );

  if (!mentionsSymbol && !mentionsName && !mentionsAlias) return false;

  const wrong = WRONG_IDENTITY_PATTERNS[sym] || [];
  for (const re of wrong) {
    if (re.test(body)) return false;
  }

  const crossSymbols = ["NVDA", "NOK", "INTC", "SNOW", "MU", "GOOGL", "AAPL", "TSLA"];
  for (const other of crossSymbols) {
    if (other === sym) continue;
    if (!upper.includes(other)) continue;
    const otherName = getTickerDisplayName(other);
    if (otherName && body.toLowerCase().includes(otherName.toLowerCase())) {
      return false;
    }
  }

  return true;
}

/**
 * @param {import('../types.js').LogicResponse} res
 * @param {{ symbol: string, companyName?: string }} entity
 * @param {object} [ctx]
 */
export function enforceTickerAnswerIdentity(res, entity, ctx = {}) {
  if (!entity?.symbol) return res;

  const sym = entity.symbol;
  const name = entity.companyName || getTickerDisplayName(sym);
  const text = res.directAnswer || res.summary || res.cards?.snapshot || "";

  if (validateTickerAnswerIdentity(text, entity)) {
    logicDebug("tickerAnswerIdentity.valid", { symbol: sym, finalSymbol: sym });
    return {
      ...res,
      primarySymbol: sym,
      title: name,
    };
  }

  logicDebug("tickerAnswerIdentity.rewrite", {
    expected: sym,
    had: text.slice(0, 80),
    fallbackSource: "tickerDeskCopy",
  });

  const repaired = buildTickerDeskLogicResponse(
    ctx,
    sym,
    name,
    null,
    res.cards?.catalyst
  );
  repaired.primarySymbol = sym;
  repaired.title = name;
  logicDebug("tickerAnswerIdentity.final", { finalSymbol: sym });
  return repaired;
}
