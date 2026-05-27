/**
 * Conversational presentation — primary answer, selective insights, follow-ups.
 * Intelligence engines unchanged; this shapes what the UI shows.
 * @module logic/engines/conversationalPresentation
 */

import { concise } from "./topicContext.js";

/**
 * @typedef {Object} ConversationalInsight
 * @property {string} id
 * @property {string} label
 * @property {string} text
 */

/**
 * @typedef {Object} ConversationalPresentation
 * @property {string} primaryAnswer
 * @property {ConversationalInsight[]} supportingInsights
 * @property {string[]} exploreNext
 */

const FOLLOW_UP_BANK = {
  portfolio_risk: [
    "Which holdings are most sensitive to liquidity tightening?",
    "What happens if AI leadership weakens?",
    "What regime benefits this portfolio?",
    "Where is concentration risk highest?",
  ],
  regime_fit: [
    "What regime hurts this book the most?",
    "Which factor would flip the regime read?",
    "How exposed is this portfolio to rates?",
    "What breaks first if growth slows?",
  ],
  portfolio_stress: [
    "What happens if financial conditions tighten further?",
    "Which sleeve de-risks first?",
    "How does liquidity stress transmit to mega-cap growth?",
    "What would stabilize this book?",
  ],
  portfolio: [
    "What risks dominate this portfolio?",
    "What regime fits this book?",
    "Where is concentration highest?",
    "What happens if volatility resets higher?",
  ],
  watchlist_performance: [
    "Which watchlist name has the weakest trend?",
    "What macro driver explains today's dispersion?",
    "Which symbol is most headline-sensitive?",
    "How does the laggard compare to sector peers?",
  ],
  strategist_interpretation: [
    "What trade looks most overcrowded?",
    "What risk is the market ignoring?",
    "What breaks first if liquidity tightens?",
    "Where is positioning most one-sided?",
  ],
  positioning_crowding: [
    "What would force a de-gross?",
    "Which sector is most crowded?",
    "What catalyst unwinds consensus?",
    "Where is asymmetry highest?",
  ],
  fragility: [
    "What breaks first if conditions shift?",
    "What is markets' blind spot?",
    "Which asset class gaps first?",
    "What would confirm fragility?",
  ],
  macro_interpretation: [
    "What are markets expecting on policy?",
    "How do higher real yields affect growth stocks?",
    "What happens if the Fed stays higher for longer?",
    "Which sectors benefit from falling yields?",
  ],
  briefing: [
    "What matters most for the next session?",
    "Which sector leads on this headline?",
    "How does this affect rates and FX?",
    "What is the second-order market read?",
  ],
  rates: [
    "What are markets expecting from Powell?",
    "How do higher real yields affect growth stocks?",
    "What happens if the Fed stays higher for longer?",
    "Which sectors benefit from falling yields?",
  ],
  ticker: [
    "What is the main catalyst from here?",
    "How does this name trade vs its sector?",
    "What macro channel matters most?",
    "What would change the narrative?",
  ],
  scenario: [
    "Which sectors win in this scenario?",
    "What is the first market break?",
    "How does volatility respond?",
    "What portfolio sleeve is most exposed?",
  ],
  market_pulse: [
    "What matters most on today's tape?",
    "Where is breadth weakest?",
    "What is the cross-asset tell?",
    "What would shift risk appetite?",
  ],
  ranked_list: [
    "What macro regime supports this list?",
    "Which names have the weakest risk/reward?",
    "What would invalidate this ranking?",
    "Where is crowding highest in this group?",
  ],
  default: [
    "What is the main risk from here?",
    "What would change this read?",
    "Which sector leads the move?",
    "What should I watch next session?",
  ],
};

/**
 * @param {string} text
 * @param {number} max
 */
function pickText(text, max = 220) {
  const t = String(text || "").trim();
  if (!t || /indices tracked|volatility monitored|policy and inflation path dominate/i.test(t)) {
    return "";
  }
  return concise(t, max);
}

/**
 * @param {import('../types.js').LogicResponse} res
 * @param {ConversationalInsight[]} list
 * @param {string} id
 * @param {string} label
 * @param {string} text
 */
function pushInsight(list, id, label, text) {
  if (list.length >= 3) return;
  const body = pickText(text);
  if (!body) return;
  if (list.some((x) => x.id === id)) return;
  list.push({ id, label, text: body });
}

/**
 * @param {import('../types.js').LogicResponse} res
 * @param {object} ctx
 * @param {string} intentId
 * @returns {ConversationalInsight[]}
 */
