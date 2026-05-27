/**
 * Lightweight response-depth intent — adapts answer length to how the user asks.
 * @module logic/engines/responseDepthIntent
 */

import { logicDebug } from "../logicDebug.js";
import { isNewsStyleQuery } from "../questionIntent.js";
import { isWatchlistPerformanceQuery } from "./userContext.js";
import { isTickerLikeQuery } from "./tickerResolver.js";

/** @typedef {'quick_move'|'latest_context'|'macro_reasoning'|'portfolio_reasoning'|'watchlist_rank'|'news_explainer'} ResponseDepthIntentId */

/** @typedef {'brief'|'contextual'|'deep'} ResponseDepthLevel */

/**
 * @typedef {Object} ResponseDepthProfile
 * @property {ResponseDepthIntentId} intent
 * @property {ResponseDepthLevel} depth
 * @property {number} maxSentences
 * @property {number} maxChars
 * @property {string} voiceHint
 */

const QUICK_MOVE_RE =
  /\b(why is|why are|why's|why did|what happened to)\b.*\b(mov|moving|move|down|up|weak|strong|lower|higher|rally|drop|fall|rise)\b/i;

const LATEST_CONTEXT_RE =
  /\b(?:latest(?:\s+(?:in|on|for|about|with))?|what'?s happening|what is happening|what'?s the story|story with|update on|current news|any news|what'?s going on|going on with)\b/i;

/**
 * @param {string} prompt
 */
export function isLatestContextQuery(prompt) {
  const t = (prompt || "").toLowerCase();
  return LATEST_CONTEXT_RE.test(t) || (/\blatest\b/i.test(t) && /\b[A-Z]{2,5}\b/.test(prompt || ""));
}

/**
 * @param {string} prompt
 */
export function isQuickMoveQuery(prompt) {
  const t = (prompt || "").toLowerCase();
  if (isLatestContextQuery(prompt)) return false;
  if (/\b(?:latest|story|happening|update on|news on)\b/i.test(t)) return false;
  return (
    QUICK_MOVE_RE.test(t) ||
    (isTickerLikeQuery(prompt) &&
      /\b(why|mov|moving|down|up|weak|strong)\b/i.test(t) &&
      !/\b(?:latest|story|happening)\b/i.test(t))
  );
}

/**
 * @param {string} prompt
 * @param {object} [options]
 * @param {import('../questionIntent.js').QuestionClassification} [options.classified]
 * @param {import('../entityResolver.js').ResolvedEntity} [options.primaryEntity]
 * @returns {ResponseDepthProfile}
 */
export function classifyResponseDepthIntent(prompt, options = {}) {
  const t = (prompt || "").toLowerCase().trim();
  const classified = options.classified;
  const mode = classified?.mode || options.mode || "";
  const kind = classified?.kind || "";
  const hasSymbol = Boolean(options.primaryEntity?.symbol);

  /** @type {ResponseDepthProfile} */
  let profile = {
    intent: "latest_context",
    depth: "contextual",
    maxSentences: 4,
    maxChars: 520,
    voiceHint:
      "Write 2–4 contextual sentences: narrative, sector peer read, what investors are focused on, and macro backdrop only if it matters.",
  };

  if (isWatchlistPerformanceQuery(prompt) || mode === "watchlist" || kind === "watchlist") {
    profile = {
      intent: "watchlist_rank",
      depth: "contextual",
      maxSentences: 4,
      maxChars: 480,
      voiceHint:
        "Summarize watchlist performance in 2–4 sentences: leaders/laggards, macro driver, and vol tone.",
    };
  } else if (
    mode === "portfolio" ||
    kind === "portfolio" ||
    /\b(?:risks?\s+dominate|dominant risk|what breaks|breaks first|fragil|stress test|liquidity tighten|regime benefit|what would hurt|concentrat|hidden risk)\b/i.test(
      t
    )
  ) {
    profile = {
      intent: "portfolio_reasoning",
      depth: "deep",
      maxSentences: 6,
      maxChars: 640,
      voiceHint:
        "Deeper portfolio strategist reasoning is appropriate: concentration, regime, liquidity, and what breaks first — still plain prose, no report headers.",
    };
  } else if (
    mode === "macro-interpretation" ||
    mode === "causal" ||
    kind === "macro_interpretation" ||
    kind === "causal" ||
    /\b(?:what breaks|underpric|crowded|positioning|strategist|interpret)\b/i.test(t)
  ) {
    profile = {
      intent: "macro_reasoning",
      depth: "deep",
      maxSentences: 6,
      maxChars: 620,
      voiceHint:
        "Macro strategist depth: 4–6 sentences on transmission, positioning, and what markets may be underweighting.",
    };
  } else if (isQuickMoveQuery(prompt)) {
    profile = {
      intent: "quick_move",
      depth: "brief",
      maxSentences: 2,
      maxChars: 280,
      voiceHint:
        "Exactly 1–2 concise sentences: fast explanation of today's move. No sector essay, no report labels.",
    };
  } else if (isLatestContextQuery(prompt) || (hasSymbol && isNewsStyleQuery(prompt))) {
    profile = {
      intent: "latest_context",
      depth: "contextual",
      maxSentences: 4,
      maxChars: 520,
      voiceHint:
        "Write 2–4 richer sentences: company/peer context, sector narrative, investor focus, and macro only if relevant. Example tone: in line with peers, no dominant company catalyst, sector pricing trends shaping sentiment.",
    };
  } else if (
    kind === "news" ||
    kind === "geopolitical" ||
    kind === "rates" ||
    kind === "macro" ||
    classified?.wantsBriefing
  ) {
    profile = {
      intent: "news_explainer",
      depth: "contextual",
      maxSentences: 4,
      maxChars: 500,
      voiceHint:
        "News explainer: 2–4 sentences on what matters now, market read-through, and cross-asset context.",
    };
  } else if (mode === "ticker" && hasSymbol) {
    profile = {
      intent: "latest_context",
      depth: "contextual",
      maxSentences: 3,
      maxChars: 420,
      voiceHint: "Answer in 2–3 contextual sentences for the named symbol.",
    };
  }

  logicDebug("responseDepthIntent", {
    intent: profile.intent,
    depth: profile.depth,
    maxSentences: profile.maxSentences,
    prompt: prompt.slice(0, 100),
  });

  return profile;
}

/**
 * Map depth profile to legacy brief/standard/deep for older call sites.
 * @param {ResponseDepthProfile} profile
 * @returns {'brief'|'standard'|'deep'}
 */
export function depthProfileToLegacy(profile) {
  if (!profile) return "standard";
  if (profile.depth === "brief") return "brief";
  if (profile.depth === "deep") return "deep";
  return "standard";
}

/**
 * @param {ResponseDepthProfile} [profile]
 */
export function getLogicVoiceRulesForDepth(profile) {
  if (!profile) return "";
  return `
VOICE (required): Plain conversational prose only. No markdown (#, **), no section headers, no labels like "Headline Reason", "Primary Driver", or "Logic Summary".
${profile.voiceHint}
Never use generic filler such as "in focus on today's tape", "headline sensitivity", "sector beta remain the primary channels", or "live feeds connect".`;
}
