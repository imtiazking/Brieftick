/**
 * News wheel — market interpreter (plain English, preview / design lab).
 * @module preview/dashboard-news-narrative
 */

import { bindNewsGlobeInteraction } from "./dashboard-news-globe.js";
import {
  STORY_REGISTRY,
  STORY_REGISTRY_BY_ID,
} from "/lib/dashboard-news-story-registry.js";

/**
 * @typedef {Object} NewsStory
 * @property {string} id
 * @property {boolean} [primary]
 * @property {string} headline
 * @property {string} what
 * @property {string} why
 * @property {string[]} impact
 * @property {string[]} watching
 * @property {string} shortTitle
 */

/** @type {NewsStory[]} — backward-compatible export */
export const NEWS_STORIES = STORY_REGISTRY.map((s) => ({
  id: s.id,
  primary: s.primary,
  headline: s.headline,
  what: s.what,
  why: s.why,
  impact: s.impactSectors,
  watching: s.watchingTemplates,
  shortTitle: s.shortTitle,
}));

/**
 * @param {string} s
 */
function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * @param {string} storyId
 * @returns {string}
 */
function renderNewsVisual(storyId) {
  return `<div class="news-narrative__visual" data-visual="${esc(storyId)}" data-globe-ready="true">
    <div class="news-globe-stage" data-globe-stage>
      <canvas class="news-globe-canvas" aria-hidden="true"></canvas>
      <div class="news-globe-hit" data-globe-hit aria-hidden="true"></div>
    </div>
  </div>`;
}

/**
 * @param {import('/lib/dashboard-news-story-registry.js').StoryRegistryEntry} story
 * @returns {string}
 */
function renderLivePanel(story) {
  const watching = story.watchingTemplates
    .map((item) => `<li>${esc(item)}</li>`)
    .join("");

  return `
    <div class="news-live-panel" data-news-live-panel aria-live="polite">
      <div class="news-live-panel__meta">
        <div class="news-live-panel__status-row">
          <span class="news-live-panel__label">Status</span>
          <span class="news-live-panel__status" data-news-status data-status="stable">→ Stable</span>
        </div>
        <div class="news-live-panel__status-row">
          <span class="news-live-panel__label">Updated</span>
          <span class="news-live-panel__updated" data-news-updated>Updating…</span>
          <span class="news-live-panel__badge" data-news-live-badge data-quality="fallback">Updating</span>
        </div>
      </div>
      <div class="news-live-panel__metrics">
        <div class="news-live-metric">
          <span class="news-live-panel__label">Story strength</span>
          <span class="news-live-metric__value" data-news-strength>— / 100</span>
        </div>
        <div class="news-live-metric">
          <span class="news-live-panel__label">Confidence</span>
          <span class="news-live-metric__value" data-news-confidence data-confidence="low">—</span>
        </div>
      </div>
      <div class="news-narrative__block news-live-panel__block">
        <p class="news-narrative__block-label">What changed today</p>
        <ul class="news-live-changed" data-news-changed-list>
          <li>Loading live market context…</li>
        </ul>
      </div>
      <div class="news-narrative__block news-live-panel__block">
        <p class="news-narrative__block-label">Related sectors</p>
        <ul class="news-live-sectors" data-news-sectors></ul>
      </div>
      <div class="news-narrative__block news-live-panel__since" data-news-since hidden>
        <p class="news-narrative__block-label">Since your last visit</p>
        <ul class="news-live-since" data-news-since-list hidden></ul>
      </div>
      <div class="news-narrative__block">
        <p class="news-narrative__block-label">What could change it</p>
        <ul class="news-watching__list news-watching__list--templates">${watching}</ul>
      </div>
    </div>
  `;
}

/**
 * @param {import('/lib/dashboard-news-story-registry.js').StoryRegistryEntry} story
 * @param {boolean} [isPrimaryStory]
 * @returns {string}
 */
function renderHeroContent(story, isPrimaryStory) {
  const kicker = isPrimaryStory
    ? "Today's biggest story"
    : "Also shaping markets";

  return `
    <p class="news-narrative__kicker">${esc(kicker)}</p>
    <h2 class="news-narrative__headline">${esc(story.headline)}</h2>
    <p class="news-narrative__what">${esc(story.what)}</p>
    ${renderLivePanel(story)}
    <div class="news-narrative__block">
      <p class="news-narrative__block-label">Why it matters</p>
      <p class="news-narrative__block-text">${esc(story.why)}</p>
    </div>
  `;
}

/** @returns {string} */
export function renderNewsHero() {
  const primary = STORY_REGISTRY[0];
  const nodes = STORY_REGISTRY.map((story, i) => {
    const tier = story.primary ? " is-primary" : " is-secondary";
    const active = i === 0 ? " is-active" : "";
    return `<button
      type="button"
      class="news-story-node${tier}${active}"
      data-story-id="${esc(story.id)}"
      aria-selected="${i === 0 ? "true" : "false"}"
      style="--story-i:${i}"
    >
      <span class="news-story-node__marker" aria-hidden="true"></span>
      <span class="news-story-node__title">${esc(story.shortTitle)}</span>
    </button>`;
  }).join("");

  return `<div class="live-chart news-narrative-hero" data-active-story="${esc(primary.id)}">
    <div class="news-narrative__ambience" aria-hidden="true">
      <span class="news-narrative__sweep"></span>
      <span class="news-narrative__bloom"></span>
    </div>
    <article class="news-narrative__hero is-visible" aria-live="polite">
      <div class="news-narrative__hero-grid">
        <div class="news-narrative__hero-content">${renderHeroContent(primary, true)}</div>
        ${renderNewsVisual(primary.id)}
      </div>
    </article>
    <div class="news-narrative__supporting">
      <div class="news-narrative__timeline">
        <div class="news-timeline__track">
          <span class="news-timeline__flow" aria-hidden="true"></span>
          <span class="news-timeline__pulse" aria-hidden="true"></span>
        </div>
        <div class="news-timeline__nodes" role="list">${nodes}</div>
      </div>
    </div>
  </div>`;
}

