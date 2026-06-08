/**
 * News wheel — market interpreter (plain English, preview / design lab).
 * @module preview/dashboard-news-narrative
 */

import { bindNewsGlobeInteraction } from "./dashboard-news-globe.js";
import {
  STORY_REGISTRY,
  STORY_REGISTRY_BY_ID,
} from "/lib/dashboard-news-story-registry.js";

const PRIMARY_KICKER = "What markets are watching";
const SECONDARY_KICKER = "Also shaping markets";

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

function getPrimaryStory() {
  return STORY_REGISTRY.find((s) => s.primary) || STORY_REGISTRY[0];
}

function getSecondaryStories() {
  const primary = getPrimaryStory();
  return STORY_REGISTRY.filter((s) => s.id !== primary.id);
}

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
 * @param {boolean} isPrimaryStory
 * @returns {string}
 */
function renderLivePanel(story, isPrimaryStory) {
  const watching = story.watchingTemplates
    .map((item) => `<li>${esc(item)}</li>`)
    .join("");

  return `
    <div class="news-live-panel" data-news-live-panel aria-live="polite">
      <div class="news-live-panel__lead">
        <p class="news-live-panel__lead-label">What changed today</p>
        <ul class="news-live-changed" data-news-changed-list>
          <li>Loading live market context…</li>
        </ul>
      </div>
      <div class="news-live-panel__meta">
        <span class="news-live-status-chip" data-news-status data-status="stable">
          <span class="news-live-status-chip__icon" data-news-status-icon aria-hidden="true">●</span>
          <span class="news-live-status-chip__label" data-news-status-label>Stable</span>
        </span>
        <span class="news-live-panel__updated" data-news-updated data-quality="fallback" hidden>Updating…</span>
      </div>
      <div class="news-live-panel__metrics">
        <div class="news-live-metric news-live-metric--strength">
          <span class="news-live-panel__label">Story strength</span>
          <div class="news-live-strength__track" aria-hidden="true">
            <div class="news-live-strength__fill" data-news-strength-bar style="width:0%"></div>
          </div>
          <span class="news-live-metric__value" data-news-strength>— / 100</span>
        </div>
        <div class="news-live-metric">
          <span class="news-live-panel__label">Data coverage</span>
          <span class="news-live-metric__value" data-news-confidence data-confidence="low">—</span>
        </div>
      </div>
      <div class="news-narrative__block news-live-panel__block news-live-panel__sectors">
        <p class="news-narrative__block-label">Related sectors</p>
        <ul class="news-live-sectors" data-news-sectors></ul>
      </div>
      <div class="news-narrative__block news-live-panel__since" data-news-since hidden>
        <p class="news-narrative__block-label">Since your last visit</p>
        <ul class="news-live-since" data-news-since-list hidden></ul>
      </div>
      <div class="news-narrative__block news-live-panel__watching">
        <p class="news-narrative__block-label">What could change it</p>
        <ul class="news-watching__list news-watching__list--templates">${watching}</ul>
      </div>
    </div>
  `;
}

/**
 * @param {import('/lib/dashboard-news-story-registry.js').StoryRegistryEntry} story
 * @param {boolean} isPrimaryStory
 * @returns {string}
 */
function renderHeroContent(story, isPrimaryStory) {
  const credibility = isPrimaryStory
    ? `<p class="news-live-panel__credibility" data-news-credibility>
        Built from live prices, sectors and macro signals.
      </p>`
    : `<p class="news-live-panel__credibility" data-news-credibility hidden>
        Built from live prices, sectors and macro signals.
      </p>`;

  return `
    <h2 class="news-narrative__headline">${esc(story.headline)}</h2>
    <p class="news-narrative__what news-narrative__what--supporting">${esc(story.what)}</p>
    ${renderLivePanel(story, isPrimaryStory)}
    <div class="news-narrative__block">
      <p class="news-narrative__block-label">Why it matters</p>
      <p class="news-narrative__block-text">${esc(story.why)}</p>
    </div>
    ${credibility}
  `;
}

/**
 * @param {import('/lib/dashboard-news-story-registry.js').StoryRegistryEntry} primary
 * @returns {string}
 */
function renderPrimaryFocusButton(primary) {
  return `<button
    type="button"
    class="news-story-node is-primary-focus is-active"
    data-story-id="${esc(primary.id)}"
    aria-selected="true"
  >
    <span class="news-story-node__marker" aria-hidden="true"></span>
    <span class="news-story-node__title">Market focus</span>
  </button>`;
}

/** @returns {string} */
export function renderNewsHero() {
  const primary = getPrimaryStory();
  const secondary = getSecondaryStories();
  const secondaryNodes = secondary
    .map(
      (story) => `<button
      type="button"
      class="news-story-node is-secondary"
      data-story-id="${esc(story.id)}"
      aria-selected="false"
    >
      <span class="news-story-node__marker" aria-hidden="true"></span>
      <span class="news-story-node__title">${esc(story.shortTitle)}</span>
    </button>`
    )
    .join("");

  return `<div class="live-chart news-narrative-hero" data-active-story="${esc(primary.id)}" data-primary-story="${esc(primary.id)}">
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
        <p class="news-narrative__section-label news-narrative__section-label--primary">${esc(PRIMARY_KICKER)}</p>
        <div class="news-narrative__focus-row">
          ${renderPrimaryFocusButton(primary)}
        </div>
        <p class="news-narrative__section-label news-narrative__section-label--secondary">${esc(SECONDARY_KICKER)}</p>
        <div class="news-timeline__nodes" role="list">${secondaryNodes}</div>
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
  const primaryId = wrap.dataset.primaryStory || getPrimaryStory().id;
  const focusBtn = wrap.querySelector(".news-story-node.is-primary-focus");
  const secondaryNodes = [...wrap.querySelectorAll(".news-story-node.is-secondary[data-story-id]")];
  const allNodes = focusBtn ? [focusBtn, ...secondaryNodes] : secondaryNodes;

  if (!hero || !heroContent || !allNodes.length) return;

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

    const isSelect = intent === "select";
    const isPrimaryStory = id === primaryId;
    const nodeIndex = allNodes.indexOf(node);

    allNodes.forEach((n) => {
      const on = isSelect && n === node;
      n.classList.toggle("is-active", on);
      n.setAttribute("aria-selected", on ? "true" : "false");
    });

    wrap.classList.toggle("has-focus", !isPrimaryStory || !isSelect);
    wrap.dataset.activeStory = id;

    if (pulse && nodeIndex >= 0) {
      pulse.style.left = `${pulseLeft(nodeIndex, allNodes.length)}%`;
    }

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
      visual.classList.remove("is-updating");
      void visual.offsetWidth;
      visual.classList.add("is-updating");
    }

    hero.classList.remove("is-visible");
    requestAnimationFrame(() => hero.classList.add("is-visible"));
  };

  if (focusBtn) {
    focusBtn.addEventListener("click", () => applyStory(focusBtn, "select"));
  }

  secondaryNodes.forEach((node) => {
    node.addEventListener("pointerenter", () => applyStory(node, "preview"));
    node.addEventListener("focus", () => applyStory(node, "preview"));
    node.addEventListener("click", () => applyStory(node, "select"));
  });

  wrap.addEventListener("pointerleave", () => {
    if (wrap.dataset.activeStory === primaryId) {
      wrap.classList.remove("has-focus");
    }
  });

  if (pulse) pulse.style.left = `${pulseLeft(0, allNodes.length)}%`;
  if (focusBtn) applyStory(focusBtn, "select");

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
