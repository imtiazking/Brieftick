/**
 * Mission Path — orchestration (V1).
 * @module lib/mission-path/controller
 */

import {
  MISSIONS,
  TOTAL_MISSIONS,
  computeXp,
} from "./content.js";
import {
  loadProgress,
  saveProgress,
  resetProgress,
  startNewArc,
  getActiveUserId,
  hasLegacyOnboardFlag,
  markLegacyMigrated,
  isPromoDismissed,
  dismissPromo,
  createFreshProgress,
} from "./store.js";
import {
  createMissionShell,
  setViewMode,
  renderWelcome,
  renderMissionPanel,
  renderCompletion,
  updatePill,
  renderSettingsStatus,
  syncSettingsButtons,
} from "./ui.js";

export const MISSION_PATH_ENABLED = true;

/** @type {import('./store.js').UserProgress|null} */
let progress = null;

/** @type {ReturnType<createMissionShell>|null} */
let els = null;

/** @type {HTMLElement|null} */
let mountRoot = null;

const settingsEls = {
  status: null,
  continueBtn: null,
  restartBtn: null,
  resetBtn: null,
};

/** @type {object|null} */
let authedUser = null;

/** @type {boolean} */
let shellInitialized = false;

function isAdminUser(user) {
  const role = user?.publicMetadata?.role;
  if (typeof window._isAdminRole === "function") return window._isAdminRole(role);
  const r = String(role ?? "").trim().toLowerCase();
  return r === "admin" || r === "administrator";
}

function isTerminalUser() {
  return !!window._isTerminal;
}

function userId() {
  return authedUser?.id ?? getActiveUserId();
}

function routeMission(missionIndex) {
  const mission = MISSIONS[missionIndex];
  if (!mission) return;

  const navigate = (name) => {
    if (typeof window.route === "function") window.route(name);
  };

  if (mission.route === "dashboard") {
    if (typeof window.btRedirectToWheelDashboard === "function" && window.btRedirectToWheelDashboard()) {
      if (mission.wheelId) {
        setTimeout(() => selectWheel(mission.wheelId), 500);
      }
      return;
    }
  }

  navigate(mission.route);

  if (mission.wheelId) {
    requestAnimationFrame(() => selectWheel(mission.wheelId));
  }
}

/**
 * @param {string} wheelId
 */
async function selectWheel(wheelId) {
  try {
    const mod = await import("/preview/dashboard-wheel-core.js");
    if (typeof mod.selectWheelModule === "function") {
      mod.selectWheelModule(wheelId);
    }
  } catch (e) {
    console.warn("[mission-path] wheel select", e);
  }
}

function persist(patch) {
  const uid = userId();
  if (!uid) return progress;
  const base = progress ?? loadProgress(uid) ?? createFreshProgress();
  const merged = { ...base, ...patch };
  progress = saveProgress(uid, { ...merged, xp: computeXp(merged) });
  syncSettingsUI();
  return progress;
}

function bindMissionDelegation() {
  if (document.documentElement.dataset.mpDelegation) return;
  document.documentElement.dataset.mpDelegation = "1";
  document.addEventListener(
    "click",
    (e) => {
      const root = document.getElementById("missionPathRoot");
      if (!root?.contains(e.target)) return;
      const t = e.target.closest(
        "[data-mp-begin],[data-mp-skip],[data-mp-minimize],[data-mp-verify],[data-mp-skip-mission],[data-mp-goto],[data-mp-check],[data-mp-enter],[data-mp-restart],[data-mp-pill],[data-mp-promo],[data-mp-promo-dismiss]"
      );
      if (!t) return;

      if (t.hasAttribute("data-mp-promo-dismiss")) {
        e.preventDefault();
        dismissPromo();
        hideAll();
        return;
      }
      if (t.hasAttribute("data-mp-begin")) beginMissionArc(true);
      if (t.hasAttribute("data-mp-skip")) dismissArc();
      if (t.hasAttribute("data-mp-minimize")) minimizePanel();
      if (t.hasAttribute("data-mp-verify")) completeMission(false);
      if (t.hasAttribute("data-mp-skip-mission")) completeMission(true);
      if (t.hasAttribute("data-mp-goto")) routeMission(progress?.currentMission ?? 0);
      if (t.hasAttribute("data-mp-check")) toggleChecklistItem(t.getAttribute("data-mp-check"));
      if (t.hasAttribute("data-mp-enter")) finishAndEnter();
      if (t.hasAttribute("data-mp-restart")) restartMission(true);
      if (t.hasAttribute("data-mp-pill")) {
        progress = persist({ status: "active", minimized: false });
        showMission();
      }
      if (t.hasAttribute("data-mp-promo")) {
        dismissPromo();
        beginMissionArc(true);
      }
    },
    true
  );
}

