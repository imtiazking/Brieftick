/** @typedef {Promise<unknown>|null|undefined} ScheduledTask */

export function isPromiseLike(value) {
  return value != null && typeof value.then === 'function';
}

/**
 * Chain render/handlers only when schedule* returned a real Promise.
 * Avoids `(null?.then(...)).catch(...)` which throws because `.catch` binds to undefined.
 */
export function runScheduledTask(task, onFulfilled, onRejected) {
  if (!isPromiseLike(task)) return undefined;
  if (onRejected) return task.then(onFulfilled, onRejected);
  return task.then(onFulfilled);
}

/** Drop persisted non-Promise placeholders left from JSON round-trip. */
export function coerceInflightPromise(slot) {
  if (isPromiseLike(slot)) return slot;
  return null;
}
