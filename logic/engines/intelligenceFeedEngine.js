/**
 * Intelligence feed engine — continuous institutional-style market notes.
 * Foundation for future live intelligence stream.
 *
 * @module logic/engines/intelligenceFeedEngine
 */

import { logicDebug } from "../shared.js";
import { concise } from "./topicContext.js";
import { readFusionMarketState } from "./fusionSignals.js";

/**
 * @typedef {Object} IntelligenceNote
 * @property {string} id
 * @property {string} message
 * @property {'structure'|'cross_asset'|'positioning'|'divergence'|'stress'|'narrative'|'priority'|'portfolio'|'regime'} category
 * @property {number} priority
 * @property {number} [at]
 */

const FEED_LIBRARY = [
  {
    id: "ai_breadth_weak",
    category: "structure",
    priority: 0.82,
    when: (ctx, mi) =>
      mi?.structure?.flags?.includes("narrow_breadth") || mi?.structure?.flags?.includes("tech_leadership"),
    message: () => "AI breadth weakening despite mega-cap resilience.",
  },
  {
    id: "bond_equity_disconnect",
    category: "divergence",
    priority: 0.85,
    when: (ctx, mi) => mi?.divergence?.divergences?.some((d) => /bond|equities/i.test(d)),
    message: () => "Bond markets pricing slower growth faster than equities.",
  },
  {
    id: "oil_sensitivity_rise",
    category: "cross_asset",
    priority: 0.78,
    when: (ctx, mi) =>
      mi?.crossAsset?.factorNotes?.oil ||
      /oil|energy|transport/i.test(ctx.prompt || ""),
    message: () => "Oil sensitivity increasing across transport and industrials.",
  },
  {
    id: "vol_compress_geo",
    category: "stress",
    priority: 0.8,
    when: (ctx, mi) =>
      mi?.stress?.primary === "complacency" || mi?.stress?.primary === "vol_compression_risk",
    message: () => "Volatility compression continuing despite geopolitical stress.",
  },
  {
    id: "inflation_to_growth",
    category: "narrative",
    priority: 0.83,
    when: (ctx, _mi, live) =>
      /inflation.*growth|growth sensitivity/i.test(live?.activeShift || "") ||
      /inflation.*growth/i.test(ctx.prompt || ""),
    message: () => "Markets shifting from inflation sensitivity toward growth sensitivity.",
  },
  {
    id: "mega_cap_concentration",
    category: "structure",
    priority: 0.81,
    when: (ctx, mi) => mi?.structure?.flags?.includes("ai_dependency") || mi?.stress?.primary === "concentration",
    message: () => "Mega-cap concentration risk rising beneath stable headline indices.",
  },
  {
    id: "breadth_weak_mega",
    category: "structure",
    priority: 0.79,
    when: (ctx, mi) => mi?.structure?.fragilityNote || mi?.structure?.breadthNote,
    message: () => "Market breadth continues weakening beneath mega-cap strength.",
  },
  {
    id: "equity_bond_growth",
    category: "divergence",
    priority: 0.84,
    when: (ctx, mi) =>
      mi?.divergence?.divergences?.some((d) => /disconnected|conflicting/i.test(d)) ||
      /equities.*bond/i.test(ctx.prompt || ""),
    message: () => "Bond markets and equities remain disconnected on growth expectations.",
  },
  {
    id: "vol_compress_macro",
    category: "stress",
    priority: 0.77,
    when: (ctx, mi) => mi?.stress?.primary === "vol_compression_risk",
    message: () => "Volatility compression continues despite elevated macro uncertainty.",
  },
  {
    id: "ai_concentration_elevated",
    category: "positioning",
    priority: 0.8,
    when: (ctx, mi) => mi?.positioning?.themes?.some((t) => /AI|mega-cap/i.test(t)),
    message: () => "AI concentration risk remains elevated beneath stable headline indices.",
  },
];

/**
 * @param {object} input
 * @param {object} input.ctx
 * @param {object} [input.marketIntelligence]
 * @param {object} [input.liveNarrative]
 * @param {object} [input.priority]
 * @param {object} [input.portfolio]
 * @returns {IntelligenceNote[]}
 */
export function generateIntelligenceFeed(input) {
  const { ctx, marketIntelligence: mi, liveNarrative, priority, portfolio } = input;
  const m = readFusionMarketState(ctx?.fusion);
  /** @type {IntelligenceNote[]} */
  const notes = [];
  const seen = new Set();

  const push = (id, message, category, pri) => {
    const msg = concise(message, 160);
    if (!msg || msg.length < 18) return;
    const key = msg.slice(0, 50).toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    notes.push({
      id,
      message: msg,
      category,
      priority: pri,
      at: Date.now(),
    });
  };

  for (const item of FEED_LIBRARY) {
    try {
      if (item.when(ctx, mi, liveNarrative, priority, portfolio, m)) {
        push(item.id, item.message(ctx, mi, liveNarrative), item.category, item.priority);
      }
    } catch (_) {}
  }

  if (priority?.headline && priority.relevance >= 0.5) {
    push("priority", priority.headline, "priority", priority.relevance);
  }
  if (liveNarrative?.headline && liveNarrative.relevance >= 0.45) {
    push("live_narrative", liveNarrative.headline, "narrative", liveNarrative.relevance);
  }
  for (const obs of liveNarrative?.observations || []) {
    push(`obs_${obs.slice(0, 12)}`, obs, "narrative", 0.72);
  }
  if (mi?.structure?.headline && mi.structure.relevance >= 0.45) {
    push("structure", mi.structure.headline, "structure", mi.structure.relevance);
  }
  if (mi?.crossAsset?.headline && mi.crossAsset.relevance >= 0.42) {
    push("cross_asset", mi.crossAsset.headline, "cross_asset", mi.crossAsset.relevance);
  }
  if (mi?.divergence?.divergences?.[0] && mi.divergence.relevance >= 0.42) {
    push("divergence", mi.divergence.divergences[0], "divergence", mi.divergence.relevance);
  }
  if (mi?.stress?.headline && mi.stress.relevance >= 0.42) {
    push("stress", mi.stress.headline, "stress", mi.stress.relevance);
  }
  if (mi?.positioning?.headline && mi.positioning.relevance >= 0.4) {
    push("positioning", mi.positioning.headline, "positioning", mi.positioning.relevance);
  }
  if (portfolio?.headline && portfolio.relevance >= 0.45) {
    push("portfolio", portfolio.headline, "portfolio", portfolio.relevance);
  }
  if (ctx?.regime?.label) {
    push(
      "regime",
      `${ctx.regime.label} regime — ${concise(ctx.regime.adaptationNote || "", 100)}`,
      "regime",
      0.55
    );
  }

  notes.sort((a, b) => b.priority - a.priority);
  const out = notes.slice(0, 8);
  logicDebug("intelligenceFeedEngine", { count: out.length });
  return out;
}

/** @deprecated use generateIntelligenceFeed */
export function buildIntelligenceFeedNotes(snapshot, ctx) {
  return generateIntelligenceFeed({
    ctx: { ...ctx, marketIntelligence: snapshot },
    marketIntelligence: snapshot,
  });
}

/**
 * @param {IntelligenceNote[]} notes
 */
export function notesToIntelligenceChips(notes) {
  return (notes || []).slice(0, 6).map((n) => concise(n.message, 120));
}

/**
 * @param {object} snapshot
 * @param {object} ctx
 */
export function hookIntelligenceFeed(snapshot, ctx) {
  return generateIntelligenceFeed({ ctx: { ...ctx, marketIntelligence: snapshot }, marketIntelligence: snapshot });
}
