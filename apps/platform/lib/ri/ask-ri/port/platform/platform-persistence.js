/**
 * Design Lab persistence boundary — all platform state read/write for localStorage.
 * UI preferences (walkthrough, guide) remain in demo-journey.js by exception.
 */
export const STORAGE_KEY_V2 = 'forgeniq-ri-lab-v2';
export const STORAGE_KEY_V1 = 'forgeniq-ri-lab-v1';

function hasLocalStorage() {
  return typeof globalThis !== 'undefined' && typeof globalThis.localStorage !== 'undefined';
}

export function loadPersistedJson(key) {
  const r = loadPersistedRaw(key);
  return r.ok ? r.value : null;
}

/** Returns { ok, value?, corrupt? } for recovery flows. */
export function loadPersistedRaw(key) {
  if (!hasLocalStorage()) return { ok: false, missing: true };
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return { ok: false, missing: true };
    return { ok: true, value: JSON.parse(raw) };
  } catch {
    return { ok: false, corrupt: true };
  }
}

export function savePersistedJson(key, value) {
  if (!hasLocalStorage()) return;
  localStorage.setItem(key, JSON.stringify(value));
}

export function removePersistedKey(key) {
  if (!hasLocalStorage()) return;
  localStorage.removeItem(key);
}

export function clearPlatformStorageKeys() {
  removePersistedKey(STORAGE_KEY_V1);
  removePersistedKey(STORAGE_KEY_V2);
  removePersistedKey('ri-demo-guide-dismissed');
  removePersistedKey('ri-demo-walkthrough');
}
