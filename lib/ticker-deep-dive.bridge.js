/**
 * Lazy-load Ticker Deep Dive for SPA pages (index.html).
 * @module lib/ticker-deep-dive.bridge
 */

let modulePromise = null;

function loadTickerDeepDiveModule() {
  if (!modulePromise) {
    modulePromise = import("/preview/ticker-deep-dive/ticker-deep-dive.js");
  }
  return modulePromise;
}

/**
 * @param {Parameters<import('../preview/ticker-deep-dive/ticker-deep-dive.js').openTickerDeepDive>[0]} opts
 */
export async function openTickerDeepDive(opts) {
  const mod = await loadTickerDeepDiveModule();
  mod.initTickerDeepDive();
  return mod.openTickerDeepDive(opts);
}

export async function initTickerDeepDiveBridge() {
  const mod = await loadTickerDeepDiveModule();
  mod.initTickerDeepDive();
}

if (typeof window !== "undefined") {
  window.openTickerDeepDive = (opts) => openTickerDeepDive(opts);
}
