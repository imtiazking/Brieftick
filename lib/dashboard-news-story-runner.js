/**
 * Fetch live inputs and maintain Dashboard News story snapshots.
 * @module lib/dashboard-news-story-runner
 */

import {
  ALL_STORY_QUOTE_SYMBOLS,
  STORY_REGISTRY,
} from "/lib/dashboard-news-story-registry.js";
import { computeDashboardNewsSnapshot } from "/lib/dashboard-news-story-engine.js";

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

  const statusEl = panel.querySelector("[data-news-status]");
  const updatedEl = panel.querySelector("[data-news-updated]");
  const strengthEl = panel.querySelector("[data-news-strength]");
  const confidenceEl = panel.querySelector("[data-news-confidence]");
  const changedList = panel.querySelector("[data-news-changed-list]");
  const sectorsEl = panel.querySelector("[data-news-sectors]");
  const sinceEl = panel.querySelector("[data-news-since]");
  const sinceList = panel.querySelector("[data-news-since-list]");

  if (statusEl) {
    statusEl.textContent = `${statusArrow(live.status)} ${statusLabel(live.status)}`;
    statusEl.dataset.status = live.status;
  }
  if (updatedEl) updatedEl.textContent = live.updatedAgoLabel;
  if (strengthEl) strengthEl.textContent = `${live.strength} / 100`;
  if (confidenceEl) {
    confidenceEl.textContent =
      live.confidence.charAt(0).toUpperCase() + live.confidence.slice(1);
    confidenceEl.dataset.confidence = live.confidence;
  }
  if (changedList) {
    changedList.innerHTML = live.whatChangedToday
      .map((t) => `<li>${escapeHtml(t)}</li>`)
      .join("");
  }
  if (sectorsEl) {
    sectorsEl.innerHTML = live.relatedSectors
      .map((s) => {
        const pct =
          s.pct != null
            ? ` <span class="news-live-sector__pct">${formatPct(s.pct)}</span>`
            : "";
        return `<li class="news-live-sector">${escapeHtml(s.label)}${pct}</li>`;
      })
      .join("");
  }
  if (sinceEl && sinceList) {
    if (snapshot.sinceLastVisit?.length) {
      sinceEl.hidden = false;
      sinceList.hidden = false;
      sinceList.innerHTML = snapshot.sinceLastVisit
        .map((row) => `<li>${escapeHtml(row.line)}</li>`)
        .join("");
    } else {
      sinceEl.hidden = true;
      sinceList.hidden = true;
    }
  }

  const badge = root.querySelector("[data-news-live-badge]");
  if (badge) {
    badge.textContent =
      live.dataQuality === "live"
        ? "Live"
        : live.dataQuality === "delayed"
          ? "Delayed"
          : "Updating";
    badge.dataset.quality = live.dataQuality;
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

/**
 * @param {number} pct
 */
function formatPct(pct) {
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
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
