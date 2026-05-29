import { mountSplitLanding, unmountSplitLanding } from "./split-landing.js";
import { mountSplitAbout, unmountSplitAbout } from "./split-about.js";
import { mountSplitPricing, unmountSplitPricing } from "./split-pricing.js";

function onSplitRoute(name) {
  if (name === "landing") mountSplitLanding();
  else unmountSplitLanding();

  if (name === "about") mountSplitAbout();
  else unmountSplitAbout();

  if (name === "pricing") mountSplitPricing();
  else unmountSplitPricing();
}

window.BrieftickSplitLanding = { onSplitRoute };

function bootAfterData() {
  const route = document.querySelector(".page.active")?.id?.replace(/^page-/, "") || "landing";
  onSplitRoute(route);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => setTimeout(bootAfterData, 0));
} else {
  setTimeout(bootAfterData, 0);
}
window.addEventListener("load", bootAfterData);