function showWelcome() {
  if (!els?.welcome) return;
  renderWelcome(els.welcome, progress ?? createFreshProgress());
  setViewMode(els, "welcome");
}

function showMission() {
  if (!els?.panel || !progress) return;
  const idx = progress.currentMission ?? 0;
  document.body.classList.toggle("mp-logic-mission", MISSIONS[idx]?.route === "logic");
  renderMissionPanel(els.panel, progress, isTerminalUser());
  setViewMode(els, "mission");
  routeMission(idx);
}

function showComplete() {
  if (!els?.complete || !progress) return;
  renderCompletion(els.complete, progress);
  setViewMode(els, "complete");
}

function showPill() {
  if (!els?.pill || !progress) return;
  updatePill(els.pill, progress);
  setViewMode(els, "pill");
}

function showPromo() {
  setViewMode(els, "promo");
}

function hideAll() {
  document.body.classList.remove("mp-logic-mission");
  setViewMode(els, "hidden");
}

function beginMissionArc(fromWelcome = true) {
  const uid = userId();
  if (!uid) return;
  if (fromWelcome || !progress) {
    progress = startNewArc(uid);
    progress = persist({ sessionStarted: true });
  } else {
    progress = persist({
      status: "active",
      skippedAt: undefined,
      minimized: false,
      sessionStarted: true,
    });
  }
  showMission();
}

function dismissArc() {
  progress = persist({
    status: "skipped",
    skippedAt: new Date().toISOString(),
    minimized: false,
  });
  hideAll();
}

function minimizePanel() {
  progress = persist({ status: "active", minimized: true });
  showPill();
}

function completeMission(skipped = false) {
  if (!progress) return;
  const idx = progress.currentMission ?? 0;
  const completed = [...(progress.completedMissions ?? [])];
  const skippedList = [...(progress.skippedMissions ?? [])];

  if (skipped) {
    if (!skippedList.includes(idx)) skippedList.push(idx);
  } else if (!completed.includes(idx)) {
    completed.push(idx);
  }

  const next = idx + 1;
  if (next >= TOTAL_MISSIONS) {
    progress = persist({
      completedMissions: completed,
      skippedMissions: skippedList,
      currentMission: TOTAL_MISSIONS - 1,
      status: "completed",
      completedAt: new Date().toISOString(),
      xp: computeXp({ ...progress, completedMissions: completed }),
    });
    showComplete();
    return;
  }

  progress = persist({
    completedMissions: completed,
    skippedMissions: skippedList,
    currentMission: next,
    mission1Checklist: next === 0 ? progress.mission1Checklist : [],
    xp: computeXp({ ...progress, completedMissions: completed }),
  });
  showMission();
}

function toggleChecklistItem(wheelId) {
  if (!progress || !wheelId) return;
  const list = [...(progress.mission1Checklist ?? [])];
  const i = list.indexOf(wheelId);
  if (i >= 0) list.splice(i, 1);
  else list.push(wheelId);
  progress = persist({ mission1Checklist: list });
  renderMissionPanel(els.panel, progress, isTerminalUser());
  selectWheel(wheelId);
  if (typeof window.route === "function") window.route("dashboard");
}

function finishAndEnter() {
  hideAll();
  if (typeof window.route === "function") {
    window.route("portfolio-insights");
  }
  if (typeof window.mountPortfolioInsights === "function") {
    requestAnimationFrame(() => window.mountPortfolioInsights());
  }
}

function shouldShowPromo(uid) {
  if (!uid || isPromoDismissed()) return false;
  if (!hasLegacyOnboardFlag()) return false;
  const p = loadProgress(uid);
  return !p || (p.legacyMigrated && p.status !== "completed");
}

function isTerminalStatus(status) {
  return status === "completed" || status === "skipped";
}

function isMidArc(p) {
  return (
    (p.currentMission ?? 0) > 0 ||
    (p.completedMissions?.length ?? 0) > 0 ||
    (p.mission1Checklist?.length ?? 0) > 0
  );
}

