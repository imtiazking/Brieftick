/**
 * Production What's Moving — Briefing Wheel mount (static shell → live config).
 * @module lib/briefing-wheel.boot
 */

import { initWheelLab } from "/design-lab/wheel-system/_wheel-lab-core.js";
import { BRIEFING_WHEEL } from "/design-lab/wheel-system/_wheel-configs.js";
import { buildBriefingWheelConfig } from "/lib/briefingWheelBuilder.js";
import { initTickerDeepDiveBridge } from "/lib/ticker-deep-dive.bridge.js";
import { mountMarketSnapshot } from "/lib/market-snapshot.js";
import { applyBadge, badgeFromBriefingProvenance } from "/lib/live-data-badge.js";

const BUILD_TIMEOUT_MS = 12000;

let snapshotMounted = false;
let shellMounted = false;
let liveBootStarted = false;

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

/**
 * @param {{ provenance?: string, provenanceNotes?: string, segmentProvenance?: Record<string, string> }} built
 */
function renderWhatsMovingBadges(built) {
  const root = document.getElementById("page-why");
  const badgeEl = root?.querySelector("#whmBriefingBadge");
  const detailEl = root?.querySelector("#whmBriefingDetail");
  const provenance = built.provenance || "Fallback";
  const kind = badgeFromBriefingProvenance(provenance);

  if (badgeEl) {
    applyBadge(
      badgeEl,
      kind,
      built.provenanceNotes || `Briefing wheel · ${provenance}`
    );
  }

  if (detailEl && built.segmentProvenance) {
    const seg = built.segmentProvenance;
    detailEl.textContent = `Today ${seg.today} · Winners ${seg.winners} · Losers ${seg.losers} · Why ${seg.why} · Next ${seg.next}${
      built.provenanceNotes ? ` — ${built.provenanceNotes}` : ""
    }`;
  }

  const foot = root?.querySelector(".wm-briefing-foot");
  if (foot && provenance === "Live") {
    foot.innerHTML =
      '<b style="color:var(--gold)">EDUCATIONAL ONLY.</b> Market snapshot and briefing quotes are live; some narrative may still be editorial. Tap a stock for Ticker Deep Dive. Not investment advice.';
  } else if (foot && provenance === "Mixed") {
    foot.innerHTML =
      '<b style="color:var(--gold)">EDUCATIONAL ONLY.</b> Live quotes on today/winners/losers; why/watch sections may use illustrative copy. Not investment advice.';
  }
}

async function bootLiveBriefingWheel() {
  if (liveBootStarted) return;
  liveBootStarted = true;

  const root = document.getElementById("page-why");
  const viewport = root?.querySelector("#whmWheelViewport");
  const engine = root?.querySelector("#whmWheelEngine");
  const subtitle = document.getElementById("wheelLabSubtitle");
  if (!viewport || !engine) return;

  if (subtitle) subtitle.textContent = "Loading live market data…";

  /** @type {{ config: typeof BRIEFING_WHEEL, provenance: string, segmentProvenance?: Record<string, string>, provenanceNotes?: string }} */
  let built;
  try {
    built = await Promise.race([
      buildBriefingWheelConfig(),
      new Promise((_, reject) => {
        setTimeout(
          () => reject(new Error(`buildBriefingWheelConfig timeout (${BUILD_TIMEOUT_MS}ms)`)),
          BUILD_TIMEOUT_MS
        );
      }),
    ]);
  } catch (e) {
    console.error("[briefing-wheel] live builder failed:", e);
    built = {
      config: BRIEFING_WHEEL,
      provenance: "Fallback",
      segmentProvenance: {
        today: "Fallback",
        winners: "Fallback",
        losers: "Fallback",
        why: "Fallback",
        next: "Fallback",
      },
      provenanceNotes: String(e?.message || e),
    };
  }

  renderWhatsMovingBadges(built);

  viewport.innerHTML = "";
  initWheelLab(built.config, {
    configKey: "WHATS_MOVING_BRIEFING_LIVE",
    production: true,
    viewportEl: viewport,
    engineEl: engine,
    pulseStripEl: root.querySelector(".briefing-scene .wheel-pulse-strip"),
    subtitleEl: subtitle,
  });

  if (subtitle) {
    subtitle.textContent = `${built.config.subtitle} · ${built.provenance} data`;
  }

  window.__briefingWheelBuilt = built;
  requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
}

/** Mount Briefing Wheel on #page-why (idempotent). */
export function mountWhatsMovingBriefing() {
  const root = document.getElementById("page-why");
  const viewport = root?.querySelector("#whmWheelViewport");
  const engine = root?.querySelector("#whmWheelEngine");
  if (!viewport || !engine) {
    return;
  }

  if (!snapshotMounted) {
    snapshotMounted = true;
    mountMarketSnapshot({ root: "#page-why .briefing-snapshot", refreshMs: 60_000 });
  }

  if (viewport.querySelectorAll(".intel-wheel__chip").length >= 5 && shellMounted) {
    requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
    return;
  }

  if (!shellMounted) {
    shellMounted = true;
    initTickerDeepDiveBridge();
    initWheelLab(BRIEFING_WHEEL, {
      configKey: "WHATS_MOVING_BRIEFING_SHELL",
      production: true,
      viewportEl: viewport,
      engineEl: engine,
      pulseStripEl: root.querySelector(".briefing-scene .wheel-pulse-strip"),
      subtitleEl: document.getElementById("wheelLabSubtitle"),
    });
    applyBadge(
      root.querySelector("#whmBriefingBadge"),
      "delayed",
      "Loading live briefing…"
    );
    bootLiveBriefingWheel();
    return;
  }

  requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
}

if (typeof window !== "undefined") {
  window.mountWhatsMovingBriefing = mountWhatsMovingBriefing;
  installWhyPageWheelObserver();
}
