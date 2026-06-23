/**
 * News wheel — live market intelligence (plain English).
 * @module preview/dashboard-news-narrative
 */

import { renderNewsEvidenceChartShell } from "/lib/dashboard-news-evidence-chart.js";
import { STORY_REGISTRY_BY_ID } from "/lib/dashboard-news-story-registry.js";

const PRIMARY_KICKER = "What markets are watching";
const SECONDARY_KICKER = "Also shaping markets";

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
  return renderNewsEvidenceChartShell(storyId);
}

/**
 * @param {object} story
 * @param {boolean} isPrimaryStory
 * @returns {string}
 */
function renderLivePanel(story, isPrimaryStory) {
  const watchingItems = story.live?.whatCouldChangeIt?.length
    ? story.live.whatCouldChangeIt
    : ["Loading upcoming macro and earnings events…"];
  const watching = watchingItems.map((item) => `<li>${esc(item)}</li>`).join("");

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
      <p class="news-live-panel__source" data-news-source hidden>Source: — · Updated: —</p>
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
        <ul class="news-watching__list news-watching__list--live" data-news-watching-list>${watching}</ul>
      </div>
    </div>
  `;
}

/**
 * @param {object} story — snapshot story row with live fields
 * @param {boolean} isPrimaryStory
 * @returns {string}
 */
function renderHeroContent(story, isPrimaryStory) {
  const live = story.live || {};
  const headline = live.headline || "Loading market intelligence…";
  const what = live.what || "Live market data is loading.";
  const why = live.why || story.why || "";

  const credibility = isPrimaryStory
    ? `<p class="news-live-panel__credibility" data-news-credibility>
        Built from live prices, sectors and macro signals.
      </p>`
    : `<p class="news-live-panel__credibility" data-news-credibility hidden>
        Built from live prices, sectors and macro signals.
      </p>`;

  return `
    <h2 class="news-narrative__headline" data-news-headline>${esc(headline)}</h2>
    <p class="news-narrative__what news-narrative__what--supporting" data-news-what>${esc(what)}</p>
    ${renderLivePanel(story, isPrimaryStory)}
    <div class="news-narrative__block">
      <p class="news-narrative__block-label">Why it matters</p>
      <p class="news-narrative__block-text">${esc(why)}</p>
    </div>
    ${credibility}
  `;
}

/**
 * @param {object} primary
 * @returns {string}
 */
function renderPrimaryFocusButton(primary) {
  const title = primary.live?.shortTitle || "Market focus";
  return `<button
    type="button"
    class="news-story-node is-primary-focus is-active"
    data-story-id="${esc(primary.id)}"
    aria-selected="true"
  >
    <span class="news-story-node__marker" aria-hidden="true"></span>
    <span class="news-story-node__title" data-story-node-title>${esc(title)}</span>
  </button>`;
}

/**
 * @param {typeof window.dashboardNewsSnapshot | null} [snapshot]
 * @returns {string}
 */
export function renderNewsHero(snapshot = null) {
  const snap = snapshot || (typeof window !== "undefined" ? window.dashboardNewsSnapshot : null);
  const stories = snap?.stories?.length ? snap.stories : [];
  const primary = stories[0] || { id: "inflation", live: { headline: "Loading market intelligence…", what: "Fetching live market context…", shortTitle: "Loading…", why: STORY_REGISTRY_BY_ID.inflation?.why || "" }, why: STORY_REGISTRY_BY_ID.inflation?.why || "" };
  const secondary = stories.length > 1 ? stories.slice(1) : [];

  const secondaryNodes = secondary
    .map(
      (story) => `<button
      type="button"
      class="news-story-node is-secondary"
      data-story-id="${esc(story.id)}"
      aria-selected="false"
    >
      <span class="news-story-node__marker" aria-hidden="true"></span>
      <span class="news-story-node__title" data-story-node-title>${esc(story.live?.shortTitle || story.id)}</span>
    </button>`
    )
    .join("");

  const showSecondary = secondaryNodes.length > 0;

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
        <div class="news-narrative__focus-row" data-news-focus-row>
          ${renderPrimaryFocusButton(primary)}
        </div>
        ${showSecondary ? `<p class="news-narrative__section-label news-narrative__section-label--secondary">${esc(SECONDARY_KICKER)}</p>
        <div class="news-timeline__nodes" role="list" data-news-timeline-nodes>${secondaryNodes}</div>` : `<div class="news-timeline__nodes" role="list" data-news-timeline-nodes hidden></div>`}
      </div>
    </div>
  </div>`;
}

