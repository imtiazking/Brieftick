/**
 * User context — portfolio book + watchlist resolved before routing.
 * @module logic/engines/userContext
 */

import { getLogicWatchlist, resolveWatchlistForQuery } from "../watchlistStore.js";
import { hasExplicitPortfolio, resolvePortfolioContext } from "./inferredPortfolioContext.js";
import { logicDebug } from "../shared.js";

/**
 * @typedef {Object} UserContext
 * @property {import('./inferredPortfolioContext.js').ResolvedPortfolioContext} portfolioContext
 * @property {string[]} watchlistSymbols
 * @property {boolean} hasExplicitBook
 * @property {boolean} hasInferredBook
 * @property {boolean} hasBook
 * @property {boolean} hasWatchlist
 * @property {boolean} personalScope
 * @property {'saved'|'dashboard'|'prompt'|'empty'} [watchlistSource]
 */

const PERSONAL_BOOK =
  /\b(my|this)\s+(portfolio|book|holdings)\b|\bportfolio\b.*\b(my|this)\b|analyze my portfolio|my book\b/i;

const PERSONAL_WATCHLIST =
  /\b(my|our)\s+watchlist\b|\bwatchlist\b.*\b(my|mine)\b|\bout of my watchlist\b|\bon my watchlist\b|\bfrom my watchlist\b/i;

const PORTFOLIO_RISK_SCOPE =
  /\b(this|my)\s+portfolio\b|risks?\s+dominate.*portfolio|portfolio.*risks?\s+dominate|dominant risk.*portfolio|what would hurt my portfolio|how exposed.*portfolio/i;

/**
 * @param {string} prompt
 */
export function mentionsPersonalBook(prompt) {
  const t = (prompt || "").toLowerCase();
  return PERSONAL_BOOK.test(t) || PORTFOLIO_RISK_SCOPE.test(t);
}

/**
 * @param {string} prompt
 */
export function mentionsPersonalWatchlist(prompt) {
  return PERSONAL_WATCHLIST.test((prompt || "").toLowerCase());
}

/**
 * @param {string} prompt
 */
export function isWatchlistPerformanceQuery(prompt) {
  const t = (prompt || "").toLowerCase().trim();
  if (!t) return false;

  const perfSignal =
    /best\s+perform|worst\s+perform|best\s+performing|worst\s+performing|performing\s+best|performing\s+worst|top\s+perform|outperform|underperform|biggest\s+(gainer|loser)|best\s+stock|worst\s+stock|which\s+stock.*best|which\s+.*\s+best|best\s+.*\s+stock|rank.*watchlist|performing\s+(best|worst)|top\s+gainer|top\s+loser|weakest|strongest|leading|lagging|trend/i;

  const watchlistSignal =
    /\bwatchlist\b|\bmy\s+list\b|\bsymbols\s+i('m| am)\s+watching\b|\btickers\s+i('m| am)\s+watching\b/i;

  if (watchlistSignal.test(t) && perfSignal.test(t)) return true;
  if (/out of my watchlist|on my watchlist|from my watchlist/i.test(t) && perfSignal.test(t)) {
    return true;
  }
  if (/\bwatchlist\b/i.test(t) && /(best|worst|top|rank|gainer|loser|perform|weakest|strongest|trend)/i.test(t)) {
    return true;
  }
  if (/which\s+(stock|name|ticker).*\bwatchlist\b/i.test(t)) return true;

  return false;
}

/**
 * Portfolio-scoped risk / exposure questions when user has a book (saved or inferred).
 * @param {string} prompt
 * @param {UserContext} [ctx]
 */
export function isPortfolioScopedQuery(prompt, ctx) {
  const t = (prompt || "").toLowerCase();
  const hasBook = ctx?.hasBook ?? false;
  if (!hasBook && !mentionsPersonalBook(prompt)) return false;

  if (
    /risks?\s+dominate|dominant risk|what risks matter|what would hurt|regime benefit|regime fits|liquidity tighten|what happens if.*tighten|financial conditions tighten|concentrat|diversif|how exposed|vulnerable.*portfolio/i.test(
      t
    ) &&
    (/portfolio|holdings|my book|this book/i.test(t) || mentionsPersonalBook(prompt) || hasBook)
  ) {
    return true;
  }

  if (hasBook && /portfolio|holdings|my book/i.test(t) && /risk|exposed|regime|concentrat/i.test(t)) {
    return true;
  }

  return false;
}

/**
 * @returns {UserContext}
 */
/**
 * @param {string} [prompt]
 */
export function resolveUserContext(prompt) {
  const portfolioContext = resolvePortfolioContext();
  const stored = getLogicWatchlist();
  const watchlistResolved = resolveWatchlistForQuery(prompt, stored);
  const watchlistSymbols = watchlistResolved.symbols;
  const hasExplicitBook = portfolioContext.source === "explicit";
  const hasInferredBook =
    portfolioContext.source === "inferred_watchlist" && watchlistSymbols.length > 0;
  const hasBook = hasExplicitBook || hasInferredBook;
  const hasWatchlist = watchlistSymbols.length > 0;
  const personalScope = hasBook || hasWatchlist;

  const ctx = {
    portfolioContext,
    watchlistSymbols,
    watchlistSource: watchlistResolved.source,
    hasExplicitBook,
    hasInferredBook,
    hasBook,
    hasWatchlist,
    personalScope,
  };

  logicDebug("userContext", {
    source: portfolioContext.source,
    watchlistN: watchlistSymbols.length,
    watchlistSource: watchlistResolved.source,
    resolvedWatchlistSymbols: watchlistSymbols,
    hasBook,
  });

  return ctx;
}
