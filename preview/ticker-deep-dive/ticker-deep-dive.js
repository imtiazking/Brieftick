/**
 * Ticker Deep Dive — slide-over (desktop) / full-screen (mobile).
 * Phase A: API-powered overview + drivers; Phase 2.3 context personalization.
 * @module preview/ticker-deep-dive/ticker-deep-dive
 */

import { getWimEntry } from "./wim-data.js";
import { genSeries, drawChart } from "./wim-charts.js";
import { renderPatternsPanel } from "./wim-patterns.js";
import { renderPositioningPanel } from "./wim-positioning.js";
import { createContagionMap } from "./wim-contagion.js";
import { fetchLiveQuote } from "./wim-quotes.js";
import { fetchDeepDiveBundle } from "./deep-dive-bundle.js";
import { composeDeepDiveIntel, provenanceBadgeHtml } from "./deep-dive-compose.js";
import { getTickerMeta } from "./ticker-meta.js";
import {
  buildDeepDiveContext,
  getDefaultTabForSource,
  getDriversSectionTitle,
  getPositioningSectionTitle,
  getPanelLeadHtml,
  getSourceKicker,
  renderContextStrip,
} from "./deep-dive-context.js";

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
/** @type {import('./deep-dive-context.js').DeepDiveContext|null} */
let openContext = null;
let activeTab = "overview";
let quoteRequest = 0;
let contagion = null;
let renderedTabs = new Set();
/** @type {import('./deep-dive-compose.js').ComposedDeepDiveIntel|null} */
let openIntel = null;
let intelRequest = 0;

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
      <div class="ticker-deep-dive__context-slot" id="tddContextSlot"></div>
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

/**
 * @param {string} sym
 * @param {string} source
 */
function tabPanelHtml(sym, source) {
  const meta = getTickerMeta(sym);
  const driversTitle = getDriversSectionTitle(source);
  const posTitle = getPositioningSectionTitle(source);
  const reactionHint = openContext?.reactionHint
    ? `<p class="tdd-reaction-hint">${esc(openContext.reactionHint)}</p>`
    : "";

  return `
    <div class="ticker-deep-dive__panels">
      <section class="tdd-panel" data-tdd-panel="overview">
        <div class="tdd-overview">
          <div id="tddLead-overview" class="tdd-context-lead-slot"></div>
          <div class="tdd-quote">
            <div class="tdd-quote__sym">${esc(sym)}</div>
            <div class="tdd-quote__name" id="tddName">${esc(meta.displayName)} · ${esc(meta.sectorLabel)}</div>
            <div class="tdd-quote__row">
              <span class="tdd-quote__price" id="tddPrice">—</span>
              <span class="tdd-quote__chg" id="tddChg" style="color:#ffb547">—</span>
            </div>
            <p class="tdd-quote__src" id="tddPriceSrc">Loading live price…</p>
          </div>
          <div class="tdd-chart-wrap">
            <div class="tdd-chart" id="tddChart" aria-label="Price chart"></div>
          </div>
          <div class="tdd-summary intel-takeaway">
            <div class="tdd-summary__head" id="tddProvenance"></div>
            <p class="tdd-summary__text" id="tddSummary">Loading intelligence…</p>
          </div>
        </div>
      </section>
      <section class="tdd-panel" data-tdd-panel="drivers" hidden>
        <h3 class="tdd-section-title">${esc(driversTitle)}</h3>
        <div id="tddLead-drivers" class="tdd-context-lead-slot"></div>
        <div class="tdd-drivers" id="tddDrivers"></div>
      </section>
      <section class="tdd-panel" data-tdd-panel="reaction" hidden>
        <h3 class="tdd-section-title">Market Reaction Map</h3>
        ${reactionHint}
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
        <h3 class="tdd-section-title">${esc(posTitle)}</h3>
        <div id="tddLead-positioning" class="tdd-context-lead-slot"></div>
        <div id="tddPositioning"></div>
      </section>
    </div>`;
}

function mountPanelLeads() {
  const slots = {
    overview: root?.querySelector("#tddLead-overview"),
    drivers: root?.querySelector("#tddLead-drivers"),
    positioning: root?.querySelector("#tddLead-positioning"),
  };
  for (const [panel, el] of Object.entries(slots)) {
    if (!el) continue;
    const html = getPanelLeadHtml(openContext, panel);
    el.innerHTML = html || "";
    el.hidden = !html;
  }
}

