/**
 * Concept 10 Split — About page immersive atmosphere (reuses landing motion system).
 */
import {
  buildSplitShellHtml,
  initSplitCinematic,
} from "./split-atmosphere.js";
import { isMobileConversionViewport } from "./mobile-conversion.js";

let teardown = null;

export function mountSplitAbout() {
  const page = document.getElementById("page-about");
  const mount = document.getElementById("splitAboutMount");
  if (!page || !mount) return;

  document.documentElement.setAttribute("data-split-about", "1");

  if (isMobileConversionViewport()) {
    mount.innerHTML = '<div class="cw-mobile-bg" aria-hidden="true"></div>';
    mount.setAttribute("aria-hidden", "true");
    if (teardown) teardown();
    teardown = null;
    return;
  }

  mount.innerHTML = buildSplitShellHtml({
    particles: 18,
    rivers: false,
    hud: "ABOUT",
    extraClass: "cw--immersive",
  });

  if (teardown) teardown();
  teardown = initSplitCinematic(mount, { pointerTarget: page });
}

export function unmountSplitAbout() {
  document.documentElement.removeAttribute("data-split-about");
  if (teardown) {
    teardown();
    teardown = null;
  }
}
