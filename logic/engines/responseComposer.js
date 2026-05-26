/**
 * Response composer — direct answer first, concise cards, strip boilerplate.
 * @module logic/engines/responseComposer
 */

import { concise } from "./topicContext.js";

const FILLER_PATTERNS = [
  /indices tracked/i,
  /volatility monitored/i,
  /policy and inflation path dominate cross-asset pricing/i,
  /mega-cap tech vs cyclicals defines breadth/i,
  /session tone reads/i,
  /tape tone is/i,
  /index leadership remains selective/i,
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
export function composeLogicResponse(res, ctx) {
  const out = { ...res, cards: { ...(res.cards || {}) } };
  const prompt = ctx?.prompt || "";

  let direct =
    out.directAnswer ||
    (isFiller(out.cards.snapshot) ? "" : out.cards.snapshot) ||
    out.summary ||
    "";

  direct = concise(direct, 320);
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
