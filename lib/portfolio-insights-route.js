/**
 * Deep-link /portfolio-insights to in-app Portfolio Insights page.
 */
(function () {
  const PATH = /^\/portfolio-insights\/?$/i;

  function syncFromPath() {
    if (!PATH.test(location.pathname)) return;
    if (typeof window.routeWithAuth === "function") {
      window.routeWithAuth("portfolio-insights");
    } else if (typeof window.route === "function") {
      window.route("portfolio-insights");
    }
  }

  window.addEventListener("popstate", syncFromPath);
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", syncFromPath);
  } else {
    syncFromPath();
  }
})();
