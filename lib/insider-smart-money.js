/**
 * Production Insider page · Smart Money Flow (Concept B).
 * @module lib/insider-smart-money
 */

import {
  INSIDER_SMART_MONEY,
  buildOverallFlowSummary,
  corporateRowMatchesFlow,
  politicsRowMatchesFlow,
  clusterSymMatchesFlow,
} from "/lib/insider-smart-money-themes.js";

/** @type {string | null} */
let activeFlowId = null;

function esc(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * @returns {import('/lib/insider-smart-money-themes.js').INSIDER_SMART_MONEY['flows'][0] | null}
 */
export function getInsiderFlowFilter() {
  if (!activeFlowId) return null;
  return INSIDER_SMART_MONEY.flows.find((f) => f.id === activeFlowId) || null;
}

function scrollToFilings() {
  document.getElementById("insidersFilingsSection")?.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
}

function syncFlowCards() {
  const flow = getInsiderFlowFilter();
  document.querySelectorAll("#page-insiders .ismf-flow-unit").forEach((unit) => {
    unit.classList.toggle("is-selected", flow && unit.dataset.flowId === flow.id);
  });
  document.querySelectorAll("#page-insiders .ismf-flow-card").forEach((card) => {
    card.classList.toggle("active", flow && card.dataset.flowId === flow.id);
  });
}

function switchInsidersTab(itab) {
  const tabBtn = document.querySelector(
    `#page-insiders .insiders-tab[data-itab="${itab}"]`
  );
  if (tabBtn && !tabBtn.classList.contains("active")) {
    tabBtn.click();
  } else if (itab === "notable" && typeof window.buildNotableClusters === "function") {
    window.buildNotableClusters();
  }
}

function applyFilingsFilter() {
  const flow = getInsiderFlowFilter();
  const dirSel = document.getElementById("insidersDirectionFilter");

  if (!flow) {
    if (dirSel) dirSel.value = "";
    if (typeof window.filterInsidersTable === "function") window.filterInsidersTable();
    if (typeof window.filterPoliticsCards === "function") window.filterPoliticsCards();
    if (typeof window.buildNotableClusters === "function") window.buildNotableClusters();
    return;
  }

  if (dirSel && flow.itab === "corporate" && flow.direction) {
    dirSel.value = flow.direction;
  }

  switchInsidersTab(flow.itab);

  if (flow.itab === "corporate" && typeof window.filterInsidersTable === "function") {
    window.filterInsidersTable();
  } else if (flow.itab === "politics" && typeof window.filterPoliticsCards === "function") {
    window.filterPoliticsCards();
  } else if (flow.itab === "notable" && typeof window.buildNotableClusters === "function") {
    window.buildNotableClusters();
  }
}

/**
 * @param {string} flowId
 * @param {{ scroll?: boolean }} [opts]
 */
export function applyInsiderFlowFilter(flowId, opts = {}) {
  activeFlowId = flowId;
  syncFlowCards();
  applyFilingsFilter();
  if (opts.scroll) scrollToFilings();
}

/**
 * @param {{ scroll?: boolean }} [opts]
 */
export function clearInsiderFlowFilter(opts = {}) {
  activeFlowId = null;
  const dirSel = document.getElementById("insidersDirectionFilter");
  if (dirSel) dirSel.value = "";
  syncFlowCards();
  applyFilingsFilter();
  if (opts.scroll) scrollToFilings();
}

export function refreshInsiderSmartMoneySummary() {
  const el = document.getElementById("ismfOverallBody");
  if (!el) return;
  const corp =
    typeof window.getInsidersCorpData === "function"
      ? window.getInsidersCorpData()
      : [];
  const pol =
    typeof window.getInsidersPoliticsData === "function"
      ? window.getInsidersPoliticsData()
      : [];
  el.textContent = buildOverallFlowSummary(corp, pol);
}

function mountSmartMoneyStory() {
  const root = document.getElementById("insidersSmartMoneyMount");
  if (!root || root.dataset.mounted) return;
  root.dataset.mounted = "1";

  const tickers = (names) =>
    names
      .map((n) => `<span class="ismf-preview__ticker">${esc(n)}</span>`)
      .join("");

  const flowHtml = INSIDER_SMART_MONEY.flows
    .map(
      (flow) => `
    <div class="ismf-flow-unit" data-flow-id="${esc(flow.id)}">
      <div class="ismf-flow-unit__card">
        <button type="button" class="ismf-flow-card" data-flow-id="${esc(flow.id)}" data-tone="${esc(flow.tone)}">
          <span class="ismf-flow-card__label">${esc(flow.label)}</span>
          <span class="ismf-flow-card__sector">${esc(flow.sector)}</span>
        </button>
        <div class="ismf-flow-preview" aria-hidden="true">
          <div class="ismf-flow-preview__row">
            <span class="ismf-flow-preview__label">Key names</span>
            <div class="ismf-flow-preview__tickers">${tickers(flow.keyNames)}</div>
          </div>
          <p class="ismf-flow-preview__why"><strong>Why:</strong> ${esc(flow.why)}</p>
          <p class="ismf-flow-preview__matters"><strong>Why it matters:</strong> ${esc(flow.whyItMatters)}</p>
        </div>
      </div>
    </div>
  `
    )
    .join("");

  root.innerHTML = `
    <section class="ismf-story" aria-labelledby="ismfStoryTitle">
      <h2 class="ismf-story__title" id="ismfStoryTitle">${esc(INSIDER_SMART_MONEY.title)}</h2>
      <aside class="ismf-overall" aria-label="Overall flow summary">
        <h3 class="ismf-overall__title">${esc(INSIDER_SMART_MONEY.overallFlowTitle)}</h3>
        <p class="ismf-overall__body" id="ismfOverallBody">${esc(INSIDER_SMART_MONEY.defaultOverallBody)}</p>
      </aside>
      <div class="ismf-flows-grid">${flowHtml}</div>
      <button type="button" class="ismf-view-filings" id="ismfViewFilings">
        View filings
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 5v14M5 12l7 7 7-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
    </section>
  `;

  root.querySelectorAll(".ismf-flow-card").forEach((card) => {
    card.addEventListener("click", () => {
      applyInsiderFlowFilter(card.dataset.flowId, { scroll: false });
      root.querySelectorAll(".ismf-flow-unit").forEach((u) => {
        u.classList.toggle("is-selected", u.dataset.flowId === card.dataset.flowId);
      });
    });
  });

  document.getElementById("ismfViewFilings")?.addEventListener("click", () => {
    if (!activeFlowId) clearInsiderFlowFilter({ scroll: true });
    else scrollToFilings();
  });
}

function init() {
  mountSmartMoneyStory();
  refreshInsiderSmartMoneySummary();

  window.getInsiderFlowFilter = getInsiderFlowFilter;
  window.applyInsiderFlowFilter = applyInsiderFlowFilter;
  window.clearInsiderFlowFilter = clearInsiderFlowFilter;
  window.refreshInsiderSmartMoneySummary = refreshInsiderSmartMoneySummary;
  window.insiderCorporateRowMatchesFlow = corporateRowMatchesFlow;
  window.insiderPoliticsRowMatchesFlow = politicsRowMatchesFlow;
  window.insiderClusterSymMatchesFlow = clusterSymMatchesFlow;
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
