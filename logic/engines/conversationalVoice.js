/**
 * Conversational voice — strip markdown/report labels; natural institutional prose.
 * @module logic/engines/conversationalVoice
 */

import { concise } from "./topicContext.js";
import {
  GENERIC_TICKER_PHRASE_RE,
  stripGenericTickerPhrases,
} from "./tickerDeskCopy.js";
import {
  classifyResponseDepthIntent,
  depthProfileToLegacy,
} from "./responseDepthIntent.js";

/**
 * @param {string} prompt
 * @param {string} [intentId]
 * @param {import('./responseDepthIntent.js').ResponseDepthProfile} [depthProfile]
 * @returns {'brief'|'standard'|'deep'}
 */
export function resolveAnswerDepth(prompt, intentId, depthProfile) {
  if (depthProfile) return depthProfileToLegacy(depthProfile);

  const profile = classifyResponseDepthIntent(prompt, {});
  return depthProfileToLegacy(profile);
}

/**
 * @param {'brief'|'standard'|'deep'|'contextual'} depth
 * @param {import('./responseDepthIntent.js').ResponseDepthProfile} [profile]
 */
export function limitsForDepth(depth, profile) {
  if (profile) {
    return { maxSentences: profile.maxSentences, maxChars: profile.maxChars };
  }
  if (depth === "brief") return { maxSentences: 2, maxChars: 280 };
  if (depth === "deep") return { maxSentences: 6, maxChars: 640 };
  if (depth === "contextual") return { maxSentences: 4, maxChars: 520 };
  return { maxSentences: 4, maxChars: 400 };
}

const REPORT_LABEL_NAMES =
  "headline\\s*reason|logic\\s*summary|primary\\s*driver|market\\s*analysis|ticker\\s*intelligence(?:\\s*logic)?|portfolio\\s*logic|macro\\s*interpretation|ai\\s*summary|intelligence\\s*summary|snapshot|catalyst|macro\\s*context|sector\\s*impact|volatility|sector\\s*sympathy|cross[- ]asset|positioning|stress\\s*signal|supply\\s*chain|answer|direct\\s*answer|summary";

/** Line-start or mid-string report labels (after markdown collapse). */
const REPORT_LABEL_RE = new RegExp(
  `(?:^|\\s)(?:#{1,6}\\s*)?(?:\\*\\*)?\\s*(?:${REPORT_LABEL_NAMES})\\s*(?:\\*\\*)?\\s*:?\\s*`,
  "gim"
);

const TITLEISH_BLOB = new RegExp(
  `\\b[A-Z]{2,5}\\s+(?:market\\s+)?analysis\\b`,
  "gi"
);

/**
 * @param {string} text
 */
