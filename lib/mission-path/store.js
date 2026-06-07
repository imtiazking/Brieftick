/**
 * Mission Path — localStorage progress (V1).
 * @module lib/mission-path/store
 */

export const STORAGE_KEY = "brieftick_mission_path_v1";
export const LEGACY_ONBOARD_KEY = "brieftick_onboarded_v1";
export const PROMO_DISMISS_KEY = "brieftick_mission_promo_dismissed";

/** @typedef {'active' | 'completed' | 'dismissed'} MissionStatus */

/**
 * @typedef {Object} UserProgress
 * @property {number} version
 * @property {MissionStatus} status
 * @property {number} currentMission
 * @property {number[]} completedMissions
 * @property {number[]} skippedMissions
 * @property {string[]} mission1Checklist
 * @property {boolean} [sessionStarted]
 * @property {number} xp
 * @property {string} [startedAt]
 * @property {string} [updatedAt]
 * @property {string} [completedAt]
 * @property {string} [dismissedAt]
 * @property {boolean} [legacyMigrated]
 */

/**
 * @returns {string|null}
 */
export function getActiveUserId() {
  const u = typeof window !== "undefined" ? window._clerkUser || window.Clerk?.user : null;
  return u?.id ?? null;
}

/**
 * @returns {{ version: number, users: Record<string, UserProgress> }}
 */
function readRoot() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { version: 1, users: {} };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return { version: 1, users: {} };
    return {
      version: parsed.version ?? 1,
      users: parsed.users && typeof parsed.users === "object" ? parsed.users : {},
    };
  } catch {
    return { version: 1, users: {} };
  }
}

/**
 * @param {{ version: number, users: Record<string, UserProgress> }} root
 */
function writeRoot(root) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(root));
    window.dispatchEvent(new CustomEvent("bt:mission-progress", { detail: { root } }));
  } catch (e) {
    console.warn("[mission-path] save failed", e);
  }
}

/**
 * @param {string} userId
 * @returns {UserProgress|null}
 */
export function loadProgress(userId) {
  if (!userId) return null;
  const root = readRoot();
  return root.users[userId] ?? null;
}

/**
 * @param {string} userId
 * @param {Partial<UserProgress>} patch
 * @returns {UserProgress}
 */
export function saveProgress(userId, patch) {
  const root = readRoot();
  const prev = root.users[userId] ?? createFreshProgress();
  const next = {
    ...prev,
    ...patch,
    version: 1,
    updatedAt: new Date().toISOString(),
  };
  root.users[userId] = next;
  writeRoot(root);
  return next;
}

/**
 * @returns {UserProgress}
 */
export function createFreshProgress() {
  return {
    version: 1,
    status: "active",
    currentMission: 0,
    completedMissions: [],
    skippedMissions: [],
    mission1Checklist: [],
    sessionStarted: false,
    xp: 0,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * @param {string} userId
 */
export function resetProgress(userId) {
  const root = readRoot();
  delete root.users[userId];
  writeRoot(root);
}

/**
 * @param {string} userId
 * @returns {UserProgress}
 */
export function startNewArc(userId) {
  const progress = createFreshProgress();
  saveProgress(userId, progress);
  return progress;
}

/**
 * @param {string} userId
 * @returns {boolean}
 */
export function hasLegacyOnboardFlag() {
  try {
    return !!localStorage.getItem(LEGACY_ONBOARD_KEY);
  } catch {
    return false;
  }
}

/**
 * @param {string} userId
 */
export function markLegacyMigrated(userId) {
  const p = loadProgress(userId);
  if (p?.legacyMigrated) return;
  saveProgress(userId, {
    ...(p ?? createFreshProgress()),
    status: p?.status === "completed" ? "completed" : "dismissed",
    legacyMigrated: true,
    dismissedAt: p?.dismissedAt ?? new Date().toISOString(),
  });
}

/**
 * @returns {boolean}
 */
export function isPromoDismissed() {
  try {
    return localStorage.getItem(PROMO_DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

export function dismissPromo() {
  try {
    localStorage.setItem(PROMO_DISMISS_KEY, "1");
  } catch (_) {}
}
