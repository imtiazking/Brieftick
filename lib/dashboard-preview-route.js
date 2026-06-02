/**
 * Optional standalone Intelligence Wheel at /dashboard-preview.
 * Normal app use (including Vercel preview deploys) stays on index.html #page-dashboard.
 * Redirect to the wheel bundle only when ?preview=dashboard is set explicitly.
 */
(function (global) {
  const WHEEL_DASHBOARD_PATH = "/dashboard-preview";

  function isWheelDashboardPreviewRequested() {
    const p = new URLSearchParams(global.location?.search || "");
    return p.get("preview") === "dashboard";
  }

  function redirectToWheelDashboard() {
    if (!isWheelDashboardPreviewRequested()) return false;
    const path = (global.location?.pathname || "/").replace(/\/$/, "") || "/";
    const target = WHEEL_DASHBOARD_PATH;
    if (path === target || path === target + ".html") return false;
    global.location.assign(target);
    return true;
  }

  global.__BT_WHEEL_DASHBOARD_PREVIEW__ = isWheelDashboardPreviewRequested();
  global.btRedirectToWheelDashboard = redirectToWheelDashboard;
})(window);