function shouldAutoLaunch(user) {
  if (!MISSION_PATH_ENABLED || !user) return false;
  if (isAdminUser(user)) return false;

  const params = new URLSearchParams(window.location.search);
  if (params.get("mission") === "1" || params.get("mission") === "restart") return true;

  const uid = user.id;
  let p = loadProgress(uid);

  if (hasLegacyOnboardFlag() && !p?.legacyMigrated) {
    markLegacyMigrated(uid);
    p = loadProgress(uid);
    return false;
  }

  if (!p) return true;
  if (isTerminalStatus(p.status)) return false;
  if (p.status === "active") {
    if (p.minimized) return false;
    return true;
  }
  if (p.status === "not_started") return true;
  return false;
}

function initShell() {
  if (shellInitialized) return !!els;
  mountRoot = document.getElementById("missionPathRoot");
  if (!mountRoot) return false;
  shellInitialized = true;
  els = createMissionShell(mountRoot);
  bindMissionDelegation();

  settingsEls.status = document.getElementById("missionPathStatus");
  settingsEls.continueBtn = document.getElementById("missionPathContinue");
  settingsEls.restartBtn = document.getElementById("missionPathRestart");
  settingsEls.resetBtn = document.getElementById("missionPathReset");

  settingsEls.continueBtn?.addEventListener("click", () => {
    closeSettingsIfOpen();
    continueMission();
  });
  settingsEls.restartBtn?.addEventListener("click", () => {
    if (confirm("Restart Mission Path from the beginning? Your progress will reset.")) {
      closeSettingsIfOpen();
      restartMission(true);
    }
  });
  settingsEls.resetBtn?.addEventListener("click", () => {
    if (confirm("Remove all Mission Path progress? This cannot be undone.")) {
      closeSettingsIfOpen();
      resetProgressOnly();
    }
  });

  return true;
}

function closeSettingsIfOpen() {
  if (typeof window.closeSettings === "function") window.closeSettings();
}

export function syncSettingsUI() {
  const row = document.getElementById("missionPathSettings");
  if (row) row.hidden = !authedUser;
  renderSettingsStatus(settingsEls.status, progress);
  syncSettingsButtons(settingsEls, progress);
}

export function continueMission() {
  const uid = userId();
  if (!uid) return;
  progress = loadProgress(uid) ?? startNewArc(uid);
  if (progress.status === "completed") return;
  progress = persist({ status: "active", minimized: false });

  const neverBegan =
    !progress.sessionStarted &&
    !progress.completedMissions?.length &&
    !progress.mission1Checklist?.length;

  if (neverBegan) showWelcome();
  else showMission();
}

export function restartMission(showWelcomeScreen = true) {
  const uid = userId();
  if (!uid) return;
  resetProgress(uid);
  progress = startNewArc(uid);
  if (showWelcomeScreen) showWelcome();
  else showMission();
  syncSettingsUI();
}

export function resetProgressOnly() {
  const uid = userId();
  if (!uid) return;
  resetProgress(uid);
  progress = null;
  hideAll();
  syncSettingsUI();
}

/**
 * @param {object|null} user Clerk user
 */
export function onAuthReady(user) {
  if (!MISSION_PATH_ENABLED) return;
  if (!initShell() && !els) return;

  authedUser = user || null;

  if (!user) {
    progress = null;
    hideAll();
    syncSettingsUI();
    return;
  }

  window._clerkUser = user;
  const uid = user.id;
  progress = loadProgress(uid);

  const params = new URLSearchParams(window.location.search);
  if (params.get("mission") === "restart" && !isAdminUser(user)) {
    /* allow QA for any signed-in user with query flag */
  }

  if (params.get("mission") === "restart" || params.get("mission") === "1") {
    restartMission(true);
    return;
  }

  syncSettingsUI();

  if (isTerminalStatus(progress?.status)) {
    hideAll();
    return;
  }

  if (progress?.status === "active" && progress.minimized) {
    showPill();
    return;
  }

  if (shouldShowPromo(uid)) {
    showPromo();
    return;
  }

  if (!shouldAutoLaunch(user)) {
    hideAll();
    return;
  }

  setTimeout(() => {
    if (!progress) {
      showWelcome();
      return;
    }
    if (progress.status === "active") {
      if (progress.sessionStarted && isMidArc(progress)) showMission();
      else showWelcome();
    }
  }, 850);
}

export function initMissionPath() {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => initShell());
  } else {
    initShell();
  }
}

const MissionPathController = {
  MISSION_PATH_ENABLED,
  onAuthReady,
  continueMission,
  restartMission,
  resetProgressOnly,
  syncSettingsUI,
  initMissionPath,
};

if (typeof window !== "undefined") {
  window.MissionPathController = MissionPathController;
}

export default MissionPathController;
