/**
 * Discover · story-led discovery feed (production).
 * @module lib/discover-market-story
 */

import { mountRelationshipStory } from "/design-lab/move-together/story/relationship-story.js";
import { buildCustomRelationshipMeta } from "/design-lab/move-together/story/custom-relationship-meta.js";
import { DISCOVER_MARKET_THEMES, discoverThemesSorted } from "/lib/discover-market-themes.js";

const THEMES = DISCOVER_MARKET_THEMES;

export const SCANNER_SIGNAL_LABEL = "Story strength";

let filterThemeId = "all";
let expandedThemeId = null;
let highlightedSym = null;

/** @type {ReturnType<typeof mountRelationshipStory> | null} */
let relStoryApi = null;

/**
 * @param {number} score
 */
export function scannerSignalStrengthLabel(score) {
  const n = Number(score);
  if (n >= 85) return "Very strong";
  if (n >= 75) return "Strong";
  if (n >= 65) return "Building";
  if (n >= 55) return "Early";
  return "Fragile";
}

/**
 * @param {number} score
 */
export function scannerSignalStrengthClass(score) {
  const n = Number(score);
  if (n >= 85) return "scanner-signal-val--very-strong";
  if (n >= 75) return "scanner-signal-val--strong";
  if (n >= 65) return "scanner-signal-val--watch";
  if (n >= 55) return "scanner-signal-val--early";
  return "scanner-signal-val--weak";
}

/**
 * @param {string | null} sym
 */
export function highlightScannerSymbol(sym) {
  highlightedSym = sym;
  document.querySelectorAll("#discoverStoryFeed .discover-ticker-chip").forEach((chip) => {
    chip.classList.toggle("is-highlight", Boolean(sym) && chip.dataset.sym === sym);
  });
  document.querySelectorAll("#scannerGrid .scanner-card").forEach((card) => {
    card.classList.toggle(
      "scanner-card--story-highlight",
      Boolean(sym) && card.dataset.symbol === sym
    );
  });
}

