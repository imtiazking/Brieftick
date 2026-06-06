/**
 * Hydrate visible Intelligence Wheel modules with live API data.
 * @module lib/dashboard-live-bridge
 */

import { applyBadge } from "/lib/live-data-badge.js";
import { hydrateMarketRiskGauge } from "/lib/market-risk-ui.js";

const MOVER_SYMBOLS = [
  "NVDA",
  "AMD",
  "XOM",
  "META",
  "TSLA",
  "JPM",
  "CVX",
  "AAPL",
  "MSFT",
  "AVGO",
];

/** @type {Record<string, string>} */
const SECTOR_ETF = {
  technology: "XLK",
  energy: "XLE",
  financials: "XLF",
  healthcare: "XLV",
  consumer: "XLY",
  industrials: "XLI",
  utilities: "XLU",
  materials: "XLB",
};

let refreshTimer = null;

/**
 * @param {HTMLElement} root
 * @returns {HTMLElement}
 */
function ensureModuleBadge(root) {
  let badge = root.querySelector("[data-dash-live-badge]");
  if (!badge) {
    badge = document.createElement("span");
    badge.dataset.dashLiveBadge = "";
    const head = root.querySelector(".rail-module__head, .intel-wl__header");
    if (head) head.appendChild(badge);
    else root.prepend(badge);
  }
  return badge;
}

/**
 * @returns {((symbols: string[]) => Promise<Record<string, { price?: number, pctChange?: number }>>) | null}
 */
function getFetchQuotes() {
  if (typeof window.fetchLiveQuotes === "function") return window.fetchLiveQuotes;
  return null;
}

/**
 * @param {number} pct
 */
