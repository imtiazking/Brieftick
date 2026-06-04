/**
 * Production Discover Stocks · Today's Market Story.
 * @module lib/discover-market-story
 */

import { mountRelationshipStory } from "/design-lab/move-together/story/relationship-story.js";
import { buildCustomRelationshipMeta } from "/design-lab/move-together/story/custom-relationship-meta.js";
import { DISCOVER_MARKET_THEMES } from "/lib/discover-market-themes.js";

const THEMES = DISCOVER_MARKET_THEMES;

export const SCANNER_SIGNAL_LABEL = "Signal strength";

/**
 * @param {number} score
 */
export function scannerSignalStrengthLabel(score) {
  const n = Number(score);
  if (n >= 90) return "Very strong";
  if (n >= 80) return "Strong";
  if (n >= 70) return "Worth watching";
  if (n >= 60) return "Early signal";
  return "Weak";
}

/**
 * @param {number} score
 */
export function scannerSignalStrengthClass(score) {
  const n = Number(score);
  if (n >= 90) return "scanner-signal-val--very-strong";
  if (n >= 80) return "scanner-signal-val--strong";
  if (n >= 70) return "scanner-signal-val--watch";
  if (n >= 60) return "scanner-signal-val--early";
  return "scanner-signal-val--weak";
}

let activeThemeId = "ai";
let highlightedSym = null;
let namesExpanded = false;

/** @type {ReturnType<typeof mountRelationshipStory> | null} */
let relStoryApi = null;

/**
 * @param {string | null} sym
 */
export function highlightScannerSymbol(sym) {
  highlightedSym = sym;
  document.querySelectorAll("#scannerGrid .scanner-card").forEach((card) => {
    card.classList.toggle(
      "scanner-card--story-highlight",
      Boolean(sym) && card.dataset.symbol === sym
    );
  });
  renderNamesSection();
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
  if (theme.id === "ai") {
    relationshipMeta.theme = "AI Infrastructure";
  }

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

/**
 * @param {string} sym
 */
function nameChipHtml(sym) {
  const hl = highlightedSym === sym ? " is-highlight" : "";
  return `<button type="button" class="dms-name-chip is-rel-link${hl}" data-sym="${sym}">${sym}</button>`;
}

function nameChipRow(syms) {
  return syms
    .map((sym, i) => {
      const sep = i < syms.length - 1 ? '<span class="dms-name-sep"> • </span>' : "";
      return `${nameChipHtml(sym)}${sep}`;
    })
    .join("");
}

function renderDefaultKeyNames() {
  const theme = THEMES[activeThemeId];
  const wrap = document.getElementById("dmsKeyNamesDefault");
  if (!wrap || !theme) return;
  wrap.innerHTML = `
    <span class="dms-key-names__label">Key names</span>
    ${nameChipRow(theme.keyNames.slice(0, 4))}`;
}

function renderExpandedNameGroups() {
  const theme = THEMES[activeThemeId];
  const wrap = document.getElementById("dmsNamesGroups");
  if (!wrap || !theme?.nameGroups) return;

  const groups = [
    { title: "Leaders", syms: theme.nameGroups.leaders },
    { title: "Emerging", syms: theme.nameGroups.emerging },
    { title: "Watchlist", syms: theme.nameGroups.watchlist },
  ];

  wrap.innerHTML = groups
    .map(
      (g) => `
    <div class="dms-name-group">
      <div class="dms-name-group__title">${g.title}</div>
      <div class="dms-name-group__chips">
        ${g.syms.map((sym) => nameChipHtml(sym)).join("")}
      </div>
    </div>`
    )
    .join("");
}

function syncNamesExpandUi() {
  const toggle = document.getElementById("dmsNamesToggle");
  const expanded = document.getElementById("dmsNamesExpanded");
  if (toggle) {
    toggle.textContent = namesExpanded ? "Show fewer names" : "Show more names";
    toggle.setAttribute("aria-expanded", String(namesExpanded));
  }
  if (expanded) expanded.hidden = !namesExpanded;
}

function renderNamesSection() {
  renderDefaultKeyNames();
  syncNamesExpandUi();
  if (namesExpanded) renderExpandedNameGroups();
}

function renderThemeChips() {
  const wrap = document.getElementById("dmsThemeChips");
  if (!wrap) return;
  wrap.innerHTML = Object.values(THEMES)
    .map(
      (t) =>
        `<button type="button" class="dms-theme-chip${t.id === activeThemeId ? " is-active" : ""}" data-theme="${t.id}">${t.chip}</button>`
    )
    .join("");
}

function fadeStoryUpdate(fn) {
  const panel = document.getElementById("dmsStory");
  if (!panel) {
    fn();
    return;
  }
  panel.classList.add("is-fading");
  setTimeout(() => {
    fn();
    panel.classList.remove("is-fading");
  }, 180);
}

function renderStory() {
  const theme = THEMES[activeThemeId];
  const title = document.getElementById("dmsThemeTitle");
  const body = document.getElementById("dmsStoryBody");
  const panel = document.getElementById("dmsStory");
  if (!theme || !title || !body) return;
  title.textContent = theme.title;
  body.textContent = theme.story;
  if (panel) panel.classList.add("is-theme-active");
}

function setTheme(themeId) {
  if (!THEMES[themeId] || themeId === activeThemeId) return;
  activeThemeId = themeId;
  highlightedSym = null;
  namesExpanded = false;
  fadeStoryUpdate(() => {
    renderStory();
    renderThemeChips();
    renderNamesSection();
    highlightScannerSymbol(null);
  });
}

function setHighlightedSym(sym) {
  highlightScannerSymbol(highlightedSym === sym ? null : sym);
}

function openRelPanel() {
  const theme = THEMES[activeThemeId];
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

function bindEvents() {
  document.getElementById("dmsThemeChips")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-theme]");
    if (btn) setTheme(btn.dataset.theme);
  });

  document.getElementById("dmsNames")?.addEventListener("click", (e) => {
    const symBtn = e.target.closest("[data-sym]");
    if (symBtn) setHighlightedSym(symBtn.dataset.sym);
  });

  document.getElementById("dmsNamesToggle")?.addEventListener("click", () => {
    namesExpanded = !namesExpanded;
    syncNamesExpandUi();
    if (namesExpanded) renderExpandedNameGroups();
  });

  document.getElementById("dmsExploreBtn")?.addEventListener("click", openRelPanel);
  document.getElementById("dmsRelClose")?.addEventListener("click", closeRelPanel);
  document.querySelector(".dms-rel-panel__backdrop")?.addEventListener("click", closeRelPanel);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeRelPanel();
  });
}

function init() {
  if (!document.getElementById("page-scanner")) return;
  renderThemeChips();
  renderStory();
  renderNamesSection();
  bindEvents();
}

if (typeof window !== "undefined") {
  window.scannerSignalStrengthLabel = scannerSignalStrengthLabel;
  window.scannerSignalStrengthClass = scannerSignalStrengthClass;
  window.SCANNER_SIGNAL_LABEL = SCANNER_SIGNAL_LABEL;
  window.highlightScannerSymbol = highlightScannerSymbol;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
}
