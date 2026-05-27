/**
 * Conversational voice — strip markdown/report labels; natural institutional prose.
 * @module logic/engines/conversationalVoice
 */

import { concise } from "./topicContext.js";

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
    (/why\b.*\bmov/i.test(t) && !/portfolio|watchlist|fragil|stress|regime/i.test(t)) ||
    (/what'?s driving|why are semis|why is .+ (weak|down|up)/i.test(t) && !/portfolio|fragil/i.test(t))
  ) {
    return "brief";
  }
  return "standard";
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
  let s = dedupeSymbolLead(String(text || ""));
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
 * @param {{ depth?: 'brief'|'standard'|'deep', maxChars?: number }} [options]
 */
export function humanizeLogicAnswer(text, options = {}) {
  const depth = options.depth || "standard";
  const maxSentences = depth === "brief" ? 3 : depth === "deep" ? 6 : 4;
  const maxChars = options.maxChars ?? (depth === "brief" ? 280 : depth === "deep" ? 560 : 400);

  let s = stripReportLabels(text);
  s = softenRoboticPhrasing(s);
  s = limitSentences(s, maxSentences);
  return concise(s, maxChars);
}

/**
 * @param {import('../types.js').LogicResponse} res
 * @param {{ prompt?: string, depth?: 'brief'|'standard'|'deep' }} [options]
 */
export function humanizeLogicResponse(res, options = {}) {
  const prompt = options.prompt || "";
  const depth = options.depth || resolveAnswerDepth(prompt, res.responseIntent || res.mode || "");

  const cleanField = (t, charMax) =>
    humanizeLogicAnswer(t, { depth, maxChars: charMax });

  const out = {
    ...res,
    cards: { ...(res.cards || {}) },
    optionalCards: res.optionalCards ? { ...res.optionalCards } : undefined,
  };

  if (out.title) {
    out.title = stripReportLabels(out.title).replace(/\s*·\s*intelligence\s*$/i, "").trim();
  }

  out.directAnswer = cleanField(out.directAnswer, depth === "brief" ? 300 : 420);
  out.summary = cleanField(out.summary, 380) || out.directAnswer;

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
    out.directAnswer = cleanField(out.cards.snapshot, 420);
  }
  if (out.directAnswer) {
    out.cards.snapshot = out.directAnswer;
  }

  return out;
}
