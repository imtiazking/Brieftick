/**
 * Concept 10 Split — Pricing page immersive atmosphere (reuses landing motion system).
 */
import {
  buildSplitShellHtml,
  initSplitCinematic,
  refreshSplitRivers,
} from "./split-atmosphere.js";

let teardown = null;

export function mountSplitPricing() {
  const page = document.getElementById("page-pricing");
  const mount = document.getElementById("splitPricingMount");
  if (!page || !mount) return;

  document.documentElement.setAttribute("data-split-pricing", "1");

  mount.innerHTML = buildSplitShellHtml({
    particles: 18,
    rivers: true,
    hud: "PRICING · FORGENIQ",
    extraClass: "cw--immersive",
  });

  if (teardown) teardown();
  teardown = initSplitCinematic(mount, { pointerTarget: page });

  const refresh = () => refreshSplitRivers(mount);
  refresh();
  setTimeout(refresh, 600);
  setTimeout(refresh, 2500);
}

export function unmountSplitPricing() {
  document.documentElement.removeAttribute("data-split-pricing");
  if (teardown) {
    teardown();
    teardown = null;
  }
}
