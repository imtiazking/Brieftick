/**
 * Mobile marketing entry — loads landing essentials immediately; defers app modules until dashboard route.
 */
import { initMobileNav } from "./mobile-conversion.js";

initMobileNav();

const APP_MODULE_PATHS = [
  "/lib/moversSymbolLookup.bridge.js",
  "/lib/landingTickerQuotes.bridge.js",
  "/lib/provider-health.js",
  "/lib/briefing-wheel.boot.js",
  "/lib/earnings-beginner.js",
  "/lib/portfolio-insights.js",
  "/lib/logic-cinematic.bridge.js",
  "/lib/portfolio-deep-dive.js",
  "/lib/scanner-deep-dive.js",
  "/lib/logic-deep-dive.js",
  "/lib/portfolio-quotes.js",
  "/lib/portfolio-layout.js",
  "/lib/portfolio-relationship-story.js",
  "/lib/discover-market-story.js",
  "/lib/insider-smart-money.js",
  "/lib/options-story.js",
  "/lib/terminal-access.bridge.js",
  "/lib/market-risk-runner.js",
  "/lib/dashboard-news-story-runner.js",
  "/lib/dashboard-wheel.bridge.js",
  "/lib/mission-path/index.js",
  "/lib/ticker-deep-dive.bridge.js",
  "/lib/live-data-badge.js",
];

let appModulesPromise = null;

export function loadBtAppModules() {
  if (!appModulesPromise) {
    window.__btEnableAppStyles?.();
    appModulesPromise = Promise.all(
      APP_MODULE_PATHS.map((path) => import(/* @vite-ignore */ path).catch(() => {}))
    );
  }
  return appModulesPromise;
}

const mobile = window.matchMedia("(max-width: 768px)").matches;

await import("./split-theme.bridge.js");
await import("./split-landing.bridge.js");

if (!mobile) {
  await loadBtAppModules();
} else {
  window.__btLoadAppModules = loadBtAppModules;
}

await import("/lib/quoteRouter.js").then((m) => {
  window.BrieftickQuoteRouter = m;
});
