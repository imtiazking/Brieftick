/** @typedef {Promise<unknown>|null|undefined} ScheduledTask */

export function isPromiseLike(value) {
  return value != null && typeof value.then === 'function';
}

/**
 * Chain optional handlers when schedule* returned a real Promise.
 * Avoids `(null?.then(...)).catch(...)` which throws because `.catch` binds to undefined.
 *
 * Detail fetches should omit onFulfilled when notify() already triggers subscribe → renderShell.
 * Passing renderShell as onFulfilled on every bindViewHandlers pass causes infinite loops when
 * schedule* returns Promise.resolve(cached).
 */
export function runScheduledTask(task, onFulfilled, onRejected) {
  if (!isPromiseLike(task)) return undefined;
  const fulfilled = typeof onFulfilled === 'function' ? onFulfilled : undefined;
  const rejected = typeof onRejected === 'function' ? onRejected : undefined;
  if (rejected) return task.then(fulfilled, rejected);
  if (fulfilled) return task.then(fulfilled);
  return task;
}

/** Drop persisted non-Promise placeholders left from JSON round-trip. */
export function coerceInflightPromise(slot) {
  if (isPromiseLike(slot)) return slot;
  return null;
}
