/**
 * Enrichment gate — only run subsystems allowed by response plan.
 * @module logic/engines/enrichmentGate
 */

import { logicDebug } from "../shared.js";
import { concise } from "./topicContext.js";
import { applyIntelligenceStreamToResponse } from "./intelligenceStreamOrchestrator.js";

/**
 * @param {import('./responsePlan.js').ResponsePlan} plan
 * @param {string} sectionKey
 */
function marketIntelAllowed(plan, sectionKey) {
  if (!plan.enrichment.marketIntelApply) return false;
  const keys = plan.enrichment.marketIntelKeys;
  if (!keys?.length) return true;
  return keys.includes(sectionKey);
}

/**
 * @param {import('../types.js').LogicResponse} res
 * @param {object} ctx
 */
export function applyGatedMarketIntelligence(res, ctx) {
  const plan = ctx.responsePlan;
  if (!plan?.enrichment.marketIntelApply) return res;

  const snap = ctx.marketIntelligence;
  if (!snap) return res;

  let out = { ...res, cards: { ...(res.cards || {}) }, optionalCards: { ...(res.optionalCards || {}) } };
  const signals = [...(res.signals || [])];

  const add = (prefix, text, key) => {
    if (!marketIntelAllowed(plan, key)) return;
    const line = concise(text, 140);
    if (!line || line.length < 20) return;
    const chip = `${prefix}: ${line}`;
    if (!signals.some((s) => s.includes(line.slice(0, 30)))) signals.push(chip);
  };

  if (marketIntelAllowed(plan, "structure") && snap.structure?.headline) {
    add("Structure", snap.structure.headline, "structure");
  }
  if (marketIntelAllowed(plan, "crossAsset") && snap.crossAsset?.headline) {
    add("Cross-asset", snap.crossAsset.headline, "crossAsset");
  }
  if (marketIntelAllowed(plan, "positioning") && snap.positioning?.headline) {
    add("Positioning", snap.positioning.headline, "positioning");
    if (plan.intentId === "portfolio_risk" || plan.intentId === "portfolio") {
      out.optionalCards.riskSignal =
        out.optionalCards.riskSignal || concise(snap.positioning.headline, 200);
    }
  }
  if (marketIntelAllowed(plan, "divergence") && snap.divergence?.divergences?.length) {
    add("Divergence", snap.divergence.headline, "divergence");
  }
  if (marketIntelAllowed(plan, "stress") && snap.stress?.headline) {
    const h = snap.stress.headline;
    if (!/balanced|no dominant/i.test(h)) {
      add("Stress", h, "stress");
      if (plan.allowedOptional.includes("stressSignal")) {
        out.optionalCards.stressSignal = concise(h, 200);
      }
    }
  }

  out.signals = signals.slice(0, 5);
  logicDebug("enrichmentGate marketIntel", { intent: plan.intentId });
  return out;
}

/**
 * Lightweight enrich path respecting plan.
 * @param {import('../types.js').LogicResponse} res
 * @param {object} ctx
 */
export function applyGatedEnrichment(res, ctx) {
  const plan = ctx.responsePlan;
  if (!plan) return res;

  let out = res;

  if (plan.enrichment.marketIntelApply) {
    out = applyGatedMarketIntelligence(out, ctx);
  }

  if (plan.enrichment.streamApply) {
    out = applyIntelligenceStreamToResponse(out, ctx);
    if (plan.intentId !== "briefing" && plan.intentId !== "market_pulse") {
      delete out.optionalCards.narrativeLink;
      delete out.optionalCards.prioritySignal;
      out.signals = (out.signals || []).filter(
        (s) => !/^Structure:|^Stress:|^Cross-asset:|^Divergence:|^Narrative:/i.test(s)
      );
      if (out.intelligenceFeed) out.intelligenceFeed = [];
    }
  } else if (ctx.intelligenceStream?.portfolio && plan.intentId.startsWith("portfolio")) {
    const p = ctx.intelligenceStream.portfolio;
    if (p.headline && !out.directAnswer) {
      out.directAnswer = p.headline;
      out.cards = { ...out.cards, snapshot: p.headline };
    }
  }

  return out;
}

/**
 * @param {object} ctx
 */
export function shouldBuildFullMarketStack(ctx) {
  const plan = ctx.responsePlan;
  if (!plan) return true;
  if (ctx.mode === "watchlist" || plan.intentId === "watchlist_performance") return false;
  return (
    plan.enrichment.marketIntelApply ||
    plan.enrichment.streamApply ||
    plan.intentId === "portfolio" ||
    plan.intentId === "portfolio_risk" ||
    plan.intentId === "regime_fit" ||
    plan.intentId === "portfolio_stress"
  );
}
