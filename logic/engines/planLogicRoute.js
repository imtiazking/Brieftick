/**
 * Context-first Logic routing — personal book/watchlist beat strategist & macro fallback.
 * @module logic/engines/planLogicRoute
 */

import { logicDebug } from "../shared.js";
import {
  isPortfolioScopedQuery,
  isWatchlistPerformanceQuery,
  mentionsPersonalBook,
  mentionsPersonalWatchlist,
} from "./userContext.js";
import { isExplicitNewsQuery, isStrategistInterpretationQuery } from "./strategistQueryGate.js";
import { isNewsStyleQuery } from "../questionIntent.js";

/**
 * @typedef {Object} LogicRoute
 * @property {import('../types.js').LogicMode} mode
 * @property {string} label
 * @property {import('../questionIntent.js').QuestionKind} kind
 * @property {boolean} wantsBriefing
 * @property {string} routeReason
 * @property {boolean} suppressStrategist
 * @property {boolean} suppressMacroFallback
 */

/**
 * @param {string} prompt
 * @param {import('./userContext.js').UserContext} userContext
 * @param {import('../questionIntent.js').QuestionClassification} classified
 * @returns {LogicRoute}
 */
export function planLogicRoute(prompt, userContext, classified) {
  const t = (prompt || "").toLowerCase().trim();
  const newsStyle = isNewsStyleQuery(prompt);

  /** @type {LogicRoute} */
  let route = {
    mode: classified.mode,
    label: classified.label,
    kind: classified.kind,
    wantsBriefing: classified.wantsBriefing,
    routeReason: "classified_default",
    suppressStrategist: false,
    suppressMacroFallback: userContext.hasBook || userContext.hasWatchlist,
  };

  if (isWatchlistPerformanceQuery(prompt) && userContext.hasWatchlist) {
    route = {
      mode: "watchlist",
      label: "Watchlist Performance",
      kind: "watchlist",
      wantsBriefing: false,
      routeReason: "watchlist_performance",
      suppressStrategist: true,
      suppressMacroFallback: true,
    };
  } else if (isPortfolioScopedQuery(prompt, userContext) || mentionsPersonalBook(prompt)) {
    const riskDominate = /risks?\s+dominate|dominant risk/i.test(t);
    route = {
      mode: "portfolio",
      label: riskDominate ? "Portfolio Risk" : "Portfolio Logic",
      kind: "portfolio",
      wantsBriefing: false,
      routeReason: "portfolio_personal_scope",
      suppressStrategist: true,
      suppressMacroFallback: true,
    };
  } else if (
    userContext.hasBook &&
    /portfolio|holdings|my book/i.test(t) &&
    !newsStyle &&
    !isExplicitNewsQuery(prompt)
  ) {
    route = {
      mode: "portfolio",
      label: "Portfolio Logic",
      kind: "portfolio",
      wantsBriefing: false,
      routeReason: "portfolio_has_book",
      suppressStrategist: true,
      suppressMacroFallback: true,
    };
  } else if (
    mentionsPersonalWatchlist(prompt) &&
    userContext.hasWatchlist &&
    !isWatchlistPerformanceQuery(prompt)
  ) {
    route = {
      mode: "ticker",
      label: "Ticker Intelligence",
      kind: "ticker",
      wantsBriefing: newsStyle,
      routeReason: "watchlist_personal_scope",
      suppressStrategist: true,
      suppressMacroFallback: true,
    };
  } else if (
    route.suppressMacroFallback &&
    classified.mode === "macro-interpretation" &&
    !isStrategistInterpretationQuery(prompt) &&
    !/what breaks first|hidden fragil|underpric|consensus|crowded/i.test(t)
  ) {
    route = {
      mode: userContext.hasBook ? "portfolio" : "market-pulse",
      label: userContext.hasBook ? "Portfolio Logic" : "Market Pulse",
      kind: userContext.hasBook ? "portfolio" : "market_pulse",
      wantsBriefing: false,
      routeReason: "blocked_macro_fallback",
      suppressStrategist: true,
      suppressMacroFallback: true,
    };
  }

  if (
    route.suppressStrategist &&
    isStrategistInterpretationQuery(prompt) &&
    !isExplicitNewsQuery(prompt) &&
    route.mode !== "macro-interpretation"
  ) {
    route.suppressStrategist = true;
  }

  logicDebug("planLogicRoute", {
    mode: route.mode,
    reason: route.routeReason,
    suppressMacro: route.suppressMacroFallback,
  });

  return route;
}

/**
 * Merge context-first route into classification for downstream planners.
 * @param {import('../questionIntent.js').QuestionClassification} classified
 * @param {LogicRoute} route
 */
export function applyLogicRoute(classified, route) {
  return {
    kind: route.kind,
    mode: route.mode,
    label: route.label,
    wantsBriefing: route.wantsBriefing,
  };
}
