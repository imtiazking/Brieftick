/**
 * Scanner → Ticker Deep Dive (Phase 2.1 + 2.3 context).
 * @module lib/scanner-deep-dive
 */

import { openTickerDeepDive } from "./ticker-deep-dive.bridge.js";
import { buildScannerContext } from "../preview/ticker-deep-dive/deep-dive-context.js";

/** @type {Record<string, object>} */
let stocksBySym = {};
/** @type {string} */
let scanMode = "momentum";

/**
 * @param {Array<object>} results
 * @param {string} [mode]
 */
export function syncScannerDeepDiveData(results, mode) {
  if (mode) scanMode = mode;
  stocksBySym = {};
  (results || []).forEach((s, i) => {
    if (s?.sym) {
      stocksBySym[String(s.sym).toUpperCase()] = {
        ...s,
        rank: i + 1,
        scanMode: mode || scanMode,
      };
    }
  });
}

/**
 * @param {{ sym: string, close: number, pctChange: number }} stock
 */
function scannerQuote(stock) {
  const price = Number(stock.close);
  const pctChange = Number(stock.pctChange);
  if (!(price > 0)) return undefined;
  const change = price * (pctChange / 100) / (1 + pctChange / 100);
  return { price, pctChange, change, provider: "Discover Stocks" };
}

/**
 * @param {string} sym
 */
export function openScannerDeepDive(sym) {
  const key = String(sym || "").toUpperCase();
  if (!key) return;
  const stock = stocksBySym[key];
  const context = stock ? buildScannerContext(stock, { rank: stock.rank, mode: stock.scanMode }) : null;
  openTickerDeepDive({
    symbol: key,
    source: "scanner",
    tab: "drivers",
    quote: stock ? scannerQuote(stock) : undefined,
    context,
  });
}

if (typeof window !== "undefined") {
  window.openScannerDeepDive = openScannerDeepDive;
  window.__scannerDeepDiveSync = syncScannerDeepDiveData;
}