/**
 * @param {HTMLElement} root
 */
export function bindNewsNarrative(root) {
  const wrap = root.querySelector(".news-narrative-hero");
  if (!wrap) return;

  const hero = wrap.querySelector(".news-narrative__hero");
  const heroContent = wrap.querySelector(".news-narrative__hero-content");
  const visual = wrap.querySelector(".news-narrative__visual");
  const pulse = wrap.querySelector(".news-timeline__pulse");
  const nodes = [...wrap.querySelectorAll(".news-story-node[data-story-id]")];

  if (!hero || !heroContent || !nodes.length) return;

  const primaryId = STORY_REGISTRY.find((s) => s.primary)?.id || STORY_REGISTRY[0].id;

  const pulseLeft = (index, count) => {
    if (count <= 1) return 50;
    return 6 + (index / (count - 1)) * 88;
  };

  const applySnapshot = () => {
    const snap =
      window.dashboardNewsSnapshot ||
      (typeof window.getNewsStorySnapshot === "function"
        ? window.getNewsStorySnapshot()
        : null);
    if (snap && typeof window.applyNewsSnapshotToDom === "function") {
      window.applyNewsSnapshotToDom(root, snap);
    }
  };

  const applyStory = (node, intent) => {
    const id = node.dataset.storyId || "";
    const story = STORY_REGISTRY_BY_ID[id];
    if (!story) return;

    const i = nodes.indexOf(node);
    const isSelect = intent === "select";
    const isPrimaryStory = id === primaryId;

    nodes.forEach((n) => {
      const on = isSelect && n === node;
      n.classList.toggle("is-active", on);
      n.setAttribute("aria-selected", on ? "true" : "false");
    });

    wrap.classList.add("has-focus");
    wrap.dataset.activeStory = id;

    if (pulse) pulse.style.left = `${pulseLeft(i, nodes.length)}%`;

    heroContent.innerHTML = renderHeroContent(story, isPrimaryStory);
    applySnapshot();

    if (visual) {
      visual.dataset.visual = id;
      const globeIntent = isSelect ? "select" : "preview";
      if (typeof visual._globeSetStory === "function") {
        visual._globeSetStory(id, { intent: globeIntent });
      } else {
        visual._globeCanvas?.setStory?.(id, { intent: globeIntent });
      }
      if (
        typeof globalThis !== "undefined" &&
        (globalThis.__NEWS_GLOBE_DEBUG__ === true ||
          (typeof location !== "undefined" &&
            new URLSearchParams(location.search).has("globe-debug")))
      ) {
        console.info(`[news-globe] ${isSelect ? "select" : "hover"}`, {
          storyId: id,
          shortTitle: story.shortTitle,
          intent: globeIntent,
          globeBound: visual.dataset.globeBound === "true",
          hasGlobeApi: Boolean(visual._globeCanvas?.setStory),
        });
      }
      visual.classList.remove("is-updating");
      void visual.offsetWidth;
      visual.classList.add("is-updating");
    }

    hero.classList.remove("is-visible");
    requestAnimationFrame(() => hero.classList.add("is-visible"));
  };

  nodes.forEach((node) => {
    node.addEventListener("pointerenter", () => applyStory(node, "preview"));
    node.addEventListener("focus", () => applyStory(node, "preview"));
    node.addEventListener("click", () => applyStory(node, "select"));
  });

  wrap.addEventListener("pointerleave", () => wrap.classList.remove("has-focus"));

  if (pulse) pulse.style.left = `${pulseLeft(0, nodes.length)}%`;
  applyStory(nodes[0], "select");

  const onStoriesUpdated = (ev) => {
    if (ev.detail && typeof window.applyNewsSnapshotToDom === "function") {
      window.applyNewsSnapshotToDom(root, ev.detail);
    }
  };
  document.addEventListener("bt_news_stories_updated", onStoriesUpdated);

  if (typeof window.refreshNewsStoryState === "function") {
    window
      .refreshNewsStoryState({ refreshImpact: true, fetchOil: true })
      .then(() => applySnapshot())
      .catch(() => {});
  }

  if (visual) {
    if (visual._globeTeardown) visual._globeTeardown();
    requestAnimationFrame(() => {
      if (!visual.isConnected) return;
      visual._globeTeardown = bindNewsGlobeInteraction(visual);
    });
  }

  return () => {
    document.removeEventListener("bt_news_stories_updated", onStoriesUpdated);
    if (visual?._globeTeardown) {
      visual._globeTeardown();
      visual._globeTeardown = null;
    }
  };
}
