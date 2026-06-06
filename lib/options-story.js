/**
 * Production Options page · Options Story.
 * @module lib/options-story
 */

import {
  OPTIONS_STORY,
  buildTodayStorySummary,
  buildPositioningLabel,
  buildPositioningWhy,
  unusualRowMatchesFlow,
} from "/lib/options-story-themes.js";

/** @type {string | null} */
let activeFlowId = null;

function esc(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * @returns {import('./options-story-themes.js').OPTIONS_STORY['flows'][0] | null}
 */
export function getOptionsFlowFilter() {
  if (!activeFlowId) return null;
  return OPTIONS_STORY.flows.find((f) => f.id === activeFlowId) || null;
}

function scrollToActivity() {
  document.getElementById("optionsActivitySection")?.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
}

function syncFlowCards() {
  const flow = getOptionsFlowFilter();
  document.querySelectorAll("#page-options .osf-flow-unit").forEach((unit) => {
    unit.classList.toggle("is-selected", flow && unit.dataset.flowId === flow.id);
  });
}

function switchOptionsTab(otab) {
  const tabBtn = document.querySelector(
    `#page-options .options-tab[data-otab="${otab}"]`
  );
  if (tabBtn && !tabBtn.classList.contains("active")) {
    tabBtn.click();
  }
}

function applyActivityFilter() {
  const flow = getOptionsFlowFilter();
  const typeSel = document.getElementById("optTypeFilter");
  const sentSel = document.getElementById("optSentFilter");

  if (!flow) {
    if (typeSel) typeSel.value = "";
    if (sentSel) sentSel.value = "";
    if (typeof window.filterUnusualActivity === "function") {
      window.filterUnusualActivity();
    }
    return;
  }

  switchOptionsTab(flow.otab || "unusual");

  if (typeSel) typeSel.value = flow.typeFilter || "";
  if (sentSel) sentSel.value = flow.sentimentFilter || "";

  if (typeof window.filterUnusualActivity === "function") {
    window.filterUnusualActivity();
  }
}

/**
 * @param {string} flowId
 * @param {{ scroll?: boolean }} [opts]
 */
export function applyOptionsFlowFilter(flowId, opts = {}) {
  activeFlowId = flowId;
  syncFlowCards();
  applyActivityFilter();
  if (opts.scroll) scrollToActivity();
}

/**
 * @param {{ scroll?: boolean }} [opts]
 */
export function clearOptionsFlowFilter(opts = {}) {
  activeFlowId = null;
  syncFlowCards();
  applyActivityFilter();
  if (opts.scroll) scrollToActivity();
}

export function refreshOptionsStorySummary() {
  const todayEl = document.getElementById("osfTodayBody");
  const labelEl = document.getElementById("osfPositionLabel");
  const whyEl = document.getElementById("osfPositionWhy");
  const data =
    typeof window.getOptionsUnusualData === "function"
      ? window.getOptionsUnusualData()
      : [];

  if (todayEl) todayEl.textContent = buildTodayStorySummary(data);
  if (labelEl) {
    const label = buildPositioningLabel(data);
    labelEl.textContent = label;
    labelEl.classList.remove(
      "osf-positioning__label--neutral",
      "osf-positioning__label--defensive"
    );
    if (label === "Neutral") labelEl.classList.add("osf-positioning__label--neutral");
    if (label === "Defensive") labelEl.classList.add("osf-positioning__label--defensive");
  }
  if (whyEl) whyEl.textContent = buildPositioningWhy(data);
}

function mountOptionsStory() {
  const root = document.getElementById("optionsStoryMount");
  if (!root || root.dataset.mounted) return;
  root.dataset.mounted = "1";

  const story = OPTIONS_STORY.todayStory;
  const pos = OPTIONS_STORY.overallPositioning;
  const tickers = (names) =>
    names
      .map((n) => `<span class="osf-preview__ticker">${esc(n)}</span>`)
      .join("");

  const flowHtml = OPTIONS_STORY.flows
    .map(
      (flow) => `
    <div class="osf-flow-unit" data-flow-id="${esc(flow.id)}">
      <div class="osf-flow-unit__card">
        <button type="button" class="osf-flow-card" data-flow-id="${esc(flow.id)}" data-tone="${esc(flow.tone)}">
          <span class="osf-flow-card__label">${esc(flow.label)}</span>
          <span class="osf-flow-card__headline">${esc(flow.headline)}</span>
        </button>
        <div class="osf-flow-preview" aria-hidden="true">
          <div class="osf-flow-preview__row">
            <span class="osf-flow-preview__label">Key names</span>
            <div class="osf-flow-preview__tickers">${tickers(flow.keyNames)}</div>
          </div>
          <p class="osf-flow-preview__why"><strong>Why:</strong> ${esc(flow.why)}</p>
          <p class="osf-flow-preview__matters"><strong>Why it matters:</strong> ${esc(flow.whyItMatters)}</p>
        </div>
      </div>
    </div>
  `
    )
    .join("");

  root.innerHTML = `
    <section class="osf-story" aria-label="Options story">
      <div class="osf-today-story" aria-labelledby="osfTodayEyebrow">
        <p class="osf-today-story__eyebrow" id="osfTodayEyebrow">${esc(story.eyebrow)}</p>
        <p class="osf-today-story__beta" id="osfBetaSubtext">Live options flow coming soon</p>
        <p class="osf-today-story__body" id="osfTodayBody">${esc(story.defaultBody)}</p>
      </div>
      <aside class="osf-positioning" aria-label="Overall positioning">
        <h3 class="osf-positioning__title">${esc(pos.title)}</h3>
        <p class="osf-positioning__label" id="osfPositionLabel">${esc(pos.defaultLabel)}</p>
        <p class="osf-positioning__why" id="osfPositionWhy">${esc(pos.defaultWhy)}</p>
      </aside>
      <div class="osf-flows-grid">${flowHtml}</div>
      <button type="button" class="osf-view-activity" id="osfViewActivity">
        View activity
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 5v14M5 12l7 7 7-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
    </section>
  `;

  root.querySelectorAll(".osf-flow-card").forEach((card) => {
    card.addEventListener("click", () => {
      applyOptionsFlowFilter(card.dataset.flowId, { scroll: false });
      root.querySelectorAll(".osf-flow-unit").forEach((u) => {
        u.classList.toggle("is-selected", u.dataset.flowId === card.dataset.flowId);
      });
    });
  });

  document.getElementById("osfViewActivity")?.addEventListener("click", () => {
    scrollToActivity();
  });
}

function init() {
  mountOptionsStory();
  refreshOptionsStorySummary();

  window.getOptionsFlowFilter = getOptionsFlowFilter;
  window.applyOptionsFlowFilter = applyOptionsFlowFilter;
  window.clearOptionsFlowFilter = clearOptionsFlowFilter;
  window.refreshOptionsStorySummary = refreshOptionsStorySummary;
  window.optionsUnusualRowMatchesFlow = unusualRowMatchesFlow;
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
