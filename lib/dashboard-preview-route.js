/**
 * Routes Vercel preview deployments to /dashboard-preview (intelligence wheel)
 * instead of the legacy #page-dashboard embedded in index.html.
 * Production domains are unchanged.
 */
(function (global) {
  const WHEEL_DASHBOARD_PATH = "/dashboard-preview";

  /** Stable production hosts — keep legacy in-app dashboard. */
  const PRODUCTION_HOSTS = new Set([
    "brieftick.com",
    "www.brieftick.com",
    "brieftick.vercel.app",
    "brieftick-imis-projects-8e15dca0.vercel.app",
    "brieftick-git-main-imis-projects-8e15dca0.vercel.app",
  ]);

  function isVercelPreviewDeploymentHost() {
    const h = (global.location?.hostname || "").toLowerCase();
    if (!h.endsWith(".vercel.app")) return false;
    if (PRODUCTION_HOSTS.has(h)) return false;
    return /^brieftick-[a-z0-9-]+-imis-projects-8e15dca0\.vercel\.app$/i.test(h);
  }

  function isWheelDashboardHost() {
    const p = new URLSearchParams(global.location?.search || "");
    if (p.get("preview") === "dashboard") return true;
    return isVercelPreviewDeploymentHost();
  }

  function redirectToWheelDashboard() {
    if (!isWheelDashboardHost()) return false;
    const path = (global.location?.pathname || "/").replace(/\/$/, "") || "/";
    const target = WHEEL_DASHBOARD_PATH;
    if (path === target || path === target + ".html") return false;
    global.location.assign(target);
    return true;
  }

  global.__BT_WHEEL_DASHBOARD_HOST__ = isWheelDashboardHost();
  global.btRedirectToWheelDashboard = redirectToWheelDashboard;
})(window);
