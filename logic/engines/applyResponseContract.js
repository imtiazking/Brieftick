/**
 * Apply response contract — enforce plan allowlists and suppress contradictions.
 * @module logic/engines/applyResponseContract
 */

import { logicDebug } from "../shared.js";
import { concise } from "./topicContext.js";

/**
 * @param {string} text
 * @param {RegExp[]} patterns
 */
function shouldSuppress(text, patterns) {
  const t = String(text || "").trim();
  if (!t) return true;
  return patterns.some((p) => p.test(t));
}

/**
 * @param {import('../types.js').LogicResponse} res
 * @param {import('./responsePlan.js').ResponsePlan} plan
 */
export function applyResponseContract(res, plan) {
  if (!plan) return res;

  const patterns = plan.suppressPatterns || [];
  let out = { ...res, cards: { ...(res.cards || {}) }, optionalCards: { ...(res.optionalCards || {}) } };

  const clean = (text) => {
    if (shouldSuppress(text, patterns)) return "";
    return concise(text, 360);
  };

  for (const key of Object.keys(out.cards)) {
    if (!plan.allowedCards.includes(key)) {
      out.cards[key] = "";
    } else {
      out.cards[key] = clean(out.cards[key]);
    }
  }

  for (const key of Object.keys({ ...out.optionalCards })) {
    if (!plan.allowedOptional.includes(key)) {
      delete out.optionalCards[key];
    } else {
      const v = clean(out.optionalCards[key]);
      if (!v) delete out.optionalCards[key];
      else out.optionalCards[key] = v;
    }
  }

  out.directAnswer = clean(out.directAnswer);
  out.summary = clean(out.summary) || out.directAnswer;

  if (plan.intentId === "briefing") {
    // briefing may use headlines in catalyst
    if (out.cards.catalyst && patterns.some((p) => p.test(out.cards.catalyst))) {
      /* keep if news intent */
    }
  } else {
    out.cards.catalyst = clean(out.cards.catalyst);
    if (/reuters|texas|senate primary|cornyn|paxton/i.test(out.directAnswer || "")) {
      out.directAnswer = out.summary || out.cards.snapshot || "";
    }
  }

  out.signals = (out.signals || [])
    .map((s) => clean(s))
    .filter(Boolean)
    .slice(0, plan.intentId === "fragility" ? 3 : 5);

  if (out.narrativeNote && shouldSuppress(out.narrativeNote, patterns)) {
    delete out.narrativeNote;
  }

  if (out.confidenceReasons?.length) {
    out.confidenceReasons = out.confidenceReasons.filter((r) => !shouldSuppress(r, patterns));
  }

  if (!out.cards.snapshot && out.directAnswer) {
    out.cards.snapshot = out.directAnswer;
  }

  out.modeLabel = plan.label;
  out.responseIntent = plan.intentId;
  out.responsePlanApplied = true;

  logicDebug("applyResponseContract", { intent: plan.intentId });
  return out;
}
