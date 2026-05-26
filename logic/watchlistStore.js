/**
 * Logic watchlist store — persist symbols and infer macro exposure.
 * @module logic/watchlistStore
 */

import { SYMBOL_PROFILE } from "./portfolioProfile.js";
import { logicDebug } from "./shared.js";

const WATCHLIST_KEY = "brieftick_watchlist_v1";
const LOGIC_WATCHLIST_META_KEY = "brieftick_logic_watchlist_meta_v1";

/**
 * @typedef {Object} WatchlistExposure
 * @property {string[]} symbols
 * @property {Record<string, number>} sectorCounts
 * @property {string[]} themes
 * @property {number} aiExposureScore
 * @property {number} megaCapScore
 * @property {string} volatilitySensitivity
 * @property {string} ratesSensitivity
 * @property {string} summary
 */

function userMetaKey() {
  const uid =
    typeof window !== "undefined"
      ? window._clerkUser?.id || window.Clerk?.user?.id || "anonymous"
      : "anonymous";
  return `${LOGIC_WATCHLIST_META_KEY}_${uid}`;
}

/**
 * @returns {string[]}
 */
export function getLogicWatchlist() {
  try {
    const raw = localStorage.getItem(WATCHLIST_KEY);
    const arr = JSON.parse(raw || "[]");
    return Array.isArray(arr) ? arr.map((s) => String(s).toUpperCase()).slice(0, 24) : [];
  } catch (_) {
    return [];
  }
}

/**
 * @param {string[]} symbols
 */
export function saveLogicWatchlist(symbols) {
  const list = [...new Set(symbols.map((s) => String(s).toUpperCase()).filter(Boolean))].slice(
    0,
    24
  );
  try {
    localStorage.setItem(WATCHLIST_KEY, JSON.stringify(list));
  } catch (_) {}
  if (typeof window !== "undefined" && typeof window.renderWatchlist === "function") {
    try {
      window.watchlistSymbols = list;
      window.renderWatchlist();
    } catch (_) {}
  }
  logicDebug("watchlistStore.save", list);
  return list;
}

/**
 * @param {string} symbol
 */
export function addWatchlistSymbol(symbol) {
  const sym = String(symbol || "").toUpperCase().replace(/[^A-Z]/g, "");
  if (!sym || sym.length > 5) return getLogicWatchlist();
  const list = getLogicWatchlist();
  if (!list.includes(sym)) list.unshift(sym);
  return saveLogicWatchlist(list);
}

/**
 * @param {string} symbol
 */
export function removeWatchlistSymbol(symbol) {
  const sym = String(symbol || "").toUpperCase();
  return saveLogicWatchlist(getLogicWatchlist().filter((s) => s !== sym));
}

/**
 * @param {string[]} [symbols]
 * @returns {WatchlistExposure}
 */
export function inferWatchlistExposure(symbols) {
  const list = symbols?.length ? symbols : getLogicWatchlist();
  /** @type {Record<string, number>} */
  const sectorCounts = {};
  /** @type {Record<string, number>} */
  const themeCounts = {};
  let ai = 0;
  let mega = 0;

  for (const sym of list) {
    const meta = SYMBOL_PROFILE[sym] || { sector: "Equity", themes: ["Single stock"] };
    sectorCounts[meta.sector] = (sectorCounts[meta.sector] || 0) + 1;
    for (const th of meta.themes) {
      themeCounts[th] = (themeCounts[th] || 0) + 1;
    }
    if (/AI infrastructure|Semiconductors/i.test(meta.themes.join(" "))) ai += 1;
    if (/Mega-cap growth/i.test(meta.themes.join(" "))) mega += 1;
  }

  const n = Math.max(1, list.length);
  const aiExposureScore = Math.round((ai / n) * 100);
  const megaCapScore = Math.round((mega / n) * 100);
  const themes = Object.entries(themeCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([t]) => t);

  const volatilitySensitivity =
    aiExposureScore >= 50 ? "elevated" : aiExposureScore >= 25 ? "moderate" : "muted";
  const ratesSensitivity =
    (themeCounts["Rates sensitive"] || 0) >= 2 ? "elevated" : "moderate";

  const summary =
    list.length === 0
      ? "No watchlist symbols — add tickers to personalize Logic."
      : `Watchlist skew: ${themes.slice(0, 2).join(", ") || "mixed"} · AI exposure ${aiExposureScore}% of names.`;

  const exposure = {
    symbols: list,
    sectorCounts,
    themes,
    aiExposureScore,
    megaCapScore,
    volatilitySensitivity,
    ratesSensitivity,
    summary,
  };

  try {
    localStorage.setItem(userMetaKey(), JSON.stringify({ exposure, at: Date.now() }));
  } catch (_) {}

  return exposure;
}

/**
 * Hooks for future account sync.
 * @param {string[]} symbols
 */
export function syncWatchlistFromAccount(symbols) {
  logicDebug("watchlistStore.syncAccount", "hook");
  return saveLogicWatchlist(symbols || []);
}
