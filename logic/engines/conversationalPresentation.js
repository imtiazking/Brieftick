/**
 * Conversational presentation — one primary answer; enrichment stays dormant until chip tap.
 * Engines unchanged; only shapes preview UI disclosure.
 * @module logic/engines/conversationalPresentation
 */

import { concise } from "./topicContext.js";

/**
 * @typedef {Object} FollowUpChip
 * @property {string} id
 * @property {string} label
 * @property {string} text
 * @property {string} [deepPrompt]
 */

/**
 * @typedef {Object} ConversationalPresentation
 * @property {string} primaryAnswer
 * @property {FollowUpChip[]} followUpChips
 * @property {'brief'|'standard'|'deep'} depth
 */

const GENERIC_FILLER =
  /indices tracked|volatility monitored|policy and inflation path|sector beta and peer|headline and catalyst channel|rates, policy, and inflation|anchor the tape|shape relative moves/i;

/**
 * @param {string} text
 * @param {number} max
 */
function pickText(text, max = 320) {
  const t = String(text || "").trim();
  if (!t || GENERIC_FILLER.test(t)) return "";
  return concise(t, max);
}

/**
 * @param {string} prompt
 * @param {string} intentId
 * @returns {'brief'|'standard'|'deep'}
 */
export function resolveAnswerDepth(prompt, intentId) {
  const t = (prompt || "").toLowerCase();
  const deepIntent = new Set([
    "portfolio_risk",
    "portfolio_stress",
    "regime_fit",
    "fragility",
    "positioning_crowding",
    "strategist_interpretation",
  ]);
  if (
    deepIntent.has(intentId) ||
    /fragil|hidden risk|what breaks|dominate.*risk|stress test|liquidity tighten|concentrat|regime fit|what would hurt|underpric|crowded trade/i.test(
      t
    )
  ) {
    return "deep";
  }
  if (
    (/^(why is|why are|what happened to|why did)\b/i.test(t) && /mov|moving|down|up|today/i.test(t)) ||
    (/why\b.*\bmov/i.test(t) && !/portfolio|watchlist|fragil|stress|regime/i.test(t))
  ) {
    return "brief";
  }
  return "standard";
}

/**
 * @param {FollowUpChip[]} chips
 * @param {string} id
 * @param {string} label
 * @param {string} text
 * @param {string} [deepPrompt]
 */
function pushChip(chips, id, label, text, deepPrompt) {
  if (chips.some((c) => c.id === id)) return;
  const body = pickText(text, 480);
  if (!body) return;
  chips.push({ id, label, text: body, deepPrompt });
}

/**
 * @param {import('../types.js').LogicResponse} res
 * @param {string} intentId
 * @param {object} ctx
 * @returns {FollowUpChip[]}
 */
