const hostState = new Map();

export async function throttleHost(hostname, minIntervalMs = 1500) {
  const key = hostname.toLowerCase();
  const now = Date.now();
  const prev = hostState.get(key) || 0;
  const wait = Math.max(0, prev + minIntervalMs - now);
  if (wait > 0) await sleep(wait);
  hostState.set(key, Date.now());
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
