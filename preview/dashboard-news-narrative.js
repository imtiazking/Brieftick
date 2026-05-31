/**
 * News wheel — market interpreter (plain English, preview / design lab).
 * @module preview/dashboard-news-narrative
 */

import { bindNewsGlobeInteraction } from "./dashboard-news-globe.js";

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

/** @type {NewsStory[]} */
export const NEWS_STORIES = [
  {
    id: "inflation",
    primary: true,
    headline: "Inflation Is Driving Markets",
    what: "Higher inflation expectations are influencing interest rates and technology stocks.",
    why: "Higher rates can make growth stocks less attractive.",
    impact: ["Technology", "Banks", "Energy"],
    watching: ["Next inflation report", "Federal Reserve commentary"],
    shortTitle: "Inflation is driving markets",
  },
  {
    id: "ai",
    headline: "AI Spending Is Lifting Tech Stocks",
    what: "Large companies are still investing heavily in artificial intelligence, which helps chip and software stocks.",
    why: "When technology leads, major indexes often rise even when other parts of the economy slow down.",
    impact: ["Technology", "Semiconductors"],
    watching: ["Big tech earnings", "New AI product launches"],
    shortTitle: "AI spending lifts tech",
  },
  {
    id: "europe",
    headline: "US Markets Are Outpacing Europe",
    what: "American stocks are rising while growth in Europe looks weaker.",
    why: "Investors often move money toward stronger economies, which can lift US stocks and the dollar.",
    impact: ["Technology", "Large US companies", "Currency markets"],
    watching: ["European economic reports", "US sales abroad"],
    shortTitle: "US ahead of Europe",
  },
  {
    id: "energy",
    headline: "Steady Oil Prices Are Helping Energy Stocks",
    what: "Oil prices are holding in a stable range, giving energy companies more predictable profits.",
    why: "When energy rises without wild price swings, it can support the broader market without adding panic.",
    impact: ["Energy", "Transportation"],
    watching: ["Oil supply updates", "Energy company earnings"],
    shortTitle: "Oil steady, energy firm",
  },
];

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
 * @param {NewsStory} story
 * @returns {string}
 */
function renderHeroContent(story) {
  const kicker = story.primary ? "Today's biggest story" : "Also shaping markets";
  const impact = story.impact
    .map((item) => `<li class="news-impact__tag">${esc(item)}</li>`)
    .join("");
  const watching = story.watching.map((item) => `<li>${esc(item)}</li>`).join("");

  return `
    <p class="news-narrative__kicker">${esc(kicker)}</p>
    <h2 class="news-narrative__headline">${esc(story.headline)}</h2>
    <p class="news-narrative__what">${esc(story.what)}</p>
    <div class="news-narrative__block">
      <p class="news-narrative__block-label">Why it matters</p>
      <p class="news-narrative__block-text">${esc(story.why)}</p>
    </div>
    <div class="news-narrative__block">
      <p class="news-narrative__block-label">Market impact</p>
      <ul class="news-impact__tags" aria-label="Market impact">${impact}</ul>
    </div>
    <div class="news-narrative__block">
      <p class="news-narrative__block-label">What investors are watching next</p>
      <ul class="news-watching__list">${watching}</ul>
    </div>
  `;
}

/** @returns {string} */
export function renderNewsHero() {
  const primary = NEWS_STORIES[0];
  const nodes = NEWS_STORIES.map((story, i) => {
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
        <div class="news-narrative__hero-content">${renderHeroContent(primary)}</div>
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

  const byId = Object.fromEntries(NEWS_STORIES.map((s) => [s.id, s]));

  const pulseLeft = (index, count) => {
    if (count <= 1) return 50;
    return 6 + (index / (count - 1)) * 88;
  };

  const setActive = (node) => {
    const id = node.dataset.storyId || "";
    const story = byId[id];
    if (!story) return;

    const i = nodes.indexOf(node);

    nodes.forEach((n) => {
      const on = n === node;
      n.classList.toggle("is-active", on);
      n.setAttribute("aria-selected", on ? "true" : "false");
    });

    wrap.classList.add("has-focus");
    wrap.dataset.activeStory = id;

    if (pulse) pulse.style.left = `${pulseLeft(i, nodes.length)}%`;

    heroContent.innerHTML = renderHeroContent(story);

    if (visual) {
      visual.dataset.visual = id;
      visual._globeCanvas?.setStory(id);
      visual.classList.remove("is-updating");
      void visual.offsetWidth;
      visual.classList.add("is-updating");
    }

    hero.classList.remove("is-visible");
    requestAnimationFrame(() => hero.classList.add("is-visible"));
  };

  nodes.forEach((node) => {
    node.addEventListener("pointerenter", () => setActive(node));
    node.addEventListener("focus", () => setActive(node));
    node.addEventListener("click", () => setActive(node));
  });

  wrap.addEventListener("pointerleave", () => wrap.classList.remove("has-focus"));

  if (pulse) pulse.style.left = `${pulseLeft(0, nodes.length)}%`;
  setActive(nodes[0]);

  if (visual) {
    if (visual._globeTeardown) visual._globeTeardown();
    requestAnimationFrame(() => {
      if (!visual.isConnected) return;
      visual._globeTeardown = bindNewsGlobeInteraction(visual);
    });
  }

  return () => {
    if (visual?._globeTeardown) {
      visual._globeTeardown();
      visual._globeTeardown = null;
    }
  };
}
