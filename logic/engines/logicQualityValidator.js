/**
 * Response quality validation — coherence, concision, question fit.
 * @module logic/engines/logicQualityValidator
 */

import { concise } from "./topicContext.js";
import { logicDebug } from "../shared.js";

const HEADLINE_LEAD = /^(Reuters|Bloomberg|AP |Three months in)/i;
const FILLER = [
  /indices tracked/i,
  /volatility monitored/i,
  /policy and inflation path dominate/i,
  /mega-cap tech vs cyclicals/i,
  /Tape:\s*SPY/i,
];

/**
 * @typedef {Object} QualityReport
 * @property {boolean} ok
 * @property {string[]} issues
 * @property {boolean} answeredQuestion
 * @property {boolean} isCausal
 * @property {boolean} repetitive
 */

/**
 * @param {string} prompt
 * @param {import('../types.js').LogicResponse} res
 * @param {object} [ctx]
 * @returns {QualityReport}
 */
export function validateLogicQuality(prompt, res, ctx) {
  const issues = [];
  const direct = res.directAnswer || res.cards?.snapshot || res.summary || "";
  const promptLower = (prompt || "").toLowerCase();

  const answeredQuestion =
    direct.length > 40 &&
    !HEADLINE_LEAD.test(direct) &&
    (ctx?.mode === "causal" ||
      /benefit|lose|sector|pricing|why|how|what/i.test(promptLower)
        ? /sector|benefit|lose|pricing|because|may|investors/i.test(direct.toLowerCase())
        : true);

  if (!answeredQuestion) issues.push("May not directly answer the question");
  if (HEADLINE_LEAD.test(direct)) issues.push("Headline-led instead of mechanism-first");

  const cardTexts = Object.values(res.cards || {}).filter(Boolean);
  const unique = new Set(cardTexts.map((t) => t.slice(0, 60)));
  const repetitive = unique.size < Math.max(2, cardTexts.length - 2);
  if (repetitive) issues.push("Cards repetitive");

  for (const f of FILLER) {
    if (f.test(direct)) issues.push("Generic filler in answer");
  }

  const isCausal =
    ctx?.mode === "causal" ||
    /→|because|may lead|transmission|pricing power/i.test(direct);

  if (/which sector|pricing power|benefit first/i.test(promptLower) && !isCausal) {
    issues.push("Expected causal reasoning");
  }

  const ok = issues.length === 0;

  logicDebug("logicQualityValidator", { ok, issues });

  return { ok, issues, answeredQuestion, isCausal, repetitive };
}

/**
 * Refine response based on quality report.
 * @param {import('../types.js').LogicResponse} res
 * @param {QualityReport} report
 * @param {object} [ctx]
 */
export function refineLogicQuality(res, report, ctx) {
  let out = { ...res, cards: { ...(res.cards || {}) } };

  if (report.issues.includes("Headline-led instead of mechanism-first") && ctx?.graph?.narrative) {
    out.directAnswer = concise(ctx.graph.narrative, 320);
    out.cards.snapshot = out.directAnswer;
  }

  if (report.repetitive) {
    const seen = new Set();
    for (const key of Object.keys(out.cards)) {
      const slice = out.cards[key].slice(0, 50);
      if (seen.has(slice)) out.cards[key] = "";
      else seen.add(slice);
    }
  }

  for (const key of Object.keys(out.cards)) {
    out.cards[key] = concise(out.cards[key], 200);
  }
  if (out.directAnswer) out.directAnswer = concise(out.directAnswer, 340);

  out.qualityIssues = report.issues;

  return out;
}

/** @param {string} prompt @param {import('../types.js').LogicResponse} res @param {object} [ctx] */
export function logicQualityValidator(prompt, res, ctx) {
  const report = validateLogicQuality(prompt, res, ctx);
  if (report.ok) return res;
  return refineLogicQuality(res, report, ctx);
}