function fmtPct(pct) {
  if (pct == null || Number.isNaN(pct)) return "—";
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}`;
}

/**
 * @param {HTMLElement} root
 * @param {Record<string, { price?: number, pctChange?: number }>} quotes
 */
function hydrateMoversModule(root, quotes) {
  const rows = root.querySelectorAll(".mover-row[data-mover-sym]");
  let liveCount = 0;
  rows.forEach((row) => {
    const sym = row.dataset.moverSym;
    const q = quotes[sym];
    if (!q || q.price == null || Number.isNaN(q.price)) return;
    liveCount++;
    const pct = q.pctChange ?? 0;
    const dir = pct > 0.05 ? "up" : pct < -0.05 ? "dn" : "flat";
    const priceEl = row.querySelector(".mover-row__price");
    const chgEl = row.querySelector(".mover-row__chg");
    if (priceEl) priceEl.textContent = q.price.toFixed(2);
    if (chgEl) {
      chgEl.textContent = `${fmtPct(pct)}%`;
      chgEl.className = `mover-row__chg mover-row__chg--${dir}`;
    }
    row.dataset.moverChg = `${fmtPct(pct)}%`;
    row.dataset.moverDir = dir;
    row.className = row.className.replace(/mover-row--(up|dn|flat)/, `mover-row--${dir}`);
  });

  const active = root.querySelector(".mover-row.is-active") || rows[0];
  if (active) {
    const sym = active.dataset.moverSym;
    const q = quotes[sym];
    const heroChg = root.querySelector(".movers-intel__hero-chg");
    if (heroChg && q) {
      const pct = q.pctChange ?? 0;
      const dir = pct > 0.05 ? "up" : pct < -0.05 ? "dn" : "flat";
      heroChg.textContent = `${fmtPct(pct)}%`;
      heroChg.className = `movers-intel__hero-chg movers-intel__hero-chg--${dir}`;
    }
  }

  const badge = root.querySelector("[data-dash-live-badge]");
  if (badge) {
    applyBadge(
      badge,
      liveCount >= 3 ? "live" : liveCount > 0 ? "mixed" : "illustrative",
      liveCount ? `${liveCount} symbols from market feed` : "Static preview prices"
    );
  }
}

/**
 * @param {HTMLElement} root
 * @param {Record<string, { pctChange?: number }>} quotes
 */
function hydrateSectorsModule(root, quotes) {
  let liveCount = 0;
  root.querySelectorAll(".sector-card[data-sector-id]").forEach((card) => {
    const id = card.dataset.sectorId;
    const etf = SECTOR_ETF[id];
    if (!etf) return;
    const q = quotes[etf];
    if (!q || q.pctChange == null || Number.isNaN(q.pctChange)) return;
    liveCount++;
    const pct = q.pctChange;
    const pctEl = card.querySelector(".sector-card__pct");
    if (pctEl) {
      const sign = pct >= 0 ? "+" : "";
      pctEl.textContent = `${sign}${pct.toFixed(2)}%`;
    }
    const dir = pct > 0.05 ? "up" : pct < -0.05 ? "dn" : "flat";
    card.classList.remove("sector-card--up", "sector-card--dn", "sector-card--flat");
    card.classList.add(`sector-card--${dir}`);
  });

  applyBadge(
    ensureModuleBadge(root),
    liveCount >= 4 ? "live" : liveCount > 0 ? "mixed" : "illustrative",
    liveCount ? `Sector ETFs (${liveCount} live)` : "Static sector preview"
  );
}

/**
 * @param {HTMLElement} root
 */
async function hydrateWatchlistModule(root) {
  if (typeof window.refreshDashboardWatchlistQuotes === "function") {
    await window.refreshDashboardWatchlistQuotes();
  }
  applyBadge(ensureModuleBadge(root), "live", "Watchlist quotes from market feed");
}

/**
 * @param {string} moduleId
 * @param {HTMLElement} root
 */
export async function hydrateDashboardModule(moduleId, root) {
  if (!root) return;
  const fetchQuotes = getFetchQuotes();

  try {
    if (moduleId === "movers" && fetchQuotes) {
      const quotes = await fetchQuotes(MOVER_SYMBOLS);
      hydrateMoversModule(root, quotes);
    } else if (moduleId === "heatmap" && fetchQuotes) {
      const etfs = Object.values(SECTOR_ETF);
      const quotes = await fetchQuotes(etfs);
      hydrateSectorsModule(root, quotes);
    } else if (moduleId === "volatility") {
      if (typeof window.refreshMarketRiskState === "function") {
        await window.refreshMarketRiskState({ fetchQuotes: true, fetchMacro: true });
      }
      hydrateMarketRiskGauge(root, window.riskState);
    } else if (moduleId === "watchlist") {
      await hydrateWatchlistModule(root);
    }
  } catch (e) {
    console.warn("[dashboard-live]", moduleId, e.message);
  }
}

/** Update dashboard pulse strip from live riskState. */
export async function hydrateDashboardPulse() {
  if (typeof window.refreshMarketRiskState === "function") {
    try {
      await window.refreshMarketRiskState({
        fetchQuotes: true,
        fetchMacro: false,
        refreshImpact: false,
      });
    } catch (_) {}
  }
}

/**
 * @param {string} moduleId
 * @param {HTMLElement} root
 */
export function scheduleModuleHydrate(moduleId, root) {
  requestAnimationFrame(() => {
    hydrateDashboardModule(moduleId, root);
  });
}

/**
 * Start periodic refresh while dashboard is active.
 */
export function startDashboardLiveRefresh() {
  if (refreshTimer) return;
  const tick = () => {
    const page = document.getElementById("page-dashboard");
    if (!page?.classList.contains("active")) return;
    hydrateDashboardPulse();
    const stage = document.getElementById("wheelModuleStage");
    const module = stage?.querySelector(".rail-module");
    if (!module) return;
    if (module.classList.contains("rail-module--movers")) hydrateDashboardModule("movers", module);
    if (module.classList.contains("rail-module--sectors")) hydrateDashboardModule("heatmap", module);
    if (module.classList.contains("rail-module--market-risk")) hydrateDashboardModule("volatility", module);
  };
  refreshTimer = setInterval(tick, 60_000);
  setTimeout(tick, 2000);
}
