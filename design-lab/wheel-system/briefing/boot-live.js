/**
 * Design-lab Briefing Wheel — Phase 1 live intelligence boot (preview only).
 * Renders static wheel immediately, then swaps in live config when ready.
 * @module design-lab/wheel-system/briefing/boot-live
 */

import { initWheelLab } from "/design-lab/wheel-system/_wheel-lab-core.js";
import { buildBriefingWheelConfig } from "/lib/briefingWheelBuilder.js";
import { BRIEFING_WHEEL } from "/design-lab/wheel-system/_wheel-configs.js";
import { mountMarketSnapshot } from "/lib/market-snapshot.js";

const BUILD_TIMEOUT_MS = 12000;

const PROV_CLASS = {
  Live: "is-live",
  Mixed: "is-mixed",
  Fallback: "is-fallback",
};

/** @param {string} phase */
function logWheelDom(phase) {
  const viewport = document.getElementById("wheelViewport");
  const engine = document.getElementById("wheelEngine");
  const chips = viewport?.querySelectorAll(".intel-wheel__chip") ?? [];
  console.log(`[briefing-preview] dom ${phase}`, {
    viewport: Boolean(viewport),
    engine: Boolean(engine),
    chipCount: chips.length,
    chipLabels: [...chips].map((c) => c.querySelector(".intel-wheel__chip-label")?.textContent),
    panelMounted: Boolean(engine?.querySelector("#wheelIntelPanel")),
    trackMounted: Boolean(viewport?.querySelector(".intel-wheel__track")),
  });
}

function renderProvenanceBadge(built) {
  const el = document.getElementById("briefingProvenanceBadge");
  if (!el) return;
  const p = built.provenance || "Fallback";
  el.className = `briefing-provenance-badge ${PROV_CLASS[p] || ""}`;
  el.textContent = `Data: ${p}`;

  const detail = document.getElementById("briefingProvenanceDetail");
  if (detail && built.segmentProvenance) {
    const seg = built.segmentProvenance;
    detail.textContent = `Today ${seg.today} · Winners ${seg.winners} · Losers ${seg.losers} · Why ${seg.why} · Next ${seg.next}${
      built.provenanceNotes ? ` — ${built.provenanceNotes}` : ""
    }`;
  }

  const note = document.querySelector(".flagship-lab-note");
  if (note) {
    note.textContent = `Design lab · Briefing Wheel Phase 1 · not production · ${built.provenanceNotes || ""}`;
  }
}

async function boot() {
  const params = new URLSearchParams(window.location.search);
  const staticOnly = params.get("wheel") === "static";
  const subtitle = document.getElementById("wheelLabSubtitle");

  console.log("[briefing-preview] boot start", { staticOnly, path: window.location.pathname });

  mountMarketSnapshot({ refreshMs: 60_000 });

  console.log("[briefing-preview] initWheelLab start (static shell)");
  initWheelLab(BRIEFING_WHEEL, {
    configKey: "BRIEFING_WHEEL_SHELL",
    flagship: true,
  });
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      setTimeout(() => {
        console.log("[briefing-preview] initWheelLab complete (static shell)");
        logWheelDom("after-static-shell");
      }, 220);
    });
  });

  if (staticOnly) {
    renderProvenanceBadge({
      provenance: "Fallback",
      segmentProvenance: { why: "Fallback", next: "Fallback" },
      provenanceNotes: "?wheel=static debug",
    });
    if (subtitle) subtitle.textContent = `${BRIEFING_WHEEL.subtitle} · Static debug`;
    window.__briefingWheelBuilt = { config: BRIEFING_WHEEL, provenance: "Fallback" };
    return;
  }

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
    console.error("[briefing-preview] briefing builder failed:", e);
    built = {
      config: BRIEFING_WHEEL,
      provenance: "Fallback",
      segmentProvenance: { today: "Fallback", winners: "Fallback", losers: "Fallback", why: "Fallback", next: "Fallback" },
      provenanceNotes: String(e?.message || e),
    };
  }

  renderProvenanceBadge(built);

  console.log("[briefing-preview] initWheelLab start (live config)", {
    provenance: built.provenance,
    sections: built.config?.sections?.length,
  });
  initWheelLab(built.config, {
    configKey: "BRIEFING_WHEEL_LIVE_P1",
    flagship: true,
  });
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      setTimeout(() => {
        console.log("[briefing-preview] initWheelLab complete (live config)");
        logWheelDom("after-live-config");
      }, 220);
    });
  });

  if (subtitle) {
    subtitle.textContent = `${built.config.subtitle} · Provenance: ${built.provenance}`;
  }

  window.buildBriefingWheelConfig = buildBriefingWheelConfig;
  window.__briefingWheelBuilt = built;
}

boot().catch((e) => {
  console.error("[briefing-preview] boot unhandled:", e);
  console.log("[briefing-preview] initWheelLab start (emergency static)");
  initWheelLab(BRIEFING_WHEEL, { configKey: "BRIEFING_WHEEL_EMERGENCY", flagship: true });
});
