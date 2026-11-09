/**
 * Schedule connected entity detail fetches at most once per hash route.
 * Prevents renderShell ↔ runScheduledTask(Promise.resolve(cache)) ↔ renderShell loops.
 */

let activeDetailRoute = null;

export function resetConnectedDetailRouteLoads() {
  activeDetailRoute = null;
}

/**
 * @param {string} route normalized path from getRoute()
 * @param {() => void} runner
 */
export function runConnectedDetailLoadsIfNeeded(route, runner) {
  if (!route || activeDetailRoute === route) return;
  activeDetailRoute = route;
  runner();
}
