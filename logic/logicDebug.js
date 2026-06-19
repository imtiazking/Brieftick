/**
 * Logic debug logging (no entity/pipeline imports).
 * @module logic/logicDebug
 */

/**
 * @param {string} event
 * @param {*} [data]
 */
export function logicDebug(event, data) {
  if (typeof window === "undefined") {
    if (process.env.LOGIC_DEBUG === "1") {
      const payload = data !== undefined ? data : "";
      console.log(`[FORGENIQ Logic] ${event}`, payload);
    }
    return;
  }
  const payload = data !== undefined ? data : "";
  const on =
    window.__LOGIC_DEBUG === true ||
    window.__LOGIC_PREVIEW === true ||
    new URLSearchParams(window.location.search).get("logic_debug") === "1" ||
    new URLSearchParams(window.location.search).get("preview") === "logic" ||
    new URLSearchParams(window.location.search).get("preview") === "agent";
  if (on) console.log(`[FORGENIQ Logic] ${event}`, payload);
}
