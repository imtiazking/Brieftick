/**
 * Portfolio → Ticker Deep Dive (Phase 2.0).
 * @module lib/portfolio-deep-dive
 */

import { openTickerDeepDive, initTickerDeepDiveBridge } from "./ticker-deep-dive.bridge.js";

/** @type {Record<string, { symbol: string, weight: number }>} */
let holdingsBySym = {};

/** @type {Record<string, { price?: number, pctChange?: number, change?: number }>} */
let latestQuotes = {};

/**
 * @param {{ symbol: string, weight: number }[]} holdings
 * @param {Record<string, object> | null | undefined} quotes
 */
export function syncPortfolioDeepDiveData(holdings, quotes) {
  holdingsBySym = {};
  for (const h of holdings || []) {
    if (h?.symbol) holdingsBySym[String(h.symbol).toUpperCase()] = h;
  }
  latestQuotes = quotes || {};
  if (typeof window.__portfolioLayoutSync === "function") {
    window.__portfolioLayoutSync(holdings, quotes);
  }
}

function portfolioQuote(sym) {
  const q = latestQuotes[sym];
  if (!q) return undefined;
  const price = Number(q.price);
  const pctChange = Number(q.pctChange);
  if (price > 0) {
    const change = Number.isFinite(Number(q.change))
      ? Number(q.change)
      : price * (pctChange / 100) / (1 + pctChange / 100);
    return { price, pctChange, change, provider: "Portfolio" };
  }
  return undefined;
}

/**
 * @param {string} sym
 */
function openPortfolioDeepDive(sym) {
  const key = String(sym || "").toUpperCase();
  if (!key) return;
  const holding = holdingsBySym[key];
  openTickerDeepDive({
    symbol: key,
    source: "portfolio",
    tab: "positioning",
    quote: portfolioQuote(key),
    weightPct: holding?.weight,
  });
}

export function bindPortfolioDeepDive() {
  const table = document.getElementById("holdingsTable");
  if (!table || table.dataset.portfolioTddBound) return;
  table.dataset.portfolioTddBound = "1";

  table.addEventListener("click", (e) => {
    const row = e.target.closest(".holding-row[data-symbol]");
    if (!row) return;
    const sym = row.dataset.symbol;
    if (!sym) return;
    openPortfolioDeepDive(sym);
  });

  table.addEventListener("keydown", (e) => {
    const row = e.target.closest(".holding-row[data-symbol]");
    if (!row || (e.key !== "Enter" && e.key !== " ")) return;
    e.preventDefault();
    openPortfolioDeepDive(row.dataset.symbol);
  });
}

if (typeof window !== "undefined") {
  window.__portfolioDeepDiveSync = syncPortfolioDeepDiveData;
}

bindPortfolioDeepDive();
initTickerDeepDiveBridge();