function renderDriversFromIntel() {
  const host = root.querySelector("#tddDrivers");
  if (!host || !openIntel?.reasons?.length) {
    if (host) host.innerHTML = `<p class="tdd-context-footnote">Loading drivers…</p>`;
    return;
  }
  host.innerHTML = openIntel.reasons
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

function applyIntelToOverview() {
  if (!openIntel || !root) return;
  const summaryEl = root.querySelector("#tddSummary");
  const provEl = root.querySelector("#tddProvenance");
  const nameEl = root.querySelector("#tddName");
  if (summaryEl) summaryEl.innerHTML = openIntel.summaryHtml;
  if (provEl) provEl.innerHTML = provenanceBadgeHtml(openIntel.provenance);
  if (nameEl) nameEl.textContent = openIntel.name;
  renderedTabs.delete("overview-chart");
  if (activeTab === "overview") paintOverviewChart();
}

function paintOverviewChart() {
  if (!root || !openSym) return;
  const chart = root.querySelector("#tddChart");
  if (!chart) return;
  const trend = openIntel?.trend ?? getWimEntry(openSym).trend;
  const color = openIntel?.chgColor || "#ff5b6e";
  const series = genSeries(80, 8, trend, openSym.charCodeAt(0));
  requestAnimationFrame(() => drawChart(chart, series, { color, id: `tdd_${openSym}` }));
  renderedTabs.add("overview-chart");
}

async function refreshDeepDiveIntel(sym, opts = {}) {
  const req = ++intelRequest;
  try {
    const bundle = await fetchDeepDiveBundle(sym, {
      quote: opts.quote,
      fusion: opts.fusion,
    });
    if (req !== intelRequest || !root) return;
    openIntel = composeDeepDiveIntel(bundle);
    applyIntelToOverview();
    if (bundle.quote?.price > 0) {
      applyLiveQuote(sym, bundle.quote, bundle.quote.provider || "API");
    }
    if (activeTab === "drivers") renderDriversFromIntel();
  } catch {
    if (req !== intelRequest || !root) return;
    const meta = getTickerMeta(sym);
    openIntel = {
      name: `${meta.displayName} · ${meta.sectorLabel}`,
      summaryHtml: `<b>${esc(sym)}</b> intelligence is temporarily unavailable. Sector context: ${esc(meta.sectorLabel)}.`,
      reasons: composeDeepDiveIntel({
        sym,
        meta,
        quote: null,
        companyNews: [],
        earnings: null,
        sectorMoves: [],
        primarySector: null,
        macro: {},
        provenance: "Sector Model",
        failedSources: ["compose:error"],
        fetchedAt: Date.now(),
      }).reasons,
      chgColor: "#ffb547",
      price: "—",
      chg: "—",
      trend: 0,
      provenance: "Sector Model",
    };
    applyIntelToOverview();
    if (activeTab === "drivers") renderDriversFromIntel();
  }
}

function renderActiveTab() {
  if (!root || !openSym) return;
  root.querySelectorAll("[data-tdd-panel]").forEach((p) => {
    const on = p.dataset.tddPanel === activeTab;
    p.hidden = !on;
  });

  if (activeTab === "overview" && !renderedTabs.has("overview-chart")) {
    paintOverviewChart();
  }

  if (activeTab === "drivers") renderDriversFromIntel();

  if (activeTab === "reaction" && !renderedTabs.has("reaction")) {
    const wrap = root.querySelector(".tdd-contagion");
    if (wrap) {
      contagion = createContagionMap(wrap, {
        onSymbolChange: () => {},
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
      if (openSource === "scanner") {
        const note = document.createElement("p");
        note.className = "tdd-context-footnote";
        note.textContent = "Discover Stocks view does not use your portfolio — positioning bars are market-wide.";
        host.appendChild(note);
      }
      renderedTabs.add("positioning");
    }
  }
}

function applyLiveQuote(sym, q, providerLabel) {
  const priceEl = root?.querySelector("#tddPrice");
  const chgEl = root?.querySelector("#tddChg");
  const srcEl = root?.querySelector("#tddPriceSrc");
  if (!q || !(q.price > 0)) {
    if (srcEl) srcEl.textContent = `Live price unavailable for ${sym} — showing narrative data`;
    return;
  }
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
    const prov = openIntel?.provenance ? ` · ${openIntel.provenance}` : "";
    srcEl.textContent = `Price source: ${providerLabel || q.provider || "API"}  ·  ${sym}  ·  Updated: ${ts}${prov}`;
  }
  if (openIntel && q.price > 0) {
    openIntel.price = q.price.toFixed(2);
    const isUp = q.pctChange >= 0;
    openIntel.chg = `${isUp ? "+" : ""}${(q.change || 0).toFixed(2)}  (${isUp ? "+" : ""}${(q.pctChange || 0).toFixed(2)}%)`;
    openIntel.chgColor = isUp ? "#3ddc97" : "#ff5b6e";
    openIntel.trend = q.pctChange >= 0 ? 0.08 : -0.25;
    const priceEl = root?.querySelector("#tddPrice");
    const chgEl = root?.querySelector("#tddChg");
    if (priceEl) priceEl.textContent = openIntel.price;
    if (chgEl) {
      chgEl.textContent = openIntel.chg;
      chgEl.style.color = openIntel.chgColor;
    }
  }
  if (contagion) {
    contagion.setQuoteCache({ [sym]: q });
  }
}

async function refreshLivePrice(sym) {
  const req = ++quoteRequest;
  const q = await fetchLiveQuote(sym);
  if (req !== quoteRequest || !root) return;
  applyLiveQuote(sym, q);
}

/**
 * @param {{
 *   symbol: string,
 *   source?: string,
 *   tab?: string,
 *   quote?: { price: number, pctChange: number, change?: number, provider?: string },
 *   weightPct?: number,
 *   context?: import('./deep-dive-context.js').DeepDiveContext,
 *   contextPayload?: object,
 *   fusion?: import('../../logic/dataFusion.js').FusionBundle,
 * }} opts
 */
export function openTickerDeepDive(opts) {
  const sym = String(opts?.symbol || "NVDA").toUpperCase();
  const source = opts?.source || "unknown";
  const tab =
    opts?.tab && TABS.some((t) => t.id === opts.tab)
      ? opts.tab
      : getDefaultTabForSource(source);

  ensureShell();
  openSym = sym;
  openSource = source;
  openContext =
    opts?.context ||
    buildDeepDiveContext(source, { ...opts?.contextPayload, symbol: sym }) ||
    null;
  renderedTabs = new Set();
  contagion = null;
  quoteRequest++;
  intelRequest++;
  openIntel = null;

  const meta = getTickerMeta(sym);
  root.querySelector("#tddTitle").textContent = sym;
  root.querySelector("#tddKicker").textContent = getSourceKicker(source);
  const weightNote =
    opts.weightPct != null && !Number.isNaN(Number(opts.weightPct))
      ? ` · ${Number(opts.weightPct).toFixed(1)}% of book`
      : openContext?.source === "portfolio" && opts.contextPayload?.weightPct != null
        ? ` · ${Number(opts.contextPayload.weightPct).toFixed(1)}% of book`
        : "";
  root.querySelector("#tddMeta").textContent =
    `${meta.displayName} · ${meta.sectorLabel}` + weightNote;

  const slot = root.querySelector("#tddContextSlot");
  if (slot) slot.innerHTML = openContext ? renderContextStrip(openContext) : "";

  const body = root.querySelector("#tddBody");
  if (body) body.innerHTML = tabPanelHtml(sym, source);
  mountPanelLeads();

  root.hidden = false;
  root.setAttribute("aria-hidden", "false");
  root.classList.add("is-open");
  document.body.classList.add("ticker-deep-dive-open");

  setTab(tab);
  refreshDeepDiveIntel(sym, { quote: opts.quote, fusion: opts.fusion });
  if (opts.quote?.price > 0) {
    applyLiveQuote(sym, opts.quote, opts.quote.provider || "Portfolio");
  } else {
    refreshLivePrice(sym);
  }

  requestAnimationFrame(() => panel?.focus?.());
}

export function closeTickerDeepDive() {
  if (!root) return;
  root.classList.remove("is-open");
  root.hidden = true;
  root.setAttribute("aria-hidden", "true");
  document.body.classList.remove("ticker-deep-dive-open");
  openSym = null;
  openContext = null;
  openIntel = null;
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
