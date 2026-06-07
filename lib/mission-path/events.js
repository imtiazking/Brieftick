/**
 * Mission Path — action signals (V2 stub).
 * @module lib/mission-path/events
 */

/** @type {Set<(detail: object) => void>} */
const listeners = new Set();

/**
 * @param {(detail: object) => void} fn
 * @returns {() => void}
 */
export function onMissionSignal(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * @param {string} signal
 * @param {Record<string, unknown>} [meta]
 */
export function emitMissionSignal(signal, meta = {}) {
  const detail = { signal, ...meta, at: Date.now() };
  listeners.forEach((fn) => {
    try {
      fn(detail);
    } catch (e) {
      console.warn("[mission-path] signal listener", e);
    }
  });
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("bt:mission-signal", { detail }));
  }
}

/** V2: wire hooks in route(), selectWheelModule(), submitLogicQuery(), etc. */
