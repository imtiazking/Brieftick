/**
 * Ticker Deep Dive — slide-over (desktop) / full-screen (mobile).
 * Phase 1: Movers + Watchlist entry; WIM tabs reused from legacy page.
 * @module preview/ticker-deep-dive/ticker-deep-dive
 */

import { getWimEntry } from "./wim-data.js";
import { genSeries, drawChart } from "./wim-charts.js";
import { renderPatternsPanel } from "./wim-patterns.js";
import { renderPositioningPanel } from "./wim-positioning.js";
import { createContagionMap } from "./wim-contagion.js";
import { fetchLiveQuote } from "./wim-quotes.js";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "drivers", label: "Drivers" },
  { id: "reaction", label: "Reaction" },
  { id: "patterns", label: "Patterns" },
  { id: "positioning", label: "Positioning" },
];

let root = null;
let panel = null;
let backdrop = null;
let openSym = null;
let openSource = null;
let activeTab = "overview";
let quoteRequest = 0;
let contagion = null;
let renderedTabs = new Set();

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function ensureShell() {
  if (root) return;
  root = document.createElement("div");
  root.id = "tickerDeepDiveRoot";
  root.className = "ticker-deep-dive";
  root.hidden = true;
  root.setAttribute("aria-hidden", "true");
  root.innerHTML = `
    <div class="ticker-deep-dive__backdrop" data-tdd-close tabindex="-1" aria-hidden="true"></div>
    <aside class="ticker-deep-dive__panel" role="dialog" aria-modal="true" aria-labelledby="tddTitle">
      <header class="ticker-deep-dive__head">
        <div class="ticker-deep-dive__head-main">
          <p class="ticker-deep-dive__kicker" id="tddKicker">Ticker Deep Dive</p>
          <h2 class="ticker-deep-dive__title" id="tddTitle">—</h2>
          <p class="ticker-deep-dive__meta" id="tddMeta"></p>
        </div>
        <button type="button" class="ticker-deep-dive__close" data-tdd-close aria-label="Close Deep Dive">×</button>
      </header>
      <nav class="ticker-deep-dive__tabs" id="tddTabs" aria-label="Deep Dive sections"></nav>
      <div class="ticker-deep-dive__body" id="tddBody"></div>
      <footer class="ticker-deep-dive__foot">
        <p>Educational context only. Not investment advice.</p>
      </footer>
    </aside>`;
  document.body.appendChild(root);
  backdrop = root.querySelector(".ticker-deep-dive__backdrop");
  panel = root.querySelector(".ticker-deep-dive__panel");
  const tabsEl = root.querySelector("#tddTabs");
  tabsEl.innerHTML = TABS.map(
    (t) =>
      `<button type="button" class="ticker-deep-dive__tab" data-tdd-tab="${t.id}" aria-selected="false">${t.label}</button>`
  ).join("");

  root.addEventListener("click", (e) => {
    if (e.target.closest("[data-tdd-close]")) closeTickerDeepDive();
    const tabBtn = e.target.closest("[data-tdd-tab]");
    if (tabBtn) setTab(tabBtn.dataset.tddTab);
  });

  document.addEventListener("keydown", (e) => {
    if (!root?.classList.contains("is-open")) return;
    if (e.key === "Escape") closeTickerDeepDive();
  });
}

function setTab(id) {
  if (!TABS.some((t) => t.id === id)) return;
  activeTab = id;
  root.querySelectorAll("[data-tdd-tab]").forEach((btn) => {
    const on = btn.dataset.tddTab === id;
    btn.classList.toggle("is-active", on);
    btn.setAttribute("aria-selected", on ? "true" : "false");
  });
  renderActiveTab();
}

function tabPanelHtml(sym) {
  const d = getWimEntry(sym);
  return `
    <div class="ticker-deep-dive__panels">
      <section class="tdd-panel" data-tdd-panel="overview">
        <div class="tdd-overview">
          <div class="tdd-quote">
            <div class="tdd-quote__sym">${esc(sym)}</div>
            <div class="tdd-quote__name" id="tddName">${esc(d.name)}</div>
            <div class="tdd-quote__row">
              <span class="tdd-quote__price" id="tddPrice">${esc(d.price)}</span>
              <span class="tdd-quote__chg" id="tddChg" style="color:${d.chgColor}">${esc(d.chg)}</span>
            </div>
            <p class="tdd-quote__src" id="tddPriceSrc">Loading live price…</p>
          </div>
          <div class="tdd-chart-wrap">
            <div class="tdd-chart" id="tddChart" aria-label="Price chart"></div>
          </div>
          <div class="tdd-summary intel-takeaway">
            <p class="tdd-summary__text" id="tddSummary">${d.summary}</p>
          </div>
        </div>
      </section>
      <section class="tdd-panel" data-tdd-panel="drivers" hidden>
        <h3 class="tdd-section-title">Movement decomposition</h3>
        <div class="tdd-drivers" id="tddDrivers"></div>
      </section>
      <section class="tdd-panel" data-tdd-panel="reaction" hidden>
        <h3 class="tdd-section-title">Market Reaction Map</h3>
        <div class="tdd-contagion contagion-wrap">
          <div class="tdd-contagion__trail contagion-trail"></div>
          <div class="reaction-map-body">
            <svg class="tdd-contagion__svg contagion-svg" viewBox="0 0 480 380" aria-label="Reaction map"></svg>
            <div class="tdd-contagion__detail reaction-detail"></div>
          </div>
          <div class="contagion-legend">
            <span><i style="background:#3ddc97"></i> Positive sympathy</span>
            <span><i style="background:#ff5b6e"></i> Negative sympathy</span>
            <span><i style="background:#ffb547"></i> Mixed / low beta</span>
            <span class="contagion-hint">Click a node to re-center the map</span>
          </div>
        </div>
      </section>
      <section class="tdd-panel" data-tdd-panel="patterns" hidden>
        <div id="tddPatterns"></div>
      </section>
      <section class="tdd-panel" data-tdd-panel="positioning" hidden>
        <h3 class="tdd-section-title">Market Positioning</h3>
        <div id="tddPositioning"></div>
      </section>
    </div>`;
}

