/**
 * What Matters wheel module — live card render + hydration.
 * @module lib/what-matters-ui
 */

import { applyBadge } from "/lib/live-data-badge.js";
import {
  fetchWhatMattersFeed,
  formatRefreshedAt,
} from "/lib/what-matters-feed.js";
import { bindInteractiveCharts } from "/preview/dashboard-intel-charts.js";

const SOURCE_LABEL = "Live · FRED / Finnhub";
const EMPTY_MESSAGE = "No major live market events found for this window.";

/**
 * @param {import('/lib/what-matters-feed.js').WhatMattersImportance} level
 */
function importanceLabel(level) {
  if (level === "high") return "High";
  if (level === "medium") return "Medium";
  return "Low";
}

/**
 * @param {string} s
 */
function esc(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * @param {import('/lib/what-matters-feed.js').WhatMattersCard} card
 * @param {number} index
 */
export function renderWhatMattersCard(card, index) {
  const imp = card.importance;
  const impactTags = card.impact
    .map((tag) => `<span class="alert-impact-tag">${esc(tag)}</span>`)
    .join("");
  const tier = index === 0 ? " alert-visual--primary is-active" : "";
  return `<div class="alert-visual${tier}" role="button" tabindex="0" data-alert-id="${esc(card.id)}" data-card-source="${esc(card.source)}">
    <span class="alert-visual__type">${esc(card.type)}</span>
    <div class="alert-visual__body">
      <time class="alert-visual__date" datetime="${esc(card.dateIso)}">${esc(card.dateLabel)}</time>
      <span class="alert-visual__head">${esc(card.event)}</span>
      <p class="alert-visual__why"><span class="alert-visual__label">Why it matters:</span> ${esc(card.why)}</p>
      <div class="alert-visual__impacts">
        <span class="alert-visual__label">Potential impact:</span>
        ${impactTags}
      </div>
      <p class="alert-visual__importance-row">
        <span class="alert-visual__label">Importance:</span>
        <span class="alert-visual__importance alert-visual__importance--${imp}">${esc(importanceLabel(imp))}</span>
      </p>
      <p class="alert-visual__source-row">
        <span class="alert-visual__label">Source:</span>
        <span class="alert-visual__source">${esc(card.source)}</span>
      </p>
      <button type="button" class="alert-visual__toggle" aria-expanded="false">Learn more</button>
      <div class="alert-visual__expand" hidden><p>${esc(card.explain)}</p></div>
    </div>
  </div>`;
}

/**
 * @param {import('/lib/what-matters-feed.js').WhatMattersCard[]} cards
 */
export function renderWhatMattersStack(cards) {
  if (!cards.length) {
    return `<p class="what-matters__empty" data-what-matters-empty>${esc(EMPTY_MESSAGE)}</p>`;
  }
  return cards.map((c, i) => renderWhatMattersCard(c, i)).join("");
}

/**
 * @param {import('/lib/what-matters-feed.js').WhatMattersCard[]} cards
 */
function buildTakeaway(cards) {
  if (!cards.length) return EMPTY_MESSAGE;
  const top = cards[0];
  return `${top.dateLabel} — ${top.event}. ${top.why}`;
}

/**
 * @param {HTMLElement | null} root
 * @param {{ cards: import('/lib/what-matters-feed.js').WhatMattersCard[], refreshedAt: string, empty: boolean }} feed
 */
export function applyWhatMattersFeed(root, feed) {
  if (!root) return;

  const stack = root.querySelector("[data-what-matters-stack]");
  const refreshedEl = root.querySelector("[data-what-matters-refreshed]");
  const sourceEl = root.querySelector("[data-what-matters-source]");
  const takeaway = root.querySelector(".intel-takeaway");
  const meta = root.querySelector(".rail-module__meta");

  if (stack) {
    stack.innerHTML = renderWhatMattersStack(feed.cards);
  }
  if (refreshedEl) {
    refreshedEl.textContent = `Updated ${formatRefreshedAt(feed.refreshedAt)}`;
    refreshedEl.dataset.refreshedAt = feed.refreshedAt;
  }
  if (sourceEl) sourceEl.textContent = SOURCE_LABEL;
  if (takeaway) takeaway.textContent = buildTakeaway(feed.cards);
  if (meta) meta.textContent = SOURCE_LABEL;

  const badge = root.querySelector("[data-dash-live-badge]");
  if (badge) {
    applyBadge(
      badge,
      feed.empty ? "mixed" : "live",
      feed.empty ? "No calendar events in window" : `${feed.cards.length} live events`
    );
  }

  const hero = root.querySelector(".alerts-stack-hero");
  if (hero) {
    bindInteractiveCharts(root, "alerts");
  }
}

/**
 * @param {HTMLElement | null} root
 */
export async function hydrateWhatMatters(root) {
  if (!root) return null;
  const stack = root.querySelector("[data-what-matters-stack]");
  if (stack && !stack.querySelector(".alert-visual")) {
    stack.innerHTML =
      '<p class="what-matters__loading">Loading live market calendar…</p>';
  }

  try {
    const feed = await fetchWhatMattersFeed({ limit: 5 });
    if (typeof window !== "undefined") {
      window.whatMattersFeed = feed;
    }
    applyWhatMattersFeed(root, feed);
    return feed;
  } catch (e) {
    console.warn("[what-matters] hydrate failed:", e.message);
    const feed = {
      cards: [],
      refreshedAt: new Date().toISOString(),
      empty: true,
    };
    applyWhatMattersFeed(root, feed);
    return feed;
  }
}