function esc(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function buildRelationshipEpisode(theme) {
  const relationshipMeta = buildCustomRelationshipMeta(
    theme.hero,
    theme.relatives,
    theme.symbolNames
  );
  relationshipMeta.theme = theme.chip;

  return {
    id: `theme-${theme.id}`,
    source: "custom",
    hero: theme.hero,
    relatives: theme.relatives,
    positions: theme.positions,
    pickerLabel: theme.hero,
    symbolNames: theme.symbolNames,
    relationshipMeta,
  };
}

function exposedTickers(theme) {
  const seen = new Set();
  const out = [];
  for (const sym of [
    ...theme.keyNames,
    ...(theme.nameGroups?.emerging ?? []),
    ...(theme.nameGroups?.watchlist ?? []),
  ]) {
    if (!seen.has(sym)) {
      seen.add(sym);
      out.push(sym);
    }
  }
  return out.slice(0, 8);
}

function storyCardHtml(theme) {
  const n = theme.narrative;
  const strength = n?.strength ?? 60;
  const strengthLabel = scannerSignalStrengthLabel(strength);
  const strengthClass = scannerSignalStrengthClass(strength);
  const tickers = exposedTickers(theme);
  const isExpanded = expandedThemeId === theme.id;

  return `
    <article class="discover-story-card${isExpanded ? " is-expanded" : ""}" data-theme="${theme.id}" id="discover-story-${theme.id}">
      <p class="discover-story-card__theme">${esc(theme.chip)}</p>
      <h2 class="discover-story-card__headline">${esc(theme.title)}</h2>
      <div class="discover-story-card__qa">
        <div>
          <p class="discover-story-card__q">What is happening?</p>
          <p class="discover-story-card__a">${esc(n?.what)}</p>
        </div>
        <div>
          <p class="discover-story-card__q">Why is it happening?</p>
          <p class="discover-story-card__a">${esc(n?.why)}</p>
        </div>
        <div>
          <p class="discover-story-card__q">How strong is the story?</p>
          <div class="discover-story-card__strength">
            <span class="discover-story-card__strength-val scanner-signal-val ${strengthClass}">${strengthLabel}</span>
            <div class="discover-story-card__strength-track" aria-hidden="true">
              <div class="discover-story-card__strength-fill" style="width:${strength}%"></div>
            </div>
          </div>
        </div>
        <div>
          <p class="discover-story-card__q">What could change the story?</p>
          <p class="discover-story-card__a">${esc(n?.watch)}</p>
        </div>
        <div>
          <p class="discover-story-card__q">Which stocks are exposed?</p>
          <div class="discover-story-card__tickers" role="list">
            ${tickers
              .map((sym) => {
                const hl = highlightedSym === sym ? " is-highlight" : "";
                const label = theme.symbolNames?.[sym] ?? sym;
                return `<button type="button" class="discover-ticker-chip${hl}" data-sym="${sym}" data-theme="${theme.id}" title="${esc(label)}" role="listitem">${sym}</button>`;
              })
              .join("")}
          </div>
        </div>
      </div>
      <div class="discover-story-card__actions">
        <button type="button" class="discover-story-card__btn discover-story-card__btn--gold" data-action="explore" data-theme="${theme.id}">Explore story</button>
        <button type="button" class="discover-story-card__btn" data-action="movers" data-theme="${theme.id}">See today's movers</button>
      </div>
    </article>`;
}

function renderThemeChips() {
  const wrap = document.getElementById("discoverThemeChips");
  if (!wrap) return;
  const chips = [
    `<button type="button" class="discover-theme-chip${filterThemeId === "all" ? " is-active" : ""}" data-theme="all">All stories</button>`,
    ...Object.values(THEMES).map(
      (t) =>
        `<button type="button" class="discover-theme-chip${filterThemeId === t.id ? " is-active" : ""}" data-theme="${t.id}">${esc(t.chip)}</button>`
    ),
  ];
  wrap.innerHTML = chips.join("");
}

function themesForFeed() {
  const sorted = discoverThemesSorted();
  if (filterThemeId === "all") return sorted;
  const one = THEMES[filterThemeId];
  return one ? [one] : sorted;
}

function renderFeed() {
  const feed = document.getElementById("discoverStoryFeed");
  if (!feed) return;
  const themes = themesForFeed();
  feed.innerHTML = themes.map((t) => storyCardHtml(t)).join("");
}

function setFilter(themeId) {
  filterThemeId = themeId;
  if (themeId !== "all") expandedThemeId = themeId;
  renderThemeChips();
  renderFeed();
}

function openRelPanel(themeId) {
  const theme = THEMES[themeId];
  const panel = document.getElementById("dmsRelPanel");
  const mount = document.getElementById("dmsRelMount");
  const label = document.getElementById("dmsRelThemeLabel");
  if (!panel || !mount || !theme) return;
  if (label) label.textContent = theme.chip;

  const episode = buildRelationshipEpisode(theme);
  if (!relStoryApi) {
    relStoryApi = mountRelationshipStory(mount, {
      layout: "embed",
      episodes: [episode],
      defaultEpisode: 0,
      hidePicker: true,
    });
  } else {
    relStoryApi.setEpisodes([episode], { playIndex: 0, force: true });
  }

  panel.hidden = false;
  requestAnimationFrame(() => panel.classList.add("is-open"));
  document.body.style.overflow = "hidden";
}

function closeRelPanel() {
  const panel = document.getElementById("dmsRelPanel");
  if (!panel) return;
  panel.classList.remove("is-open");
  document.body.style.overflow = "";
  setTimeout(() => {
    if (!panel.classList.contains("is-open")) panel.hidden = true;
  }, 400);
}

function scrollToScanner(themeId) {
  const theme = THEMES[themeId];
  if (!theme) return;

  expandedThemeId = themeId;
  window.__discoverActiveTheme = theme;

  const refine = document.getElementById("discoverScanRefine");
  if (refine && !refine.open) refine.open = true;

  const section = document.getElementById("discoverScanRefine");
  section?.scrollIntoView({ behavior: "smooth", block: "start" });

  if (typeof window.runScanner === "function") {
    window.runScanner();
  }

  setTimeout(() => {
    for (const sym of theme.keyNames) {
      if (document.querySelector(`#scannerGrid .scanner-card[data-symbol="${sym}"]`)) {
        highlightScannerSymbol(sym);
        document
          .querySelector(`#scannerGrid .scanner-card[data-symbol="${sym}"]`)
          ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        break;
      }
    }
  }, 800);
}

function bindEvents() {
  document.getElementById("discoverThemeChips")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-theme]");
    if (btn) setFilter(btn.dataset.theme);
  });

  document.getElementById("discoverStoryFeed")?.addEventListener("click", (e) => {
    const symBtn = e.target.closest("[data-sym]");
    if (symBtn) {
      highlightScannerSymbol(
        highlightedSym === symBtn.dataset.sym ? null : symBtn.dataset.sym
      );
      return;
    }

    const explore = e.target.closest('[data-action="explore"]');
    if (explore) {
      openRelPanel(explore.dataset.theme);
      return;
    }

    const movers = e.target.closest('[data-action="movers"]');
    if (movers) scrollToScanner(movers.dataset.theme);
  });

  document.getElementById("dmsRelClose")?.addEventListener("click", closeRelPanel);
  document.querySelector(".dms-rel-panel__backdrop")?.addEventListener("click", closeRelPanel);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeRelPanel();
  });
}

function init() {
  if (!document.getElementById("page-scanner")) return;
  renderThemeChips();
  renderFeed();
  bindEvents();
}

if (typeof window !== "undefined") {
  window.scannerSignalStrengthLabel = scannerSignalStrengthLabel;
  window.scannerSignalStrengthClass = scannerSignalStrengthClass;
  window.SCANNER_SIGNAL_LABEL = SCANNER_SIGNAL_LABEL;
  window.highlightScannerSymbol = highlightScannerSymbol;
  window.DiscoverMarketStory = { setFilter, renderFeed, THEMES };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
}
