/**
 * Intelligence stream hooks — prepare for future live feed (not streaming yet).
 * @module logic/engines/intelligenceStream
 */

import { logicDebug } from "../shared.js";
import { publishIntelligenceFeedHooks } from "./intelligenceFeedEngine.js";

/** @type {import('./intelligenceStream.js').StreamSignal[]} */
let pendingSignals = [];

/**
 * @typedef {Object} StreamSignal
 * @property {string} id
 * @property {string} message
 * @property {number} at
 * @property {'info'|'shift'|'acceleration'} severity
 */

const listeners = new Set();

/**
 * @param {Omit<StreamSignal, 'at'> & { at?: number }} signal
 */
export function emitIntelligenceSignal(signal) {
  const entry = {
    ...signal,
    at: signal.at ?? Date.now(),
  };
  pendingSignals.unshift(entry);
  pendingSignals = pendingSignals.slice(0, 50);
  logicDebug("intelligenceStream emit", entry.message);
  listeners.forEach((fn) => {
    try {
      fn(entry);
    } catch (_) {}
  });
}

/**
 * Derive stream signals from pipeline context (hooks only).
 * @param {object} ctx
 * @param {import('../types.js').LogicResponse} res
 */
export function hookIntelligenceStream(ctx, res) {
  const regime = ctx.regime?.primary;
  const narrative = ctx.narrative?.dominantLabel;

  if (ctx.marketIntelligence?.feedNotes?.length) {
    publishIntelligenceFeedHooks(ctx.marketIntelligence.feedNotes);
  }

  if (regime === "geopolitical_stress") {
    emitIntelligenceSignal({
      id: "geo_stress",
      message: "Geopolitical stress regime active",
      severity: "shift",
    });
  }
  if (regime === "ai_momentum") {
    emitIntelligenceSignal({
      id: "ai_momentum",
      message: "AI momentum regime — concentration risk elevated",
      severity: "info",
    });
  }
  if (narrative?.includes("Oil")) {
    emitIntelligenceSignal({
      id: "oil_sensitivity",
      message: "Oil sensitivity increasing in Logic narrative tracking",
      severity: "acceleration",
    });
  }
  if (ctx.narrative?.shiftNote) {
    emitIntelligenceSignal({
      id: "narrative_shift",
      message: ctx.narrative.shiftNote.slice(0, 120),
      severity: "shift",
    });
  }
  if (ctx.marketDivergence?.headline) {
    emitIntelligenceSignal({
      id: "divergence",
      message: ctx.marketDivergence.headline.slice(0, 120),
      severity: "shift",
    });
  }
  if (/vol compress/i.test(res.narrativeNote || "")) {
    emitIntelligenceSignal({
      id: "vol_compress",
      message: "Volatility compression theme noted",
      severity: "info",
    });
  }
}

/** @returns {StreamSignal[]} */
export function getPendingIntelligenceSignals() {
  return [...pendingSignals];
}

/**
 * @param {(signal: StreamSignal) => void} fn
 * @returns {() => void}
 */
export function subscribeIntelligenceStream(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Expose for future UI feed panel */
export function __resetIntelligenceStreamForTests() {
  pendingSignals = [];
  listeners.clear();
}
