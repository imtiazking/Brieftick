/**
 * Conversational presentation — one primary answer; enrichment stays dormant until chip tap.
 * Engines unchanged; only shapes preview UI disclosure.
 * @module logic/engines/conversationalPresentation
 */

import { concise } from "./topicContext.js";
import { humanizeLogicAnswer, resolveAnswerDepth, limitsForDepth } from "./conversationalVoice.js";
import { classifyResponseDepthIntent } from "./responseDepthIntent.js";

export { resolveAnswerDepth };

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
  /indices tracked|volatility monitored|policy and inflation path|sector beta and peer|headline and catalyst channel|rates, policy, and inflation|anchor the tape|shape relative moves|in focus on today'?s tape|headline sensitivity|sector beta remain|macro rates framing|live feeds connect|contextual read while|catalyst sensitivity plus sector beta|is moving with broader|no clear company-specific catalyst|broader sentiment today/i;

/**
 * @param {string} text
 * @param {number} max
 */
function pickText(text, max = 320, depth = "standard") {
  const t = humanizeLogicAnswer(String(text || "").trim(), { depth, maxChars: max });
  if (!t || GENERIC_FILLER.test(t)) return "";
  return t;
}

/**
 * @param {FollowUpChip[]} chips
 * @param {string} id
 * @param {string} label
 * @param {string} text
 * @param {string} [deepPrompt]
 */
function pushChip(chips, id, label, text, deepPrompt, depth = "standard") {
  if (chips.some((c) => c.id === id)) return;
  const body = pickText(text, 480, depth);
  if (!body) return;
  chips.push({ id, label, text: body, deepPrompt });
}

/**
 * @param {import('../types.js').LogicResponse} res
 * @param {string} intentId
 * @param {object} ctx
 * @returns {FollowUpChip[]}
 */
/** Standard exploration chips — dormant until tap; no report grid. */
const TICKER_EXPLORATION_CHIPS = [
  ["catalyst", "Catalyst", "catalyst"],
  ["earnings", "Earnings", "earnings"],
  ["risk", "Risk", "volatility"],
  ["sector", "Sector", "sectorImpact"],
  ["guidance", "Guidance", "guidance"],
  ["positioning", "Positioning", "positioning"],
];

