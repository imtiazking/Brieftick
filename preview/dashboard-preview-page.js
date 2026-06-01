/**
 * Dashboard preview — shared wheel (modules in central panel only).
 * @module preview/dashboard-preview-page
 */

import { initIntelligenceWheel } from "./dashboard-wheel-core.js";
import { initTickerDeepDive } from "./ticker-deep-dive/ticker-deep-dive.js";

function init() {
  window.__DASHBOARD_PREVIEW = true;
  window.__DASHBOARD_DESIGN_LAB = true;
  document.documentElement.setAttribute("data-theme", "split");
  document.body.dataset.dashLabConcept = "wheel";
  document.getElementById("panelWheel")?.classList.add("is-active");
  initIntelligenceWheel();
  initTickerDeepDive();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
