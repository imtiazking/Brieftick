/**
 * Fetch live inputs and maintain window.riskState for the Dashboard.
 * @module lib/market-risk-runner
 */

import { computeMarketRisk, createInitialRiskState } from "/lib/market-risk-engine.js";
import { syncAllRiskSurfaces } from "/lib/market-risk-ui.js";

const RISK_QUOTE_SYMBOLS = [
  "SPY",
  "QQQ",
  "IWM",
  "NVDA",
  "XLK",
  "XLU",
  "XLE",
  "XLF",
  "XLV",
];

let refreshInFlight = false;

/**
 * @param {string} series
 */
async function fetchFredSeries(series) {
  try {
    const res = await fetch(`/api/proxy?provider=fred&series=${encodeURIComponent(series)}`);
    if (!res.ok) return null;
    const data = await res.json();
    const value = parseFloat(data?.value);
    if (!Number.isFinite(value)) return null;
    return {
      value,
      change: data.change != null ? parseFloat(data.change) : null,
      date: data.date,
    };
  } catch {
    return null;
  }
}

/**
 * @returns {Promise<{ dgs10: number | null, dgs2: number | null, dgs10Change: number | null, dgs2Change: number | null }>}
 */
async function fetchRates() {
  const [d10, d2] = await Promise.all([fetchFredSeries("DGS10"), fetchFredSeries("DGS2")]);
  return {
    dgs10: d10?.value ?? null,
    dgs2: d2?.value ?? null,
    dgs10Change: d10?.change ?? null,
    dgs2Change: d2?.change ?? null,
  };
}

/**
 * @returns {Promise<number | null>}
 */
async function fetchVix() {
  const row = await fetchFredSeries("VIXCLS");
  return row?.value ?? null;
}

/**
 * @returns {import('/lib/market-risk-engine.js').SectorSnap[]}
 */
function getSectorSnapshot() {
  if (typeof window.getBrieftickSectorSnapshot === "function") {
    return window.getBrieftickSectorSnapshot();
  }
  return [];
}

/**
 * @returns {unknown[]}
 */
function getImpactItems() {
  return Array.isArray(window._briefTickImpactData) ? window._briefTickImpactData : [];
}

/**
 * @param {Record<string, { pctChange?: number, price?: number }>} quotePatch
 */
export function applyMarketRiskQuotes(quotePatch = {}) {
  const prev = window.riskState || createInitialRiskState();
  const mergedQuotes = { ...prev.quotes, ...quotePatch };
  const next = computeMarketRisk({
    vix: typeof window.vixValue === "number" ? window.vixValue : prev.vix,
    quotes: mergedQuotes,
    sectors: getSectorSnapshot(),
    rates: prev.rates || {},
    impactItems: getImpactItems(),
  });
  publishRiskState(next);
}

/**
 * @param {object} [opts]
 * @param {boolean} [opts.fetchQuotes]
 * @param {boolean} [opts.fetchMacro]
 * @param {boolean} [opts.refreshImpact]
 */
export async function refreshMarketRiskState(opts = {}) {
  if (refreshInFlight) return window.riskState;
  refreshInFlight = true;

  const fetchQuotes = opts.fetchQuotes !== false;
  const fetchMacro = opts.fetchMacro !== false;
  const refreshImpact = opts.refreshImpact === true;

  try {
    if (refreshImpact && typeof window.liveRefreshImpactFeed === "function") {
      try {
        await window.liveRefreshImpactFeed();
      } catch (e) {
        console.warn("[market-risk] impact feed", e.message);
      }
    }

    const prev = window.riskState || createInitialRiskState();
    let quotes = { ...prev.quotes };
    let vix = prev.vix;
    let rates = { ...prev.rates };

    if (fetchMacro) {
      const [vixVal, ratesVal] = await Promise.all([fetchVix(), fetchRates()]);
      if (vixVal != null) {
        vix = vixVal;
        window.vixValue = vixVal;
        window._vixFredValue = vixVal;
      }
      rates = ratesVal;
    }

    if (fetchQuotes && typeof window.fetchLiveQuotes === "function") {
      const live = await window.fetchLiveQuotes(RISK_QUOTE_SYMBOLS);
      quotes = { ...quotes, ...live };
    }

    const next = computeMarketRisk({
      vix,
      quotes,
      sectors: getSectorSnapshot(),
      rates,
      impactItems: getImpactItems(),
    });

    publishRiskState(next);
    return next;
  } finally {
    refreshInFlight = false;
  }
}

/**
 * @param {ReturnType<typeof computeMarketRisk>} state
 */
function publishRiskState(state) {
  window.riskState = state;
  syncAllRiskSurfaces(state);
  document.dispatchEvent(new CustomEvent("bt_risk_state_updated", { detail: state }));
}

function init() {
  if (!window.riskState) {
    publishRiskState(createInitialRiskState());
  }

  window.refreshMarketRiskState = refreshMarketRiskState;
  window.__applyMarketRiskQuotes = applyMarketRiskQuotes;

  document.addEventListener("bt_risk_state_updated", (ev) => {
    const stage = document.getElementById("wheelModuleStage");
    const module = stage?.querySelector(".rail-module");
    if (!module) return;
    const state = ev.detail || window.riskState;
    if (module.classList.contains("rail-module--market-risk")) {
      import("/lib/market-risk-ui.js").then(({ hydrateMarketRiskGauge }) => {
        hydrateMarketRiskGauge(module, state);
      });
    }
    if (module.classList.contains("rail-module--briefing")) {
      import("/preview/dashboard-preview-briefing.js").then(({ refreshBriefingFromRiskState }) => {
        refreshBriefingFromRiskState(module, state);
      });
    }
  });
}

init();
