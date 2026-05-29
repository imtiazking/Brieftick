/**
 * Concept 10 Split — About page immersive atmosphere (reuses landing motion system).
 */
import {
  buildSplitShellHtml,
  initSplitCinematic,
  refreshSplitRivers,
} from "./split-atmosphere.js";

let teardown = null;

export function mountSplitAbout() {
  const page = document.getElementById("page-about");
  const mount = document.getElementById("splitAboutMount");
  if (!page || !mount) return;

  document.documentElement.setAttribute("data-split-about", "1");

  mount.innerHTML = buildSplitShellHtml({
    particles: 18,
    rivers: true,
    hud: "ABOUT · BRIEFTICK",
    extraClass: "cw--immersive",
  });

  if (teardown) teardown();
  teardown = initSplitCinematic(mount, { pointerTarget: page });

  const refresh = () => refreshSplitRivers(mount);
  refresh();
  setTimeout(refresh, 600);
  setTimeout(refresh, 2500);
}

export function unmountSplitAbout() {
  document.documentElement.removeAttribute("data-split-about");
  if (teardown) {
    teardown();
    teardown = null;
  }
}
