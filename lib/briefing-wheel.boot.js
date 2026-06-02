/**
 * Production What's Moving — Briefing Wheel mount.
 * @module lib/briefing-wheel.boot
 */

import { initWheelLab } from "/design-lab/wheel-system/_wheel-lab-core.js";
import { BRIEFING_WHEEL } from "/design-lab/wheel-system/_wheel-configs.js";
import { initTickerDeepDiveBridge } from "/lib/ticker-deep-dive.bridge.js";

let mounted = false;

/** Remeasure vertical wheel after #page-why becomes visible (GSAP route, tab return). */
function installWhyPageWheelObserver() {
  const page = document.getElementById("page-why");
  if (!page || page.dataset.whmWheelObserve) return;
  page.dataset.whmWheelObserve = "1";
  new MutationObserver(() => {
    if (!page.classList.contains("active")) return;
    const vp = page.querySelector("#whmWheelViewport");
    if (vp?.querySelectorAll(".intel-wheel__chip").length >= 5) {
      requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
    } else {
      mountWhatsMovingBriefing();
    }
  }).observe(page, { attributes: true, attributeFilter: ["class"] });
}

/** Mount Briefing Wheel on #page-why (idempotent). */
export function mountWhatsMovingBriefing() {
  const root = document.getElementById("page-why");
  const viewport = root?.querySelector("#whmWheelViewport");
  const engine = root?.querySelector("#whmWheelEngine");
  if (!viewport || !engine) {
    return;
  }

  if (viewport.querySelectorAll(".intel-wheel__chip").length >= 5) {
    requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
    return;
  }

  if (mounted) return;
  mounted = true;
  initTickerDeepDiveBridge();
  initWheelLab(BRIEFING_WHEEL, {
    configKey: "WHATS_MOVING_BRIEFING",
    production: true,
    viewportEl: viewport,
    engineEl: engine,
  });
}

if (typeof window !== "undefined") {
  window.mountWhatsMovingBriefing = mountWhatsMovingBriefing;
  installWhyPageWheelObserver();
}
