/**
 * Fetch live inputs and maintain Dashboard News story snapshots.
 * @module lib/dashboard-news-story-runner
 */

import {
  ALL_STORY_QUOTE_SYMBOLS,
  STORY_REGISTRY,
} from "/lib/dashboard-news-story-registry.js";
import {
  cleanDisplayText,
  computeDashboardNewsSnapshot,
} from "/lib/dashboard-news-story-engine.js";

const STORAGE_KEY = "bt_news_story_snapshot_v1";
const MAX_SNAPSHOT_AGE_MS = 7 * 24 * 60 * 60 * 1000;

let refreshInFlight = false;
/** @type {import('./dashboard-news-story-engine.js').computeDashboardNewsSnapshot extends Function ? ReturnType<typeof computeDashboardNewsSnapshot> : null} */
let currentSnapshot = null;

/**
 * @returns {object | null}
 */
export function loadPriorSnapshot() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.stories || !parsed.savedAt) return null;
    if (Date.now() - parsed.savedAt > MAX_SNAPSHOT_AGE_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * @param {object} snapshot
 */
export function saveSnapshot(snapshot) {
  try {
    const payload = {
      savedAt: Date.now(),
      stories: Object.fromEntries(
        snapshot.stories.map((s) => [
          s.id,
          { strength: s.live.strength, status: s.live.status },
        ])
      ),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* storage blocked */
  }
}

/**
 * @returns {Promise<{ price?: number | null, change?: number | null }>}
 */
async function fetchOil() {
  try {
    const res = await fetch(
      "/api/proxy?provider=fred&series=DCOILWTICO"
    );
    if (!res.ok) return { price: null, change: null };
    const data = await res.json();
    const price = parseFloat(data?.value);
    const change = data?.change != null ? parseFloat(data.change) : null;
    return {
      price: Number.isFinite(price) ? price : null,
      change: Number.isFinite(change) ? change : null,
    };
  } catch {
    return { price: null, change: null };
  }
}

/**
 * @returns {unknown[]}
 */
function getImpactItems() {
  return Array.isArray(window._briefTickImpactData)
    ? window._briefTickImpactData
    : [];
}

/**
 * @returns {import('/lib/market-risk-engine.js').SectorSnap[]}
 */
function getSectorSnapshot() {
  if (typeof window.getBrieftickSectorSnapshot === "function") {
    return window.getBrieftickSectorSnapshot();
  }
  return [];
}

/**
 * @param {object} [opts]
 * @param {boolean} [opts.refreshImpact]
 * @param {boolean} [opts.fetchExtraQuotes]
 * @param {boolean} [opts.fetchOil]
 * @param {boolean} [opts.persist]
 */
export async function refreshNewsStoryState(opts = {}) {
  if (refreshInFlight) return currentSnapshot;
  refreshInFlight = true;

  const refreshImpact = opts.refreshImpact === true;
  const fetchExtraQuotes = opts.fetchExtraQuotes !== false;
  const fetchOilFlag = opts.fetchOil !== false;
  const persist = opts.persist !== false;

  try {
    if (refreshImpact && typeof window.liveRefreshImpactFeed === "function") {
      try {
        await window.liveRefreshImpactFeed();
      } catch (e) {
        console.warn("[news-stories] impact feed", e.message);
      }
    }

    const risk = window.riskState || {};
    let quotes = { ...(risk.quotes || {}) };

    if (fetchExtraQuotes && typeof window.fetchLiveQuotes === "function") {
      const extra = ALL_STORY_QUOTE_SYMBOLS.filter((s) => quotes[s]?.pctChange == null);
      if (extra.length) {
        const live = await window.fetchLiveQuotes(extra);
        quotes = { ...quotes, ...live };
      }
    }

    const priorSnapshot = loadPriorSnapshot();
    const oil = fetchOilFlag ? await fetchOil() : { price: null, change: null };

    const snapshot = computeDashboardNewsSnapshot({
      quotes,
      sectors: getSectorSnapshot(),
      rates: risk.rates || {},
      vix: risk.vix ?? (typeof window.vixValue === "number" ? window.vixValue : null),
      impactItems: getImpactItems(),
      oil,
      priorSnapshot,
      now: Date.now(),
    });

    currentSnapshot = snapshot;
    window.dashboardNewsSnapshot = snapshot;

    if (persist) saveSnapshot(snapshot);

    document.dispatchEvent(
      new CustomEvent("bt_news_stories_updated", { detail: snapshot })
    );

    return snapshot;
  } finally {
    refreshInFlight = false;
  }
}

/**
 * @returns {typeof currentSnapshot}
 */
export function getNewsStorySnapshot() {
  return currentSnapshot;
}

/**
 * @param {HTMLElement} root
 * @param {typeof currentSnapshot} snapshot
 */
export function applyNewsSnapshotToDom(root, snapshot) {
  if (!root || !snapshot) return;
  const activeId =
    root.querySelector(".news-narrative-hero")?.dataset.activeStory ||
    snapshot.primaryStoryId;
  const story = snapshot.stories.find((s) => s.id === activeId) || snapshot.stories[0];
  if (!story?.live) return;

  const live = story.live;
  const panel = root.querySelector("[data-news-live-panel]");
  if (!panel) return;

  const isPrimary = activeId === snapshot.primaryStoryId;
  const statusEl = panel.querySelector("[data-news-status]");
  const updatedEl = panel.querySelector("[data-news-updated]");
  const strengthEl = panel.querySelector("[data-news-strength]");
  const strengthBar = panel.querySelector("[data-news-strength-bar]");
  const confidenceEl = panel.querySelector("[data-news-confidence]");
  const changedList = panel.querySelector("[data-news-changed-list]");
  const sectorsEl = panel.querySelector("[data-news-sectors]");
  const sinceEl = panel.querySelector("[data-news-since]");
  const sinceList = panel.querySelector("[data-news-since-list]");
  const credEl = panel.querySelector("[data-news-credibility]");

  if (statusEl) {
    statusEl.textContent = `${statusArrow(live.status)} ${statusLabel(live.status)}`;
    statusEl.dataset.status = live.status;
  }
  if (updatedEl) {
    if (isPrimary) {
      updatedEl.hidden = false;
      updatedEl.textContent = formatUpdatedLine(live.updatedAt, live.dataQuality);
      updatedEl.dataset.quality = live.dataQuality;
    } else {
      updatedEl.hidden = true;
    }
  }
  if (strengthEl) strengthEl.textContent = `${live.strength} / 100`;
  if (strengthBar) strengthBar.style.width = `${Math.max(0, Math.min(100, live.strength))}%`;
  if (confidenceEl) {
    confidenceEl.textContent = formatCoverageLabel(live.confidence);
    confidenceEl.dataset.confidence = live.confidence;
  }
  if (credEl) credEl.hidden = !isPrimary;
  if (changedList) {
    changedList.innerHTML = "";
    for (const text of live.whatChangedToday) {
      const li = document.createElement("li");
      li.textContent = cleanDisplayText(text);
      changedList.appendChild(li);
    }
  }
  if (sectorsEl) {
    sectorsEl.innerHTML = renderRelatedSectors(live.relatedSectors);
  }
  if (sinceEl && sinceList) {
    const sinceHtml = renderSinceLastVisit(snapshot.sinceLastVisit);
    if (sinceHtml) {
      sinceEl.hidden = false;
      sinceList.hidden = false;
      sinceList.innerHTML = sinceHtml;
    } else {
      sinceEl.hidden = true;
      sinceList.hidden = true;
    }
  }
}

/**
 * @param {string} s
 */
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Compact labels — avoid repeating full timeline titles. */
const SINCE_VISIT_LABEL = {
  inflation: "Inflation",
  ai: "AI",
  europe: "US vs Europe",
  energy: "Energy",
};

/**
 * @param {number} updatedAt
 * @param {string} dataQuality
 */
function formatUpdatedLine(updatedAt, dataQuality) {
  const sec = Math.max(0, Math.floor((Date.now() - updatedAt) / 1000));
  let ago = "just now";
  if (sec >= 45) {
    const min = Math.floor(sec / 60);
    if (min < 60) ago = `${min} min ago`;
    else ago = `${Math.floor(min / 60)} hr ago`;
  }
  const quality =
    dataQuality === "live"
      ? "Live"
      : dataQuality === "delayed"
        ? "Delayed"
        : null;
  return quality ? `Updated ${ago} · ${quality}` : `Updated ${ago}`;
}

/**
 * @param {Array<{ storyId: string, status: string }>} [rows]
 */
function renderSinceLastVisit(rows) {
  if (!rows?.length) return "";
  const changed = rows.filter((r) => r.status !== "stable");
  const unchangedCount = rows.filter((r) => r.status === "stable").length;
  if (!changed.length && !unchangedCount) return "";

  const parts = changed.map((row) => {
    const label = SINCE_VISIT_LABEL[row.storyId] || row.shortTitle;
    if (row.status === "strengthening") return `▲ ${label} strengthened`;
    return `▼ ${label} weakened`;
  });

  if (!parts.length && unchangedCount > 0) {
    const noun = unchangedCount === 1 ? "story" : "stories";
    return `<li class="news-live-since__muted">${unchangedCount} ${noun} unchanged</li>`;
  }

  const html = parts.map((line) => `<li>${escapeHtml(line)}</li>`).join("");
  if (unchangedCount > 0) {
    const noun = unchangedCount === 1 ? "story" : "stories";
    return `${html}<li class="news-live-since__muted">${unchangedCount} ${noun} unchanged</li>`;
  }
  return html;
}

/**
 * @param {number | null} pct
 */
function sectorDirection(pct) {
  if (pct == null || Number.isNaN(pct)) return "flat";
  if (pct > 0.05) return "up";
  if (pct < -0.05) return "down";
  return "flat";
}

/**
 * @param {number | null} pct
 */
function sectorArrow(pct) {
  const dir = sectorDirection(pct);
  if (dir === "up") return "▲";
  if (dir === "down") return "▼";
  return "→";
}

/**
 * @param {'high' | 'medium' | 'low'} confidence
 */
function formatCoverageLabel(confidence) {
  if (confidence === "high") return "High";
  if (confidence === "low") return "Low data confidence";
  return "Medium";
}

/**
 * @param {Array<{ label: string, pct: number | null }>} sectors
 */
function renderRelatedSectors(sectors) {
  if (!sectors?.length) return "";

  return sectors
    .map((s) => {
      const dir = sectorDirection(s.pct);
      const arrow = sectorArrow(s.pct);
      return `<li class="news-live-sector news-live-sector--${dir}">${escapeHtml(s.label)} <span class="news-live-sector__dir" aria-hidden="true">${arrow}</span></li>`;
    })
    .join("");
}

function statusLabel(status) {
  if (status === "strengthening") return "Strengthening";
  if (status === "weakening") return "Weakening";
  return "Stable";
}

function statusArrow(status) {
  if (status === "strengthening") return "▲";
  if (status === "weakening") return "▼";
  return "→";
}

function init() {
  window.refreshNewsStoryState = refreshNewsStoryState;
  window.getNewsStorySnapshot = getNewsStorySnapshot;
  window.applyNewsSnapshotToDom = applyNewsSnapshotToDom;

  document.addEventListener("bt_risk_state_updated", () => {
    const page = document.getElementById("page-dashboard");
    if (!page?.classList.contains("active")) return;
    const module = document
      .getElementById("wheelModuleStage")
      ?.querySelector(".rail-module--intel");
    if (!module) return;
    refreshNewsStoryState({
      refreshImpact: false,
      fetchOil: false,
      persist: false,
    }).then((snap) => {
      if (snap) applyNewsSnapshotToDom(module, snap);
    });
  });
}

init();
