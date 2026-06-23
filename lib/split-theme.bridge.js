/**
 * Concept 10 Split — site-wide atmosphere + route-aware theme (excludes Logic).
 */
import { riverText } from "./split-atmosphere.js";

const LOGIC_ROUTE = "logic";

function activeRoute() {
  if (window._activeRoute) return window._activeRoute;
  const page = document.querySelector(".page.active");
  return page ? page.id.replace(/^page-/, "") : "landing";
}

function isLogicRoute(name) {
  return name === LOGIC_ROUTE;
}

function isImmersiveSplit(routeName) {
  return routeName === "landing" || routeName === "about" || routeName === "pricing";
}

function shouldShowBodyRiver(routeName) {
  return !isLogicRoute(routeName) && !isImmersiveSplit(routeName);
}

function applyTheme(routeName) {
  const root = document.documentElement;
  const logic = isLogicRoute(routeName);
  root.setAttribute("data-theme", logic ? "logic" : "split");
  const atm = document.getElementById("splitAtmosphere");
  const hideGlobalAtm = logic || isImmersiveSplit(routeName);
  if (atm) atm.classList.toggle("is-off", hideGlobalAtm);
  document.querySelectorAll(".split-river").forEach((el) => {
    el.style.display = shouldShowBodyRiver(routeName) ? "" : "none";
  });
  if (window.BrieftickSplitLanding?.onSplitRoute && !logic) {
    window.BrieftickSplitLanding.onSplitRoute(routeName);
  } else if (logic) {
    if (window.BrieftickSplitLanding?.onSplitRoute) {
      window.BrieftickSplitLanding.onSplitRoute("logic");
    }
  }
}

function ensureAtmosphere() {
  if (document.getElementById("splitAtmosphere")) return;
  const wrap = document.createElement("div");
  wrap.id = "splitAtmosphere";
  wrap.className = "split-atmosphere";
  wrap.setAttribute("aria-hidden", "true");
  wrap.innerHTML = `
    <div class="split-atmosphere__dual"><span></span><span></span></div>
    <div class="split-atmosphere__fog"></div>
    <div class="split-atmosphere__vignette"></div>
  `;
  const bot = document.createElement("div");
  bot.className = "split-river split-river--bottom";
  bot.setAttribute("aria-hidden", "true");
  bot.innerHTML = '<span class="split-river-track" id="splitRiverBot"></span>';
  document.body.prepend(wrap);
  document.body.appendChild(bot);
}

function fillRivers() {
  const bot = document.getElementById("splitRiverBot");
  if (!bot) return;
  const tick = riverText();
  bot.textContent = tick + tick;
}

function installRouteHook() {
  const base = window.route;
  if (!base || base.__splitThemeHook) return;
  window.route = function splitRoute(name) {
    base(name);
    applyTheme(name);
    if (shouldShowBodyRiver(name)) fillRivers();
  };
  window.route.__splitThemeHook = true;
}

function init() {
  ensureAtmosphere();
  fillRivers();
  installRouteHook();
  applyTheme(activeRoute());

  window.addEventListener("load", () => {
    installRouteHook();
    fillRivers();
    applyTheme(activeRoute());
  });
}

window.BrieftickSplitTheme = {
  init,
  onRoute: applyTheme,
  refreshRivers: fillRivers,
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
