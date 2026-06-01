/**
 * Logic → Ticker Deep Dive action eligibility (Phase 2.2a).
 * Presentation metadata only — no new analytics.
 * @module logic/engines/deepDiveActions
 */

import { getFusedQuote } from "../dataFusion.js";
import { getTickerDisplayName, isKnownLogicTicker } from "./tickerCatalog.js";

/** Align with logic/engines/tickerResolver.js MIN_CONFIDENCE */
const MIN_ENTITY_CONFIDENCE = 72;

const TRADABLE_ENTITY_TYPES = new Set([
  "company",
  "ticker",
  "etf",
  "index",
  "sector_theme",
]);

/** Modes that never offer Open Deep Dive (Phase 2.2a). */
const NO_DEEP_DIVE_MODES = new Set([
  "portfolio",
  "scenario",
  "macro-interpretation",
  "watchlist",
  "daily-brief",
  "risk-regime",
]);

/**
 * @param {import('../types.js').LogicResponse} [res]
 */
function isTickerScopedResponse(res) {
  const mode = res?.mode || "";
  const intent = String(res?.responseIntent || "");
  return (
    mode === "ticker" ||
    mode === "causal" ||
    intent === "ticker" ||
    intent === "ticker_intelligence" ||
    /ticker/.test(intent)
  );
}

/**
 * @typedef {Object} LogicDeepDiveOpen
 * @property {string} symbol
 * @property {string} [name]
 */

/**
 * @param {import('../entityResolver.js').ResolvedEntity} [entity]
 * @param {import('../types.js').LogicResponse} [res]
 * @returns {LogicDeepDiveOpen|null}
 */
export function getLogicDeepDiveOpen(entity, res) {
  if (entity?.unresolved) return null;

  const sym = String(res?.primarySymbol || entity?.symbol || "")
    .trim()
    .toUpperCase();
  if (!sym || !isKnownLogicTicker(sym)) return null;

  const tickerScoped = isTickerScopedResponse(res);
  const mode = res?.mode;

  if (mode && NO_DEEP_DIVE_MODES.has(mode) && !tickerScoped) return null;

  if (tickerScoped && res?.primarySymbol) {
    return {
      symbol: sym,
      name: getTickerDisplayName(sym) || entity?.companyName || sym,
    };
  }

  const type = entity?.entityType;
  if (type === "macro" || type === "market") return null;
  if (!type || !TRADABLE_ENTITY_TYPES.has(type)) return null;

  const confidence = Number(entity?.confidence) || 0;
  if (confidence < MIN_ENTITY_CONFIDENCE) return null;

  return {
    symbol: sym,
    name: entity?.companyName || getTickerDisplayName(sym) || sym,
  };
}

/**
 * @param {object} ctx
 * @param {string} symbol
 * @returns {{ price: number, pctChange: number, change?: number, provider?: string }|undefined}
 */
export function getLogicDeepDiveQuote(ctx, symbol) {
  const sym = String(symbol || "").toUpperCase();
  if (!sym || !ctx?.fusion) return undefined;

  const fq = getFusedQuote(ctx.fusion, sym);
  const price = Number(fq?.price);
  const pctChange = Number(fq?.pctChange);
  if (!(price > 0) || !Number.isFinite(pctChange)) return undefined;

  const change = price * (pctChange / 100) / (1 + pctChange / 100);
  return { price, pctChange, change, provider: "Logic" };
}

/**
 * @param {import('../types.js').LogicResponse} res
 * @param {{ primaryEntity?: import('../entityResolver.js').ResolvedEntity, fusion?: object }} ctx
 */
export function attachLogicDeepDiveToResponse(res, ctx = {}) {
  const entity = ctx.primaryEntity;
  let open = getLogicDeepDiveOpen(entity, res);

  if (
    !open &&
    res?.deepDiveOpen?.symbol &&
    isKnownLogicTicker(res.deepDiveOpen.symbol)
  ) {
    open = res.deepDiveOpen;
  }

  if (!open) {
    const { deepDiveOpen, logicDeepDiveQuote, ...rest } = res || {};
    return rest;
  }

  const quote =
    res?.logicDeepDiveQuote || getLogicDeepDiveQuote(ctx, open.symbol);

  return {
    ...res,
    deepDiveOpen: open,
    logicDeepDiveQuote: quote,
    logicDeepDiveFusion: ctx.fusion || res?.logicDeepDiveFusion || null,
  };
}

/**
 * Entity for Deep Dive CTA — prefer pipeline symbol when resolver returned abstract market shell.
 * @param {import('../entityResolver.js').ResolvedEntity} primary
 * @param {import('../types.js').LogicResponse} [res]
 */
export function resolveDeepDiveEntity(primary, res) {
  if (primary?.symbol && !primary.unresolved) {
    const open = getLogicDeepDiveOpen(primary, res);
    if (open) return primary;
  }

  const sym = String(res?.primarySymbol || "").toUpperCase();
  if (sym && isKnownLogicTicker(sym) && isTickerScopedResponse(res)) {
    return {
      entityType: "ticker",
      symbol: sym,
      companyName: getTickerDisplayName(sym),
      confidence: 90,
    };
  }

  return primary;
}
