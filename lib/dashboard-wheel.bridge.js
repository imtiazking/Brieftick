/**
 * Mount Intelligence Wheel inside #page-dashboard (main app shell).
 * Standalone QA remains at /dashboard-preview.
 * @module lib/dashboard-wheel.bridge
 */

import { initIntelligenceWheel } from "/preview/dashboard-wheel-core.js";
import { initTickerDeepDiveBridge } from "./ticker-deep-dive.bridge.js";
import {
  hydrateDashboardPulse,
  startDashboardLiveRefresh,
} from "/lib/dashboard-live-bridge.js";

let wheelStarted = false;
let globeModulesReady = null;

/** Preload Three.js ES modules used by News globe (same entry points as dashboard-preview). */
function preloadNewsGlobeModules() {
  if (!globeModulesReady) {
    globeModulesReady = Promise.all([
      import("three"),
      import("three-conic-polygon-geometry"),
      import("three-geojson-geometry"),
    ]).catch((err) => {
      globeModulesReady = null;
      console.warn("[dashboard wheel] News globe module preload failed", err);
      throw err;
    });
  }
  return globeModulesReady;
}

/**
 * Boot wheel modules when Dashboard page is active.
 */
export function mountDashboardWheel() {
  const page = document.getElementById("page-dashboard");
  if (!page?.classList.contains("active")) return;

  document.body.classList.add("dash-in-app-wheel");
  page.dataset.dashView = "wheel";

  const legacy = document.getElementById("dashLegacyFallback");
  if (legacy) {
    legacy.hidden = true;
    legacy.setAttribute("aria-hidden", "true");
  }

  const experience = document.getElementById("dashWheelExperience");
  if (experience) experience.hidden = false;

  if (wheelStarted) return;
  preloadNewsGlobeModules().catch(() => {});
  initIntelligenceWheel();
  initTickerDeepDiveBridge().catch(() => {});
  startDashboardLiveRefresh();
  hydrateDashboardPulse();
  wheelStarted = true;
}

function installRouteHook() {
  const orig = window.route;
  if (!orig || orig.__dashWheelRouteHook) return;

  function dashWheelRoute(name) {
    orig(name);
    if (name === "dashboard") {
      requestAnimationFrame(() => mountDashboardWheel());
    }
  }

  dashWheelRoute.__dashWheelRouteHook = true;
  if (orig.__splitThemeHook) dashWheelRoute.__splitThemeHook = true;
  window.route = dashWheelRoute;
}

function watchDashboardPage() {
  const page = document.getElementById("page-dashboard");
  if (!page) return;

  new MutationObserver(() => {
    if (page.classList.contains("active")) mountDashboardWheel();
  }).observe(page, { attributes: true, attributeFilter: ["class"] });
}

function init() {
  installRouteHook();
  watchDashboardPage();
  if (document.getElementById("page-dashboard")?.classList.contains("active")) {
    mountDashboardWheel();
  }

  window.addEventListener("load", () => {
    installRouteHook();
    if (document.getElementById("page-dashboard")?.classList.contains("active")) {
      mountDashboardWheel();
    }
  });

  setTimeout(() => {
    installRouteHook();
    if (document.getElementById("page-dashboard")?.classList.contains("active")) {
      mountDashboardWheel();
    }
  }, 2800);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
