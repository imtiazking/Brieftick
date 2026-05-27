/**
 * Question intent taxonomy — maps natural language to Logic mode + kind.
 * @module logic/questionIntent
 */

import { resolvePrimaryEntity } from "./entityResolver.js";
import { extractSymbolsFromPrompt } from "./engines/tickerCatalog.js";
import { logicDebug } from "./shared.js";
import { isCausalReasoningQuery } from "./engines/causalReasoningEngine.js";
import { isMacroInterpretationQuery } from "./engines/macroInterpretationEngine.js";
import { isStrategistInterpretationQuery } from "./engines/strategistQueryGate.js";
import {
  isPortfolioScopedQuery,
  isWatchlistPerformanceQuery,
  mentionsPersonalBook,
} from "./engines/userContext.js";

/** @typedef {'news'|'geopolitical'|'macro'|'rates'|'sector'|'supply_chain'|'commodities'|'portfolio'|'scenario'|'ticker'|'risk'|'market_pulse'|'daily_brief'|'causal'|'macro_interpretation'|'watchlist'} QuestionKind */

/**
 * @typedef {Object} QuestionClassification
 * @property {QuestionKind} kind
 * @property {import('./types.js').LogicMode} mode
 * @property {string} label
 * @property {boolean} wantsBriefing
 */

/**
 * @param {string} prompt
 * @returns {boolean}
 */
export function isNewsStyleQuery(prompt) {
  const t = (prompt || "").toLowerCase();
  return (
    /latest\s+(?:on|about|regarding|in|for|with)|what.?'?s the latest|update on|news on|headline|situation in|status of|what.?'?s happening|what is happening|happening with|happening in|current news|any news|tell me about|what happened|what'?s the story|story with|breaking/i.test(
      t
    ) || (/latest|update|news|today/i.test(t) && t.length < 120)
  );
}

/**
 * @param {string} prompt
 * @param {import('./entityResolver.js').ResolvedEntity} [entity]
 * @returns {QuestionClassification}
 */