function buildFollowUpChips(res, intentId, ctx) {
  const cards = res.cards || {};
  const opt = res.optionalCards || {};
  const drivers = (res.keyDrivers || []).filter((d) => d && !GENERIC_FILLER.test(d));
  const signals = (res.signals || []).filter(Boolean);
  const sym = ctx?.primaryEntity?.symbol || res.primarySymbol || "";
  /** @type {FollowUpChip[]} */
  const chips = [];

  if (res.mode === "ticker" || intentId === "ticker") {
    pushChip(chips, "catalyst", "Catalyst", cards.catalyst || drivers[0]);
    pushChip(
      chips,
      "earnings",
      "Earnings",
      drivers.find((d) => /earn|guidance|revenue/i.test(d)) ||
        signals.find((s) => /earn|guidance/i.test(s)) ||
        cards.catalyst
    );
    pushChip(chips, "risk", "Risk", cards.volatility || opt.riskSignal || drivers[1]);
    pushChip(chips, "positioning", "Positioning", opt.riskSignal || opt.marketStructure);
    pushChip(chips, "sector", "Sector", cards.sectorImpact || opt.relatedMovers);
    pushChip(chips, "crossAsset", "Cross-Asset", opt.crossAssetSignal || cards.macroContext);
    pushChip(chips, "supplyChain", "Supply Chain", opt.portfolioImpact || opt.narrativeLink);
    pushChip(chips, "stress", "Stress Signal", opt.stressSignal);
  } else if (res.mode === "portfolio" || /^portfolio/.test(intentId)) {
    pushChip(chips, "breaksFirst", "What breaks first?", cards.catalyst || drivers[0]);
    pushChip(chips, "liquidity", "Liquidity sensitivity", cards.volatility || cards.macroContext);
    pushChip(chips, "concentration", "Concentration risk", cards.sectorImpact || opt.portfolioImpact);
    pushChip(chips, "regimeFit", "Regime fit", cards.macroContext || cards.snapshot);
    pushChip(chips, "volExposure", "Volatility exposure", cards.volatility || opt.riskSignal);
    pushChip(chips, "positioning", "Positioning", opt.riskSignal);
    pushChip(chips, "stress", "Stress Signal", opt.stressSignal);
  } else if (
    res.mode === "macro-interpretation" ||
    intentId === "macro_interpretation" ||
    intentId === "rates" ||
    /fed|powell|fomc|rate/i.test(ctx?.prompt || "")
  ) {
    pushChip(chips, "powell", "Powell expectations", cards.catalyst || cards.snapshot);
    pushChip(chips, "inflation", "Inflation path", cards.macroContext || drivers[0]);
    pushChip(chips, "yields", "Yield sensitivity", cards.sectorImpact || cards.volatility);
    pushChip(chips, "rateCuts", "Rate-cut probabilities", cards.volatility || opt.crossAssetSignal);
    pushChip(chips, "positioning", "Positioning", opt.riskSignal);
    pushChip(chips, "crossAsset", "Cross-Asset", opt.crossAssetSignal);
  } else if (res.mode === "watchlist" || intentId === "watchlist_performance") {
    pushChip(chips, "rank", "Full rank", cards.sectorImpact || res.summary);
    pushChip(chips, "driver", "Macro driver", cards.macroContext || cards.catalyst);
    pushChip(chips, "volatility", "Volatility", cards.volatility);
    pushChip(chips, "sector", "Sector context", cards.sectorImpact);
  } else if (res.mode === "scenario") {
    pushChip(chips, "impact", "Market impact", cards.catalyst || cards.sectorImpact);
    pushChip(chips, "volatility", "Volatility", cards.volatility);
    pushChip(chips, "sectors", "Sector winners", cards.sectorImpact);
    pushChip(chips, "portfolio", "Portfolio impact", opt.portfolioImpact);
  } else if (res.mode === "briefing") {
    pushChip(chips, "headline", "Headline", cards.catalyst || cards.snapshot);
    pushChip(chips, "marketRead", "Market read", cards.macroContext || cards.sectorImpact);
    pushChip(chips, "volatility", "Volatility", cards.volatility);
    pushChip(chips, "crossAsset", "Cross-Asset", opt.crossAssetSignal);
  } else {
    pushChip(chips, "catalyst", "Catalyst", cards.catalyst || drivers[0]);
    pushChip(chips, "macro", "Macro Context", cards.macroContext);
    pushChip(chips, "sector", "Sector Impact", cards.sectorImpact);
    pushChip(chips, "volatility", "Volatility", cards.volatility);
    pushChip(chips, "risk", "Risk", opt.riskSignal || cards.volatility);
    pushChip(chips, "positioning", "Positioning", opt.riskSignal);
    pushChip(chips, "crossAsset", "Cross-Asset", opt.crossAssetSignal);
    pushChip(chips, "stress", "Stress Signal", opt.stressSignal);
  }

  if (sym && chips.length < 8) {
    for (const c of chips) {
      if (!c.deepPrompt) {
        c.deepPrompt = `Explain ${c.label.toLowerCase()} for ${sym} in more depth.`;
      }
    }
  }

  return chips.slice(0, 8);
}

/**
 * @param {import('../types.js').LogicResponse} res
 * @param {object} [ctx]
 * @returns {ConversationalPresentation}
 */
export function buildConversationalPresentation(res, ctx = {}) {
  const plan = ctx.responsePlan;
  const intentId = plan?.intentId || res.responseIntent || res.mode || "default";
  const prompt = ctx.prompt || "";
  const depth = resolveAnswerDepth(prompt, intentId);

  const maxByDepth = depth === "brief" ? 220 : depth === "deep" ? 560 : 380;

  let primary =
    res.directAnswer ||
    res.summary ||
    pickText(res.cards?.snapshot, maxByDepth) ||
    "";

  primary = pickText(primary, maxByDepth);

  if (!primary && res.cards?.aiSummary) {
    primary = pickText(res.cards.aiSummary, maxByDepth);
  }

  const followUpChips = buildFollowUpChips(res, intentId, ctx);

  return {
    primaryAnswer: primary,
    followUpChips,
    depth,
  };
}
