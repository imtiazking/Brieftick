const inFlight = new Set();

export function withMutationGuard(key, fn) {
  if (inFlight.has(key)) {
    return { ok: false, code: 'CONFLICT', message: 'Action already in progress' };
  }
  inFlight.add(key);
  try {
    const result = fn();
    if (result && typeof result.then === 'function') {
      return result.finally(() => inFlight.delete(key));
    }
    inFlight.delete(key);
    return result;
  } catch (e) {
    inFlight.delete(key);
    throw e;
  }
}

export function isMutationInFlight(key) {
  return inFlight.has(key);
}

export function clearMutationGuards() {
  inFlight.clear();
}