export function stripMarkdownFormatting(text) {
  let s = String(text || "");
  s = s.replace(/```[\s\S]*?```/g, " ");
  s = s.replace(/`([^`]+)`/g, "$1");
  s = s.replace(/^#{1,6}\s+/gm, "");
  s = s.replace(/\*\*([^*]+)\*\*/g, "$1");
  s = s.replace(/\*([^*]+)\*/g, "$1");
  s = s.replace(/__([^_]+)__/g, "$1");
  s = s.replace(/_([^_]+)_/g, "$1");
  s = s.replace(/^\s*[-*•]\s+/gm, "");
  s = s.replace(/^---+$/gm, "");
  s = s.replace(/\[(.*?)\]\([^)]+\)/g, "$1");
  return s.replace(/\s+/g, " ").trim();
}

/**
 * @param {string} text
 */
export function stripReportLabels(text) {
  let s = String(text || "");
  const lines = s.split(/\n+/);
  s = lines
    .map((line) => {
      let l = stripMarkdownFormatting(line);
      l = l.replace(REPORT_LABEL_RE, " ");
      l = l.replace(TITLEISH_BLOB, " ");
      return l.trim();
    })
    .filter(Boolean)
    .join(" ");
  s = s.replace(REPORT_LABEL_RE, " ");
  s = s.replace(TITLEISH_BLOB, " ");
  s = s.replace(
    /\b(?:ticker intelligence logic|portfolio logic|macro interpretation|market pulse logic|risk regime logic|watchlist performance)\b/gi,
    ""
  );
  return s.replace(/\s+/g, " ").trim();
}

/**
 * @param {string} text
 * @param {number} max
 */
export function limitSentences(text, max) {
  const s = String(text || "").trim();
  if (!s || max < 1) return "";
  const parts = s.split(/(?<=[.!?])\s+(?=[A-Z"“])/);
  if (parts.length <= max) return s;
  return parts.slice(0, max).join(" ").trim();
}

/**
 * Light touch-ups for stiff template phrasing.
 * @param {string} text
 */
/**
 * @param {string} text
 */
export function dedupeSymbolLead(text) {
  return String(text || "").replace(/\b([A-Z]{2,5})\s+\1\b/g, "$1");
}

export function softenRoboticPhrasing(text) {
  let s = stripGenericTickerPhrases(dedupeSymbolLead(String(text || "")));
  if (GENERIC_TICKER_PHRASE_RE.test(s)) {
    s = stripGenericTickerPhrases(s);
  }
  s = s.replace(
    /(\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+is\s+down\s+([\d.]+)%\s+with\s+no\s+major\s+company-specific\s+news\s+driving\s+the\s+(decline|drop|move|weakness)\.?/gi,
    "$1 is slightly lower today (−$2%) with no major company-specific catalyst — broader sector tone may be doing more of the work."
  );
  s = s.replace(
    /(\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+is\s+up\s+([\d.]+)%\s+with\s+no\s+major\s+company-specific\s+news\s+driving\s+the\s+(gain|rally|move)\.?/gi,
    "$1 is firmer today (+$2%) without a clear company-specific headline — sympathy with the wider group may be helping."
  );
  s = s.replace(
    /with\s+no\s+major\s+company-specific\s+news\s+driving\s+the\s+(decline|drop|move|gain|rally)/gi,
    "with no major company-specific catalyst"
  );
  s = s.replace(/\bno major news\b/gi, "no major headline");
  s = s.replace(/\bdriving the decline\b/gi, "behind the move");
  s = s.replace(/\bdriving the move\b/gi, "behind the session");
  return s.replace(/\s+/g, " ").trim();
}

/**
 * @param {string} text
 * @param {{ depth?: 'brief'|'standard'|'deep'|'contextual', maxChars?: number, maxSentences?: number, depthProfile?: import('./responseDepthIntent.js').ResponseDepthProfile }} [options]
 */
export function humanizeLogicAnswer(text, options = {}) {
  const depth = options.depthProfile
    ? options.depthProfile.depth === "brief"
      ? "brief"
      : options.depthProfile.depth === "deep"
        ? "deep"
        : "contextual"
    : options.depth || "standard";
  const limits = options.depthProfile
    ? { maxSentences: options.depthProfile.maxSentences, maxChars: options.depthProfile.maxChars }
    : limitsForDepth(depth, null);
  const maxSentences = options.maxSentences ?? limits.maxSentences;
  const maxChars = options.maxChars ?? limits.maxChars;

  let s = stripReportLabels(text);
  s = softenRoboticPhrasing(s);
  s = limitSentences(s, maxSentences);
  return concise(s, maxChars);
}

/**
 * @param {import('../types.js').LogicResponse} res
 * @param {{ prompt?: string, depth?: 'brief'|'standard'|'deep', depthProfile?: import('./responseDepthIntent.js').ResponseDepthProfile }} [options]
 */
export function humanizeLogicResponse(res, options = {}) {
  const prompt = options.prompt || "";
  const depthProfile =
    options.depthProfile ||
    classifyResponseDepthIntent(prompt, { mode: res.mode });
  const depth =
    options.depth || resolveAnswerDepth(prompt, res.responseIntent || res.mode || "", depthProfile);
  const primaryLimits = limitsForDepth(depth, depthProfile);

  const cleanField = (t, charMax, sentenceCap) =>
    humanizeLogicAnswer(t, {
      depth,
      depthProfile,
      maxChars: charMax,
      maxSentences: sentenceCap,
    });

  const out = {
    ...res,
    cards: { ...(res.cards || {}) },
    optionalCards: res.optionalCards ? { ...res.optionalCards } : undefined,
  };

  if (out.title) {
    out.title = stripReportLabels(out.title).replace(/\s*·\s*intelligence\s*$/i, "").trim();
  }

  out.directAnswer = cleanField(
    out.directAnswer,
    primaryLimits.maxChars,
    primaryLimits.maxSentences
  );
  out.summary =
    cleanField(out.summary, primaryLimits.maxChars + 40, primaryLimits.maxSentences) ||
    out.directAnswer;
  out.responseDepthIntent = depthProfile.intent;

  for (const key of Object.keys(out.cards)) {
    out.cards[key] = cleanField(out.cards[key], 220);
  }
  if (out.optionalCards) {
    for (const key of Object.keys(out.optionalCards)) {
      out.optionalCards[key] = cleanField(out.optionalCards[key], 220);
    }
  }
  out.signals = (out.signals || [])
    .map((s) => cleanField(s, 80))
    .filter(Boolean)
    .slice(0, 5);

  if (!out.directAnswer && out.cards.snapshot) {
    out.directAnswer = cleanField(
      out.cards.snapshot,
      primaryLimits.maxChars,
      primaryLimits.maxSentences
    );
  }
  if (out.directAnswer) {
    out.cards.snapshot = out.directAnswer;
  }

  return out;
}