/**
 * Rebuild timeline nodes when snapshot ranking changes.
 * @param {HTMLElement} wrap
 * @param {typeof window.dashboardNewsSnapshot} snapshot
 */
export function rebuildNewsTimeline(wrap, snapshot) {
  if (!wrap || !snapshot?.stories?.length) return;
  const stories = snapshot.stories;
  const primary = stories[0];
  const secondary = stories.slice(1);
  const primaryId = primary.id;

  wrap.dataset.primaryStory = primaryId;
  if (wrap.dataset.activeStory === wrap.dataset._lastPrimaryStory) {
    wrap.dataset.activeStory = primaryId;
  }
  wrap.dataset._lastPrimaryStory = primaryId;

  const focusRow = wrap.querySelector("[data-news-focus-row]");
  if (focusRow) {
    focusRow.innerHTML = renderPrimaryFocusButton(primary);
    const btn = focusRow.querySelector(".news-story-node");
    if (btn) btn.addEventListener("click", wrap._newsOnFocusClick || (() => {}));
  }

  const nodesWrap = wrap.querySelector("[data-news-timeline-nodes]");
  const secondaryLabel = wrap.querySelector(".news-narrative__section-label--secondary");
  if (nodesWrap) {
    if (secondary.length) {
      nodesWrap.hidden = false;
      if (secondaryLabel) secondaryLabel.hidden = false;
      nodesWrap.innerHTML = secondary
        .map(
          (story) => `<button type="button" class="news-story-node is-secondary" data-story-id="${esc(story.id)}" aria-selected="false">
        <span class="news-story-node__marker" aria-hidden="true"></span>
        <span class="news-story-node__title" data-story-node-title>${esc(story.live?.shortTitle || story.id)}</span>
      </button>`
        )
        .join("");
    } else {
      nodesWrap.hidden = true;
      nodesWrap.innerHTML = "";
      if (secondaryLabel) secondaryLabel.hidden = true;
    }
  }
}

/**
 * @param {HTMLElement} root
 */
