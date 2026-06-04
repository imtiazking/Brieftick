/**
 * Deep-link /earnings to in-app earnings page.
 */
(function () {
  const PATH = /^\/earnings\/?$/i;

  function syncFromPath() {
    if (!PATH.test(location.pathname)) return;
    if (typeof window.routeWithAuth === "function") {
      window.routeWithAuth("earnings");
    } else if (typeof window.route === "function") {
      window.route("earnings");
    }
  }

  window.addEventListener("popstate", syncFromPath);
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", syncFromPath);
  } else {
    syncFromPath();
  }
})();
