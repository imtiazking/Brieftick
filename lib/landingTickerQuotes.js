/**
 * Landing-page ticker strip + hero market strip — symbol normalization and DOM patching.
 * Shared with index.html via landingTickerQuotes.bridge.js
 * @module lib/landingTickerQuotes
 */

/** Symbols shown in the global strip that are not standard US equity/ETF Finnhub quotes. */
export const LANDING_MACRO_SYMBOLS = new Set([
  "VIX",
  "BTC",
  "ETH",
  "GOLD",
  "CRUDE",
  "DXY",
  "10Y",
  "EUR/USD",
]);

/** Twelve Data / proxy symbols for macro rows in the landing strip. */
export const LANDING_MACRO_FETCH_MAP = {
  BTC: "BTC/USD",
  ETH: "ETH/USD",
  GOLD: "XAU/USD",
  CRUDE: "WTI/USD",
  DXY: "DX-Y.NYB",
  "EUR/USD": "EUR/USD",
};

/** ETF proxies when forex/commodity symbols fail on Twelve Data. */
export const LANDING_MACRO_ETF_PROXY = {
  GOLD: "GLD",
  CRUDE: "USO",
  DXY: "UUP",
};

/** Hero card bottom strip symbols (equities + VIX). */
export const HERO_STRIP_SYMBOLS = ["SPY", "QQQ", "DIA", "VIX"];

/**
 * Finnhub uses BRK-B; UI uses BRK.B. Polygon often accepts BRK.B.
 * @param {string} sym
 * @param {'finnhub'|'polygon'|'display'} provider
 */
export function mapSymbolForProvider(sym, provider = "finnhub") {
  const s = String(sym || "")
    .trim()
    .toUpperCase();
  if (provider === "finnhub") {
    if (s === "BRK.B" || s === "BRKB") return "BRK-B";
    return s;
  }
  if (provider === "polygon") {
    return s;
  }
  if (s === "BRK-B" || s === "BRKB") return "BRK.B";
  return s;
}

/**
 * @param {string} providerTicker
 * @param {string} requested
 */
export function mapProviderTickerToDisplay(providerTicker, requested) {
  const p = String(providerTicker || "").toUpperCase();
  const r = String(requested || "").toUpperCase();
  if (p === "BRK-B" || r === "BRK.B") return "BRK.B";
  return r || mapSymbolForProvider(p, "display");
}

/**
 * @param {[string, string, string, string][]} tickerRows
 */
export function landingEquitySymbolsFromTickerData(tickerRows) {
  const out = [];
  const seen = new Set();
  for (const row of tickerRows || []) {
    const sym = String(row[0] || "").trim();
    if (!sym || LANDING_MACRO_SYMBOLS.has(sym) || seen.has(sym)) continue;
    seen.add(sym);
    out.push(sym);
  }
  return out;
}

/**
 * @param {HTMLElement} item
 * @param {string} sym
 * @param {{ price: number, pctChange: number }} q
 * @param {{ loading?: boolean }} [opts]
 */
export function patchGlobalTickerItem(item, sym, q, opts = {}) {
  if (!item || !q || typeof q.price !== "number" || isNaN(q.price) || q.price <= 0) {
    return false;
  }
  const symEl = item.querySelector(".sym");
  if (!symEl || symEl.textContent.trim() !== sym) return false;
  const spans = item.querySelectorAll("span");
  if (spans[1]) spans[1].textContent = q.price.toFixed(2);
  if (spans[2] && typeof q.pctChange === "number" && !isNaN(q.pctChange)) {
    const sign = q.pctChange >= 0 ? "+" : "";
    spans[2].textContent = `${sign}${q.pctChange.toFixed(2)}%`;
    spans[2].classList.remove("flat");
    spans[2].classList.toggle("up", q.pctChange >= 0);
    spans[2].classList.toggle("dn", q.pctChange < 0);
  }
  item.dataset.live = opts.loading ? "loading" : "live";
  return true;
}

/**
 * @param {HTMLElement} marketEl
 * @param {string} sym
 * @param {{ price: number, pctChange: number, change?: number }} q
 * @param {{ priceDecimals?: number, pctIsBps?: boolean }} [opts]
 */
export function patchHeroStripMarket(marketEl, sym, q, opts = {}) {
  if (!marketEl || !q || typeof q.price !== "number" || isNaN(q.price)) return false;
  const symEl = marketEl.querySelector(".sym");
  if (!symEl || symEl.textContent.trim() !== sym) return false;
  const valEl = marketEl.querySelector(".val");
  const moveEl = marketEl.querySelector(".move");
  const dec = opts.priceDecimals ?? 2;
  if (valEl) {
    valEl.textContent =
      sym === "10Y" ? `${q.price.toFixed(2)}%` : q.price.toFixed(dec);
  }
  if (moveEl && typeof q.pctChange === "number" && !isNaN(q.pctChange)) {
    const sign = q.pctChange >= 0 ? "+" : "";
    if (opts.pctIsBps) {
      moveEl.textContent = `${sign}${(q.change ?? q.pctChange).toFixed(2)}`;
    } else {
      moveEl.textContent = `${sign}${q.pctChange.toFixed(2)}%`;
    }
    moveEl.classList.remove("up", "dn", "flat");
    moveEl.classList.add(q.pctChange >= 0 ? "up" : "dn");
  }
  marketEl.dataset.live = "live";
  return true;
}

/**
 * Mark strip items still on placeholder as unavailable (not fake numbers).
 * @param {string} rootSelector
 * @param {string[]} symbols
 */
export function markStaleTickerPlaceholders(rootSelector, symbols) {
  const root = document.querySelector(rootSelector);
  if (!root) return;
  root.querySelectorAll(".ticker-item").forEach((item) => {
    const sym = item.querySelector(".sym")?.textContent?.trim();
    if (!sym || !symbols.includes(sym)) return;
    if (item.dataset.live === "live") return;
    const spans = item.querySelectorAll("span");
    if (spans[1]?.textContent === "…" || spans[1]?.textContent === "-") {
      spans[1].textContent = "—";
    }
    if (spans[2]?.textContent === "…" || spans[2]?.textContent === "-") {
      spans[2].textContent = "—";
      spans[2].classList.add("flat");
    }
  });
}