export function bindNewsNarrative(root) {
  const wrap = root.querySelector(".news-narrative-hero");
  if (!wrap) return;

  const hero = wrap.querySelector(".news-narrative__hero");
  const heroContent = wrap.querySelector(".news-narrative__hero-content");
  const pulse = wrap.querySelector(".news-timeline__pulse");

  if (!hero || !heroContent) return;

  let primaryId = wrap.dataset.primaryStory || "inflation";
  let focusBtn = wrap.querySelector(".news-story-node.is-primary-focus");
  let secondaryNodes = [...wrap.querySelectorAll(".news-story-node.is-secondary[data-story-id]")];
  let allNodes = focusBtn ? [focusBtn, ...secondaryNodes] : secondaryNodes;

  const pulseLeft = (index, count) => {
    if (count <= 1) return 50;
    return 6 + (index / (count - 1)) * 88;
  };

  const refreshNodeRefs = () => {
    primaryId = wrap.dataset.primaryStory || primaryId;
    focusBtn = wrap.querySelector(".news-story-node.is-primary-focus");
    secondaryNodes = [...wrap.querySelectorAll(".news-story-node.is-secondary[data-story-id]")];
    allNodes = focusBtn ? [focusBtn, ...secondaryNodes] : secondaryNodes;
  };

  const applySnapshot = () => {
    const snap =
      window.dashboardNewsSnapshot ||
      (typeof window.getNewsStorySnapshot === "function"
        ? window.getNewsStorySnapshot()
        : null);
    if (!snap) return;

    const prevPrimary = wrap.dataset.primaryStory;
    rebuildNewsTimeline(wrap, snap);
    refreshNodeRefs();

    if (prevPrimary && prevPrimary !== snap.primaryStoryId && wrap.dataset.activeStory === prevPrimary) {
      const newPrimaryBtn = focusBtn;
      if (newPrimaryBtn) applyStory(newPrimaryBtn, "select");
    }

    if (typeof window.applyNewsSnapshotToDom === "function") {
      window.applyNewsSnapshotToDom(root, snap);
    }
  };

  const applyStory = (node, intent) => {
    const id = node?.dataset?.storyId || "";
    const snap = window.dashboardNewsSnapshot;
    const story =
      snap?.stories?.find((s) => s.id === id) ||
      snap?.allStories?.find((s) => s.id === id) ||
      (STORY_REGISTRY_BY_ID[id] ? { ...STORY_REGISTRY_BY_ID[id], live: {} } : null);
    if (!story) return;

    const isSelect = intent === "select";
    const isPrimaryStory = id === (snap?.primaryStoryId || primaryId);
    refreshNodeRefs();
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

    const heroGrid = wrap.querySelector(".news-narrative__hero-grid");
    const oldVisual = wrap.querySelector(".news-narrative__visual");
    if (heroGrid) {
      const visualHtml = renderNewsVisual(id);
      if (oldVisual) {
        oldVisual.outerHTML = visualHtml;
      } else {
        heroGrid.insertAdjacentHTML("beforeend", visualHtml);
      }
    }

    applySnapshot();

    hero.classList.remove("is-visible");
    requestAnimationFrame(() => hero.classList.add("is-visible"));
  };

  const onFocusClick = () => {
    refreshNodeRefs();
    if (focusBtn) applyStory(focusBtn, "select");
  };
  wrap._newsOnFocusClick = onFocusClick;

  const bindTimelineNodes = () => {
    refreshNodeRefs();
    if (focusBtn) {
      focusBtn.replaceWith(focusBtn.cloneNode(true));
      refreshNodeRefs();
      focusBtn?.addEventListener("click", onFocusClick);
    }
    secondaryNodes.forEach((node) => {
      node.addEventListener("pointerenter", () => applyStory(node, "preview"));
      node.addEventListener("focus", () => applyStory(node, "preview"));
      node.addEventListener("click", () => applyStory(node, "select"));
    });
  };

  bindTimelineNodes();

  wrap.addEventListener("pointerleave", () => {
    if (wrap.dataset.activeStory === primaryId) {
      wrap.classList.remove("has-focus");
    }
  });

  if (pulse) pulse.style.left = `${pulseLeft(0, Math.max(allNodes.length, 1))}%`;

  const onStoriesUpdated = (ev) => {
    if (ev.detail) {
      rebuildNewsTimeline(wrap, ev.detail);
      bindTimelineNodes();
      if (typeof window.applyNewsSnapshotToDom === "function") {
        window.applyNewsSnapshotToDom(root, ev.detail);
      }
    }
  };
  document.addEventListener("bt_news_stories_updated", onStoriesUpdated);

  if (typeof window.refreshNewsStoryState === "function") {
    window
      .refreshNewsStoryState({ refreshImpact: true, fetchOil: true })
      .then(() => {
        applySnapshot();
        bindTimelineNodes();
        refreshNodeRefs();
        if (focusBtn) applyStory(focusBtn, "select");
      })
      .catch(() => {});
  } else if (focusBtn) {
    applyStory(focusBtn, "select");
  }

  return () => {
    document.removeEventListener("bt_news_stories_updated", onStoriesUpdated);
  };
}
