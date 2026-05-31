/**
 * Shared Intelligence Wheel — used by dashboard-preview and design-lab wheel concept.
 * @module preview/dashboard-wheel-core
 */

import {
  WHEEL_SECTIONS,
  renderRailModule,
  renderWheelPulseStrip,
  bindIntelligenceModule,
} from "./dashboard-rail-mocks.js";
import { bindInteractiveCharts } from "./dashboard-intel-charts.js";
import { createIntelligenceWheel } from "./dashboard-design-wheel.js";
import { renderWatchlistModule, bindWatchlistPanel } from "./dashboard-preview-watchlist.js";
import { renderMarketBriefingModule, bindMarketBriefing } from "./dashboard-preview-briefing.js";

let activeWheelId = "movers";
let wheelBuilt = false;
let moduleSwapToken = 0;

export function selectWheelModule(id) {
  activeWheelId = id;
  const stage = document.getElementById("wheelModuleStage");
  if (!stage) return;

  const swapToken = ++moduleSwapToken;
  stage.classList.remove("is-visible");
  requestAnimationFrame(() => {
    if (swapToken !== moduleSwapToken) return;

    const section = WHEEL_SECTIONS.find((s) => s.id === id);

    if (id === "watchlist") {
      stage.innerHTML = renderWatchlistModule();
      stage.classList.add("is-visible");
      bindWatchlistPanel(stage);
      return;
    }

    if (id === "session" && section) {
      stage.innerHTML = renderMarketBriefingModule(section);
      stage.classList.add("is-visible");
      bindMarketBriefing(stage);
      return;
    }

    stage.innerHTML = renderRailModule(id);
    stage.classList.add("is-visible");
    bindIntelligenceModule(stage, id);
    bindInteractiveCharts(stage, id);
  });
}

/**
 * @param {{ sections?: { id: string, label: string }[], initialId?: string }} [options]
 */
export function initIntelligenceWheel(options = {}) {
  const strip = document.getElementById("wheelPulseStrip");
  if (strip) strip.innerHTML = renderWheelPulseStrip();

  const viewport = document.getElementById("wheelViewport");
  if (!viewport) return null;

  const sections = options.sections || WHEEL_SECTIONS;
  const initialId = options.initialId || activeWheelId;

  if (!wheelBuilt) {
    viewport.dataset.built = "1";
    wheelBuilt = true;
    createIntelligenceWheel(viewport, sections, {
      initialId,
      onActiveChange: (id) => selectWheelModule(id),
    });
  }

  selectWheelModule(initialId);
  return viewport;
}