function renderDrivers(sym) {
  const d = getWimEntry(sym);
  const host = root.querySelector("#tddDrivers");
  if (!host) return;
  host.innerHTML = d.reasons
    .map(
      ([title, desc, weight], i) => `
    <article class="reason">
      <span class="reason-rank">${i + 1}</span>
      <div class="reason-content">
        <div class="ttl">${esc(title)}</div>
        <div class="det">${esc(desc)}</div>
      </div>
      <div class="reason-weight"><b>${esc(weight)}</b> weight</div>
    </article>`
    )
    .join("");
}

function renderActiveTab() {
  if (!root || !openSym) return;
  root.querySelectorAll("[data-tdd-panel]").forEach((p) => {
    const on = p.dataset.tddPanel === activeTab;
    p.hidden = !on;
  });

  if (activeTab === "overview" && !renderedTabs.has("overview-chart")) {
    const d = getWimEntry(openSym);
    const chart = root.querySelector("#tddChart");
    if (chart) {
      const series = genSeries(80, 8, d.trend, openSym.charCodeAt(0));
      const color = d.chgColor || "#ff5b6e";
      requestAnimationFrame(() => drawChart(chart, series, { color, id: `tdd_${openSym}` }));
      renderedTabs.add("overview-chart");
    }
  }

  if (activeTab === "drivers") renderDrivers(openSym);

  if (activeTab === "reaction" && !renderedTabs.has("reaction")) {
    const wrap = root.querySelector(".tdd-contagion");
    if (wrap) {
      contagion = createContagionMap(wrap, {
        onSymbolChange: (s) => {
          /* stay on reaction tab while exploring peers */
        },
      });
      contagion.mount(openSym);
      renderedTabs.add("reaction");
    }
  }

  if (activeTab === "patterns" && !renderedTabs.has("patterns")) {
    const host = root.querySelector("#tddPatterns");
    if (host) {
      renderPatternsPanel(host, openSym);
      renderedTabs.add("patterns");
    }
  }

  if (activeTab === "positioning" && !renderedTabs.has("positioning")) {
    const host = root.querySelector("#tddPositioning");
    if (host) {
      renderPositioningPanel(host, openSym);
      renderedTabs.add("positioning");
    }
  }
}

async function refreshLivePrice(sym) {
  const req = ++quoteRequest;
  const priceEl = root?.querySelector("#tddPrice");
  const chgEl = root?.querySelector("#tddChg");
  const srcEl = root?.querySelector("#tddPriceSrc");
  const q = await fetchLiveQuote(sym);
  if (req !== quoteRequest || !root) return;
  if (q && q.price > 0) {
    const isUp = q.pctChange >= 0;
    const sign = isUp ? "+" : "";
    const color = isUp ? "#3ddc97" : "#ff5b6e";
    if (priceEl) priceEl.textContent = q.price.toFixed(2);
    if (chgEl) {
      chgEl.textContent = `${sign}${(q.change || 0).toFixed(2)}  (${sign}${(q.pctChange || 0).toFixed(2)}%)`;
      chgEl.style.color = color;
    }
    if (srcEl) {
      const ts = new Date().toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
      srcEl.textContent = `Price source: ${q.provider || "API"}  ·  ${sym}  ·  Updated: ${ts}`;
    }
    if (contagion) {
      contagion.setQuoteCache({ [sym]: q });
    }
  } else if (srcEl) {
    srcEl.textContent = `Live price unavailable for ${sym} — showing narrative data`;
  }
}

/**
 * @param {{ symbol: string, source?: string, tab?: string }} opts
 */
export function openTickerDeepDive(opts) {
  const sym = String(opts?.symbol || "NVDA").toUpperCase();
  const source = opts?.source || "unknown";
  const tab = opts?.tab && TABS.some((t) => t.id === opts.tab) ? opts.tab : "overview";

  ensureShell();
  openSym = sym;
  openSource = source;
  renderedTabs = new Set();
  contagion = null;
  quoteRequest++;

  const d = getWimEntry(sym);
  root.querySelector("#tddTitle").textContent = sym;
  root.querySelector("#tddKicker").textContent = `Ticker Deep Dive · ${source.replace(/-/g, " ")}`;
  root.querySelector("#tddMeta").textContent = d.name;

  const body = root.querySelector("#tddBody");
  if (body) body.innerHTML = tabPanelHtml(sym);

  root.hidden = false;
  root.setAttribute("aria-hidden", "false");
  root.classList.add("is-open");
  document.body.classList.add("ticker-deep-dive-open");

  setTab(tab);
  refreshLivePrice(sym);

  requestAnimationFrame(() => panel?.focus?.());
}

export function closeTickerDeepDive() {
  if (!root) return;
  root.classList.remove("is-open");
  root.hidden = true;
  root.setAttribute("aria-hidden", "true");
  document.body.classList.remove("ticker-deep-dive-open");
  openSym = null;
  contagion = null;
}

export function initTickerDeepDive() {
  ensureShell();
  const params = new URLSearchParams(window.location.search);
  const sym = params.get("symbol") || params.get("sym");
  if (sym) {
    openTickerDeepDive({ symbol: sym, source: "url", tab: params.get("tab") || "overview" });
  }
}

export function getTickerDeepDiveApi() {
  return { open: openTickerDeepDive, close: closeTickerDeepDive };
}