function buildSupportingInsights(res, ctx, intentId) {
  const cards = res.cards || {};
  const opt = res.optionalCards || {};
  const drivers = res.keyDrivers || [];
  const signals = res.signals || [];
  /** @type {ConversationalInsight[]} */
  const insights = [];

  if (intentId === "portfolio_risk" || intentId === "portfolio") {
    pushInsight(insights, "primary_risk", "PRIMARY RISK", opt.riskSignal || signals[0] || drivers[0]);
    pushInsight(
      insights,
      "breaks_first",
      "WHAT BREAKS FIRST",
      cards.catalyst || cards.sectorImpact || signals[1]
    );
    pushInsight(
      insights,
      "macro_sensitivity",
      "MACRO SENSITIVITY",
      cards.macroContext || cards.volatility || opt.portfolioImpact
    );
  } else if (intentId === "regime_fit") {
    pushInsight(insights, "regime_helps", "REGIME THAT HELPS", cards.catalyst || cards.snapshot);
    pushInsight(insights, "regime_hurts", "REGIME THAT HURTS", cards.sectorImpact || cards.volatility);
    pushInsight(insights, "key_dependency", "KEY DEPENDENCY", cards.macroContext || opt.portfolioImpact);
  } else if (intentId === "portfolio_stress") {
    pushInsight(insights, "stress_path", "STRESS PATH", cards.catalyst || cards.snapshot);
    pushInsight(insights, "first_break", "WHAT BREAKS FIRST", cards.sectorImpact || opt.stressSignal);
    pushInsight(insights, "transmission", "TRANSMISSION", cards.volatility || cards.macroContext);
  } else if (intentId === "watchlist_performance") {
    pushInsight(insights, "top", "TOP PERFORMER", signals[0] || cards.snapshot);
    pushInsight(insights, "laggard", "LAGGARD", signals[1] || cards.catalyst);
    pushInsight(insights, "driver", "DRIVER", cards.sectorImpact || opt.relatedMovers);
  } else if (
    intentId === "strategist_interpretation" ||
    intentId === "positioning_crowding" ||
    intentId === "macro_interpretation" ||
    intentId === "fragility"
  ) {
    pushInsight(insights, "setup", "SETUP", cards.catalyst);
    pushInsight(insights, "mechanism", "MECHANISM", cards.macroContext || cards.sectorImpact);
    pushInsight(insights, "watch", "WHAT TO WATCH", cards.volatility || opt.riskSignal || cards.aiSummary);
  } else if (res.mode === "briefing" || intentId === "briefing") {
    pushInsight(insights, "headline", "HEADLINE", cards.catalyst || cards.snapshot);
    pushInsight(insights, "market_read", "MARKET READ", cards.macroContext || cards.sectorImpact);
    pushInsight(insights, "vol", "VOLATILITY", cards.volatility);
  } else if (res.mode === "ticker") {
    pushInsight(insights, "move", "PRICE ACTION", cards.snapshot || cards.catalyst);
    pushInsight(insights, "catalyst", "CATALYST", cards.catalyst || cards.macroContext);
    pushInsight(insights, "risk", "RISK", cards.volatility || opt.riskSignal);
  } else if (res.mode === "scenario") {
    pushInsight(insights, "scenario", "SCENARIO", cards.snapshot);
    pushInsight(insights, "impact", "MARKET IMPACT", cards.catalyst || cards.sectorImpact);
    pushInsight(insights, "vol", "VOL OUTLOOK", cards.volatility);
  } else {
    pushInsight(insights, "driver", "KEY DRIVER", drivers[0] || cards.catalyst);
    pushInsight(insights, "context", "CONTEXT", cards.macroContext || cards.sectorImpact);
    pushInsight(insights, "risk", "RISK CHANNEL", cards.volatility || opt.riskSignal);
  }

  if (!insights.length) {
    pushInsight(insights, "signal", "SIGNAL", signals[0] || drivers[0]);
    pushInsight(insights, "context", "CONTEXT", cards.sectorImpact || cards.macroContext);
  }

  return insights.slice(0, 3);
}

/**
 * @param {string} intentId
 * @param {import('../types.js').LogicResponse} res
 * @param {object} ctx
 */
function buildExploreNext(intentId, res, ctx) {
  const bank = FOLLOW_UP_BANK[intentId] || FOLLOW_UP_BANK[res.mode] || FOLLOW_UP_BANK.default;
  const prompt = (ctx?.prompt || "").toLowerCase();
  /** @type {string[]} */
  const out = [];

  for (const q of bank) {
    if (out.length >= 4) break;
    if (prompt && q.toLowerCase().includes(prompt.slice(0, 24))) continue;
    out.push(q);
  }

  const sym = ctx?.primaryEntity?.symbol;
  if (sym && out.length < 4 && res.mode === "ticker") {
    out.push(`What is the main catalyst for ${sym} from here?`);
  }

  const top = ctx?.portfolioMemory?.topSymbols?.[0];
  if (top && out.length < 4 && /portfolio/i.test(intentId)) {
    out.push(`How sensitive is ${top} to a rates shock?`);
  }

  return out.slice(0, 4);
}

/**
 * @param {import('../types.js').LogicResponse} res
 * @param {object} [ctx]
 * @returns {ConversationalPresentation}
 */
export function buildConversationalPresentation(res, ctx = {}) {
  const plan = ctx.responsePlan;
  const intentId = plan?.intentId || res.responseIntent || res.mode || "default";
  const prompt = (ctx.prompt || "").toLowerCase();
  const isRankedList =
    /top\s+\d+|best\s+\d+|\d+\s+stocks?\s+to\s+buy|stocks?\s+to\s+buy|ranked\s+list/i.test(prompt);

  let primary =
    res.directAnswer ||
    res.summary ||
    res.cards?.snapshot ||
    "";

  primary = pickText(primary, isRankedList ? 520 : 420);

  if (!primary && res.cards?.aiSummary) {
    primary = pickText(res.cards.aiSummary, 420);
  }

  let supportingInsights = buildSupportingInsights(res, ctx, intentId);
  if (isRankedList) {
    supportingInsights = supportingInsights.slice(0, 2);
    if (!supportingInsights.length && res.signals?.[0]) {
      pushInsight(supportingInsights, "context", "CONTEXT", res.signals[0]);
    }
  }

  const exploreNext = buildExploreNext(isRankedList ? "ranked_list" : intentId, res, ctx);

  return {
    primaryAnswer: primary,
    supportingInsights,
    exploreNext,
  };
}
