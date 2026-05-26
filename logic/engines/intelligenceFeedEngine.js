/**
 * Intelligence feed engine — institutional-style notes (hooks for future live stream).
 * @module logic/engines/intelligenceFeedEngine
 */

import { logicDebug } from "../shared.js";
import { concise } from "./topicContext.js";
import { emitIntelligenceSignal } from "./intelligenceStream.js";

/**
 * @typedef {Object} IntelligenceNote
 * @property {string} id
 * @property {string} message
 * @property {'structure'|'cross_asset'|'positioning'|'divergence'|'stress'|'narrative'} category
 * @property {number} priority
 */

/**
 * Build short institutional notes from market intelligence snapshot.
 * @param {import('./marketIntelligenceOrchestrator.js').MarketIntelligenceSnapshot} snapshot
 * @param {object} [ctx]
 * @returns {IntelligenceNote[]}
 */
export function buildIntelligenceFeedNotes(snapshot, ctx) {
  if (!snapshot) return [];
  /** @type {IntelligenceNote[]} */
  const notes = [];

  const push = (id, message, category, priority) => {
    const msg = concise(message, 160);
    if (!msg || msg.length < 20) return;
    notes.push({ id, message: msg, category, priority });
  };

  if (snapshot.structure?.headline && snapshot.structure.relevance >= 0.5) {
    push("struct_breadth", snapshot.structure.headline, "structure", snapshot.structure.relevance);
  }
  if (snapshot.crossAsset?.headline && snapshot.crossAsset.relevance >= 0.45) {
    push("cross_asset", snapshot.crossAsset.headline, "cross_asset", snapshot.crossAsset.relevance);
  }
  if (snapshot.divergence?.divergences?.[0] && snapshot.divergence.relevance >= 0.45) {
    push("divergence", snapshot.divergence.divergences[0], "divergence", snapshot.divergence.relevance);
  }
  if (snapshot.stress?.note && snapshot.stress.relevance >= 0.45) {
    push("stress", snapshot.stress.headline, "stress", snapshot.stress.relevance);
  }
  if (snapshot.narrative?.shiftNote && snapshot.narrative.relevance >= 0.4) {
    push("narrative_shift", snapshot.narrative.shiftNote, "narrative", snapshot.narrative.relevance);
  }
  if (snapshot.positioning?.headline && snapshot.positioning.relevance >= 0.45) {
    push("positioning", snapshot.positioning.headline, "positioning", snapshot.positioning.relevance);
  }

  notes.sort((a, b) => b.priority - a.priority);
  logicDebug("intelligenceFeedEngine", { count: notes.length });
  return notes.slice(0, 5);
}

/**
 * Emit feed notes to intelligence stream hooks (no live UI yet).
 * @param {IntelligenceNote[]} notes
 */
export function publishIntelligenceFeedHooks(notes) {
  for (const note of notes) {
    emitIntelligenceSignal({
      id: `feed_${note.id}`,
      message: note.message,
      severity: note.category === "narrative" || note.category === "divergence" ? "shift" : "info",
    });
  }
}

/**
 * @param {object} snapshot
 * @param {object} ctx
 */
export function hookIntelligenceFeed(snapshot, ctx) {
  return buildIntelligenceFeedNotes(snapshot, ctx);
}
