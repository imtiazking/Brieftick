/**
 * Response composer — direct answer first, concise cards, strip boilerplate.
 * @module logic/engines/responseComposer
 */

import { concise } from "./topicContext.js";
import { humanizeLogicAnswer } from "./conversationalVoice.js";
import { isConversationalLogicPreview } from "../previewFlags.js";

const FILLER_PATTERNS = [
  /indices tracked/i,
  /volatility monitored/i,
  /policy and inflation path dominate cross-asset pricing/i,
  /mega-cap tech vs cyclicals defines breadth/i,
  /session tone reads/i,
  /tape tone is/i,
  /index leadership remains selective/i,
  /^Tape:\s*SPY/i,
  /\bTape:\s*SPY/i,
];

/**
 * @param {string} text
 */
function isFiller(text) {
  return FILLER_PATTERNS.some((p) => p.test(text || ""));
}

/**
 * @param {import('../types.js').LogicResponse} res
 * @param {object} [ctx]
 * @returns {import('../types.js').LogicResponse}
 */
/**
 * @param {string} text
 */
function stripTapeAndHeadlineLead(text) {
  return String(text || "")
    .replace(/\bTape:\s*SPY[^.]*\.?/gi, "")
    .replace(/\bSPY\s*[+-]?\d+\.?\d*%/gi, "")
    .replace(/^[-•]\s*[^.]{10,120}(Reuters|Bloomberg)\s*[-–]/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function composeLogicResponse(res, ctx) {
  const out = { ...res, cards: { ...(res.cards || {}) } };
  const prompt = ctx?.prompt || "";
  const isCausal = ctx?.mode === "causal" || out.mode === "causal";
  const isMacroInterp =
    ctx?.mode === "macro-interpretation" || out.mode === "macro-interpretation";

  let direct =
    out.directAnswer ||
    (isFiller(out.cards.snapshot) ? "" : out.cards.snapshot) ||
    out.summary ||
    "";

  if (isCausal || isMacroInterp || ctx?.skipTape || ctx?.responsePlan?.abstractEntity) {
    direct = stripTapeAndHeadlineLead(direct);
  }
  direct = direct.replace(/markets may read this through[^.]*\./gi, "").trim();
  if (typeof window !== "undefined" && isConversationalLogicPreview()) {
    direct = humanizeLogicAnswer(direct, {
      depth: /why.*mov|what.*driving/i.test(prompt) ? "brief" : "standard",
      maxChars: isCausal || isMacroInterp ? 400 : 320,
    });
  } else {
    direct = concise(direct, isCausal || isMacroInterp ? 360 : 320);
  }
  if (!direct && out.cards.catalyst) {
    direct = concise(
      `${out.cards.catalyst} ${out.cards.sectorImpact || ""}`.trim(),
      320
    );
  }

  const cardKeys = ["snapshot", "catalyst", "macroContext", "sectorImpact", "volatility", "aiSummary"];
  for (const key of cardKeys) {
    let val = out.cards[key];
    if (!val || isFiller(val)) {
      if (key === "snapshot") val = direct;
      else if (key === "aiSummary") val = direct;
      else val = "";
    }
    if (isCausal || isMacroInterp || ctx?.skipTape || ctx?.responsePlan?.abstractEntity) {
      val = stripTapeAndHeadlineLead(val);
    }
    if (isMacroInterp) {
      val = val.replace(/markets may read this through[^.]*\./gi, "").trim();
    }
    if (isCausal && key === "catalyst" && isFiller(val)) {
      val = out.cards.macroContext || "";
    }
    out.cards[key] = concise(val, key === "aiSummary" ? 260 : 200);
  }

  if (!out.cards.snapshot) out.cards.snapshot = direct;
  out.directAnswer = direct;
  out.summary = concise(out.summary || direct, 360);

  if (out.optionalCards) {
    const opt = { ...out.optionalCards };
    for (const k of Object.keys(opt)) {
      opt[k] = concise(opt[k], 200);
    }
    out.optionalCards = opt;
  }

  if (prompt && direct && !out.title?.toLowerCase().includes("briefing")) {
    if (ctx?.questionKind === "geopolitical") {
      out.modeLabel = out.modeLabel || "Geopolitical Briefing";
    }
  }

  return out;
}