function buildFollowUpChips(res, intentId, ctx, depth = "standard") {
  const cards = res.cards || {};
  const opt = res.optionalCards || {};
  const drivers = (res.keyDrivers || []).filter((d) => d && !GENERIC_FILLER.test(d));
  const signals = (res.signals || []).filter(Boolean);
  const sym = ctx?.primaryEntity?.symbol || res.primarySymbol || "";
  /** @type {FollowUpChip[]} */
  const chips = [];

  const chipDepth = depth === "brief" ? "standard" : depth;
  const add = (id, label, text, deepPrompt) =>
    pushChip(chips, id, label, text, deepPrompt, chipDepth);

  const pickGuidance = () =>
    drivers.find((d) => /guidance|outlook|revenue|earn/i.test(d)) ||
    signals.find((s) => /guidance|earn/i.test(s)) ||
    cards.catalyst;

  if (res.mode === "ticker" || intentId === "ticker" || res.responseDepthIntent === "quick_move" || res.responseDepthIntent === "latest_context") {
    for (const [id, label, key] of TICKER_EXPLORATION_CHIPS) {
      let text = cards[key];
      if (key === "earnings") {
        text =
          drivers.find((d) => /earn|guidance|revenue/i.test(d)) ||
          signals.find((s) => /earn|guidance/i.test(s)) ||
          cards.catalyst;
      } else if (key === "volatility") {
        text = cards.volatility || opt.riskSignal || drivers[1];
      } else if (key === "sectorImpact") {
        text = cards.sectorImpact || opt.relatedMovers;
      } else if (key === "guidance") {
        text = pickGuidance();
      } else if (key === "positioning") {
        text = opt.riskSignal || opt.marketStructure;
      }
      add(id, label, text);
    }
  } else if (res.mode === "portfolio" || /^portfolio/.test(intentId)) {
    add("breaksFirst", "What breaks first?", cards.catalyst || drivers[0]);
    add("liquidity", "Liquidity sensitivity", cards.volatility || cards.macroContext);
    add("concentration", "Concentration risk", cards.sectorImpact || opt.portfolioImpact);
    add("regimeFit", "Regime fit", cards.macroContext || cards.snapshot);
    add("volExposure", "Volatility exposure", cards.volatility || opt.riskSignal);
    add("positioning", "Positioning", opt.riskSignal);
    add("stress", "Stress Signal", opt.stressSignal);
  } else if (
    res.mode === "macro-interpretation" ||
    intentId === "macro_interpretation" ||
    intentId === "rates" ||
    /fed|powell|fomc|rate/i.test(ctx?.prompt || "")
  ) {
    add("powell", "Powell expectations", cards.catalyst || cards.snapshot);
    add("inflation", "Inflation path", cards.macroContext || drivers[0]);
    add("yields", "Yield sensitivity", cards.sectorImpact || cards.volatility);
    add("rateCuts", "Rate-cut probabilities", cards.volatility || opt.crossAssetSignal);
    add("positioning", "Positioning", opt.riskSignal);
    add("crossAsset", "Cross-Asset", opt.crossAssetSignal);
  } else if (res.mode === "watchlist" || intentId === "watchlist_performance") {
    add("rank", "Full rank", cards.sectorImpact || res.summary);
    add("driver", "Macro driver", cards.macroContext || cards.catalyst);
    add("volatility", "Volatility", cards.volatility);
    add("sector", "Sector context", cards.sectorImpact);
  } else if (res.mode === "scenario") {
    add("impact", "Market impact", cards.catalyst || cards.sectorImpact);
    add("volatility", "Volatility", cards.volatility);
    add("sectors", "Sector winners", cards.sectorImpact);
    add("portfolio", "Portfolio impact", opt.portfolioImpact);
  } else if (res.mode === "briefing") {
    add("headline", "Headline", cards.catalyst || cards.snapshot);
    add("marketRead", "Market read", cards.macroContext || cards.sectorImpact);
    add("volatility", "Volatility", cards.volatility);
    add("crossAsset", "Cross-Asset", opt.crossAssetSignal);
  } else {
    add("catalyst", "Catalyst", cards.catalyst || drivers[0]);
    add("macro", "Macro", cards.macroContext);
    add("sector", "Sector", cards.sectorImpact);
    add("volatility", "Volatility", cards.volatility);
    add("risk", "Risk", opt.riskSignal || cards.volatility);
    add("positioning", "Positioning", opt.riskSignal);
    add("crossAsset", "Cross-Asset", opt.crossAssetSignal);
    add("stress", "Stress Signal", opt.stressSignal);
  }

  if (sym && chips.length < 8) {
    for (const c of chips) {
      if (!c.deepPrompt) {
        c.deepPrompt = `Explain ${c.label.toLowerCase()} for ${sym} in more depth.`;
      }
    }
  }

  return chips.slice(0, 6);
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
  const depthProfile =
    ctx.depthProfile ||
    plan?.depthProfile ||
    classifyResponseDepthIntent(prompt, {
      classified: ctx.classified,
      primaryEntity: ctx.primaryEntity,
      mode: res.mode,
    });
  const depth = resolveAnswerDepth(prompt, intentId, depthProfile);
  const limits = limitsForDepth(depth, depthProfile);

  let primary =
    res.directAnswer ||
    res.summary ||
    pickText(res.cards?.snapshot, limits.maxChars, depth) ||
    "";

  primary = humanizeLogicAnswer(primary, { depthProfile, depth });

  if (!primary && res.cards?.aiSummary) {
    primary = humanizeLogicAnswer(res.cards.aiSummary, { depthProfile, depth });
  }

  const followUpChips = buildFollowUpChips(res, intentId, ctx, depth);

  return {
    primaryAnswer: primary,
    followUpChips,
    depth,
    depthIntent: depthProfile.intent,
  };
}
