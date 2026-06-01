/**
 * Logic → Ticker Deep Dive (Phase 2.2a + 2.3 context).
 * @module lib/logic-deep-dive
 */

import { openTickerDeepDive } from "./ticker-deep-dive.bridge.js";
import { buildLogicContext } from "../preview/ticker-deep-dive/deep-dive-context.js";

/** @type {Record<string, { quote?: object, fusion?: object, name?: string, prompt?: string, answer?: string, confidenceLabel?: string }>} */
let bySymbol = {};

/**
 * @param {{ symbol: string, quote?: object, fusion?: object, name?: string, prompt?: string, answer?: string, confidenceLabel?: string }} payload
 */
export function syncLogicDeepDiveData(payload) {
  const key = String(payload?.symbol || "").toUpperCase();
  if (!key) return;
  bySymbol[key] = {
    quote: payload.quote,
    fusion: payload.fusion,
    name: payload.name,
    prompt: payload.prompt,
    answer: payload.answer,
    confidenceLabel: payload.confidenceLabel,
  };
}

/**
 * @param {string} sym
 */
export function openLogicDeepDive(sym) {
  const key = String(sym || "").toUpperCase();
  if (!key) return;
  const row = bySymbol[key] || {};
  const context = buildLogicContext({
    symbol: key,
    prompt: row.prompt,
    answer: row.answer,
    confidenceLabel: row.confidenceLabel,
  });
  openTickerDeepDive({
    symbol: key,
    source: "logic",
    tab: "drivers",
    quote: row.quote,
    fusion: row.fusion,
    context,
  });
}

/**
 * @param {HTMLElement} root
 */
export function bindLogicDeepDiveActions(root) {
  if (!root || root._logicDeepDiveBound) return;
  root._logicDeepDiveBound = true;
  root.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-logic-deep-dive]");
    if (!btn || !root.contains(btn)) return;
    e.preventDefault();
    e.stopPropagation();
    const sym = btn.getAttribute("data-logic-deep-dive");
    if (sym) openLogicDeepDive(sym);
  });
}

if (typeof window !== "undefined") {
  window.openLogicDeepDive = openLogicDeepDive;
  window.__logicDeepDiveSync = syncLogicDeepDiveData;
  window.bindLogicDeepDiveActions = bindLogicDeepDiveActions;
}
