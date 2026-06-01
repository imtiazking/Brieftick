/**
 * Scanner → Ticker Deep Dive (Phase 2.1).
 * @module lib/scanner-deep-dive
 */

import { openTickerDeepDive } from "./ticker-deep-dive.bridge.js";

/** @type {Record<string, { sym: string, close: number, pctChange: number, name?: string }>} */
let stocksBySym = {};

/**
 * @param {Array<{ sym: string, close: number, pctChange: number }>} results
 */
export function syncScannerDeepDiveData(results) {
  stocksBySym = {};
  for (const s of results || []) {
    if (s?.sym) stocksBySym[String(s.sym).toUpperCase()] = s;
  }
}

/**
 * @param {{ sym: string, close: number, pctChange: number }} stock
 */
function scannerQuote(stock) {
  const price = Number(stock.close);
  const pctChange = Number(stock.pctChange);
  if (!(price > 0)) return undefined;
  const change = price * (pctChange / 100) / (1 + pctChange / 100);
  return { price, pctChange, change, provider: "Scanner" };
}

/**
 * @param {string} sym
 */
export function openScannerDeepDive(sym) {
  const key = String(sym || "").toUpperCase();
  if (!key) return;
  const stock = stocksBySym[key];
  openTickerDeepDive({
    symbol: key,
    source: "scanner",
    tab: "drivers",
    quote: stock ? scannerQuote(stock) : undefined,
  });
}

if (typeof window !== "undefined") {
  window.openScannerDeepDive = openScannerDeepDive;
  window.__scannerDeepDiveSync = syncScannerDeepDiveData;
}
