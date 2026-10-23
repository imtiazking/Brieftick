/** Conservative per-host throttling for live verification. */
const hostState = new Map();

export const DEFAULT_RATE_CONFIG = {
  minIntervalMs: 2000,
  maxConcurrent: 1,
};

export async function throttleHost(host, config = DEFAULT_RATE_CONFIG) {
  const key = host.toLowerCase();
  const now = Date.now();
  const st = hostState.get(key) || { lastAt: 0, inFlight: 0 };
  while (st.inFlight >= (config.maxConcurrent || 1)) {
    await sleep(100);
  }
  const wait = Math.max(0, (config.minIntervalMs || 2000) - (now - st.lastAt));
  if (wait > 0) await sleep(wait);
  st.lastAt = Date.now();
  st.inFlight += 1;
  hostState.set(key, st);
  return () => {
    const s = hostState.get(key);
    if (s) {
      s.inFlight = Math.max(0, s.inFlight - 1);
      hostState.set(key, s);
    }
  };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export function resetRateLimiterForTests() {
  hostState.clear();
}