export function classifyQuestion(prompt, entity, options = {}) {
  const t = (prompt || "").toLowerCase().trim();
  const wl = options.userContext?.watchlistSymbols || [];
  const primary = entity || resolvePrimaryEntity(prompt, { watchlistSymbols: wl });
  const promptTickers = extractSymbolsFromPrompt(prompt, wl);
  const newsStyle = isNewsStyleQuery(prompt);
  const userContext = options.userContext;

  /** @type {QuestionClassification} */
  let result = {
    kind: "market_pulse",
    mode: "market-pulse",
    label: "Market Pulse",
    wantsBriefing: false,
  };

  if (
    promptTickers.length &&
    /why is|why are|what.*driving|moving today|move today|what changed|compare|versus|vs\b|between/i.test(
      t
    ) &&
    !isWatchlistPerformanceQuery(prompt)
  ) {
    result = {
      kind: "ticker",
      mode: "ticker",
      label: "Ticker Intelligence",
      wantsBriefing: false,
    };
  } else if (isWatchlistPerformanceQuery(prompt)) {
    result = {
      kind: "watchlist",
      mode: "watchlist",
      label: "Watchlist Performance",
      wantsBriefing: false,
    };
  } else if (isPortfolioScopedQuery(prompt, userContext) || (userContext?.hasBook && mentionsPersonalBook(prompt))) {
    const riskDominate = /risks?\s+dominate|dominant risk/i.test(t);
    result = {
      kind: "portfolio",
      mode: "portfolio",
      label: riskDominate ? "Portfolio Risk" : "Portfolio Logic",
      wantsBriefing: false,
    };
  } else if (
    userContext?.hasBook &&
    /portfolio|holdings|my book/i.test(t) &&
    !newsStyle
  ) {
    result = { kind: "portfolio", mode: "portfolio", label: "Portfolio Logic", wantsBriefing: false };
  } else if (isStrategistInterpretationQuery(prompt)) {
    result = {
      kind: "macro_interpretation",
      mode: "macro-interpretation",
      label: "Macro Strategist Interpretation",
      wantsBriefing: false,
    };
  } else if (
    /what breaks first|breaks first|first to break|hidden fragil|underpric|what.*markets.*missing/i.test(
      t
    ) &&
    !newsStyle
  ) {
    result = {
      kind: "macro_interpretation",
      mode: "macro-interpretation",
      label: "Macro Interpretation Logic",
      wantsBriefing: false,
    };
  } else if (
    /portfolio|holdings|concentration|diversif|exposure|my book|analyze my portfolio|what risks matter|what risks dominate|how exposed.*(portfolio|rates|ai)|what would hurt|vulnerable.*(portfolio|recession)|concentrated.*ai|risks for my|regime benefit|what regime.*portfolio/i.test(
      t
    ) &&
    !/news on|latest on/.test(t) &&
    !isWatchlistPerformanceQuery(prompt)
  ) {
    result = { kind: "portfolio", mode: "portfolio", label: "Portfolio Logic", wantsBriefing: false };
  } else if (
    /risk regime|market risk|risk-on|risk-off|risk on|risk off|volatility regime|vix|show risk|how risky/i.test(
      t
    )
  ) {
    result = { kind: "risk", mode: "risk-regime", label: "Risk Regime", wantsBriefing: false };
  } else if (
    /daily brief|morning brief|today.?s (market )?brief|session brief|market recap/.test(t) &&
    !/iran|war|oil|fed/i.test(t)
  ) {
    result = { kind: "daily_brief", mode: "daily-brief", label: "Daily Brief", wantsBriefing: false };
  } else if (isMacroInterpretationQuery(prompt)) {
    result = {
      kind: "macro_interpretation",
      mode: "macro-interpretation",
      label: "Macro Interpretation Logic",
      wantsBriefing: false,
    };
  } else if (isCausalReasoningQuery(prompt)) {
    result = {
      kind: "causal",
      mode: "causal",
      label: "Causal Market Logic",
      wantsBriefing: false,
    };
  } else if (
    /what happens if|what if|scenario|hypothetical|if .+ (rises|falls|spikes|cuts|slows)/i.test(t) &&
    !newsStyle &&
    !isCausalReasoningQuery(prompt)
  ) {
    result = { kind: "scenario", mode: "scenario", label: "Scenario Analysis", wantsBriefing: false };
  } else if (
    /iran|ukraine|gaza|israel|hamas|hezbollah|middle east|hormuz|geopolit|sanctions|military strike|war in|conflict in|ceasefire|invasion/i.test(
      t
    )
  ) {
    result = {
      kind: "geopolitical",
      mode: "briefing",
      label: "Geopolitical Briefing",
      wantsBriefing: true,
    };
  } else if (
    /supply chain|shipping|freight|logistics|port congestion|red sea shipping|container|shortage/i.test(t) &&
    !isCausalReasoningQuery(prompt)
  ) {
    result = {
      kind: "supply_chain",
      mode: "briefing",
      label: "Supply Chain Briefing",
      wantsBriefing: true,
    };
  } else if (
    /oil|crude|opec|brent|wti|gold price|copper|commodit|natural gas|lng/i.test(t) &&
    !promptTickers.length
  ) {
    result = {
      kind: "commodities",
      mode: "briefing",
      label: "Commodities Briefing",
      wantsBriefing: true,
    };
  } else if (
    /fed |fomc|interest rate|yields?|treasury|inflation|cpi|pce|real rates|rate cut|rate hike|powell/i.test(t) &&
    !isMacroInterpretationQuery(prompt)
  ) {
    result = {
      kind: "rates",
      mode: "briefing",
      label: "Rates & Inflation",
      wantsBriefing: true,
    };
  } else if (
    /recession|gdp|payrolls|jobs report|macro outlook|economic growth|soft landing|hard landing/i.test(
      t
    ) &&
    !isMacroInterpretationQuery(prompt)
  ) {
    result = {
      kind: "macro",
      mode: "briefing",
      label: "Macro Briefing",
      wantsBriefing: true,
    };
  } else if (
    /sector rotation|leading sector|lagging sector|which sector|tech sector|financials sector|energy sector|semiconductor sector|xl[kfep]/i.test(
      t
    ) ||
    primary.entityType === "sector_theme"
  ) {
    if (newsStyle) {
      result = {
        kind: "sector",
        mode: "briefing",
        label: "Sector Briefing",
        wantsBriefing: true,
      };
    } else {
      result = {
        kind: "sector",
        mode: "sector-rotation",
        label: "Sector Rotation",
        wantsBriefing: false,
      };
    }
  } else if (newsStyle) {
    result = {
      kind: "news",
      mode: "briefing",
      label: "Market News Briefing",
      wantsBriefing: true,
    };
  } else if (
    /market pulse|overall market|market direction|today.?s tape|explain today.?s market|how is the market|session tone/i.test(
      t
    ) &&
    !primary.symbol
  ) {
    result = { kind: "market_pulse", mode: "market-pulse", label: "Market Pulse", wantsBriefing: false };
  } else if (
    /why is|why are|what changed|moving today|move today|latest news|news on|headline/i.test(t) ||
    primary.entityType === "company" ||
    primary.entityType === "ticker" ||
    primary.entityType === "etf" ||
    primary.entityType === "index" ||
    (primary.symbol && !/portfolio|sector rotation|risk regime/.test(t))
  ) {
    result = {
      kind: "ticker",
      mode: "ticker",
      label: "Ticker Intelligence",
      wantsBriefing: newsStyle,
    };
  } else if (primary.entityType === "macro") {
    result = {
      kind: "macro",
      mode: "briefing",
      label: "Macro Briefing",
      wantsBriefing: true,
    };
  } else if (
    t.length > 8 &&
    !isStrategistInterpretationQuery(prompt) &&
    !(userContext?.hasBook || userContext?.hasWatchlist)
  ) {
    result = {
      kind: "macro_interpretation",
      mode: "macro-interpretation",
      label: "Macro Interpretation",
      wantsBriefing: false,
    };
  } else if (
    t.length > 8 &&
    (userContext?.hasBook || userContext?.hasWatchlist) &&
    !isWatchlistPerformanceQuery(prompt)
  ) {
    result = {
      kind: userContext?.hasBook ? "portfolio" : "market_pulse",
      mode: userContext?.hasBook ? "portfolio" : "market-pulse",
      label: userContext?.hasBook ? "Portfolio Logic" : "Market Pulse",
      wantsBriefing: false,
    };
  }

  logicDebug("question classified", result);
  return result;
}
