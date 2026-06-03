import {
  DEFAULT_EPISODES,
  mountRelationshipStory,
} from "/design-lab/move-together/story/relationship-story.js";
import { initPortfolioRelationshipCustomGroup } from "/lib/portfolio-relationship-custom-group.js";

const ADVANCED_OPEN_KEY = "brieftick_portfolio_preview_advanced_open";

/** @type {import('/design-lab/portfolio-relationship-story/relationship-tickers.js').RelationshipEpisode | null} */
let customEpisode = null;

/** @type {ReturnType<typeof mountRelationshipStory> | null} */
let storyApi = null;

function mergeEpisodes() {
  const presets = DEFAULT_EPISODES.map((ep) => ({ ...ep, source: ep.source || "preset" }));
  return customEpisode ? [...presets, customEpisode] : presets;
}

function updateRelationshipBadge(isCustom) {
  const badge = document.getElementById("prRelationshipBadge");
  if (!badge) return;
  badge.textContent = isCustom
    ? "Custom preview · illustrative relationship data"
    : "Preview only · illustrative relationship data";
}

function initAdvancedToggle() {
  const toggle = document.getElementById("portAdvancedToggle");
  const panel = document.getElementById("portAdvancedPanel");
  const section = document.querySelector(".port-section--advanced");
  if (!toggle || !panel || !section) return;

  const stored = sessionStorage.getItem(ADVANCED_OPEN_KEY);
  const open = stored === null ? false : stored === "1";

  function setOpen(next) {
    toggle.setAttribute("aria-expanded", String(next));
    panel.hidden = !next;
    section.classList.toggle("is-open", next);
    sessionStorage.setItem(ADVANCED_OPEN_KEY, next ? "1" : "0");
  }

  setOpen(open);

  toggle.addEventListener("click", () => {
    setOpen(toggle.getAttribute("aria-expanded") !== "true");
  });
}

function initRelationshipStory() {
  const mount = document.getElementById("relationshipStoryMount");
  if (!mount) return;

  storyApi = mountRelationshipStory(mount, {
    layout: "embed",
    defaultEpisode: 0,
    episodes: mergeEpisodes(),
    onEpisodeChange: (episode) => {
      updateRelationshipBadge(episode?.source === "custom");
    },
  });

  initPortfolioRelationshipCustomGroup({
    getStoryApi: () => storyApi,
    mergeEpisodes,
    setCustomEpisode: (ep) => {
      customEpisode = ep;
    },
    onCustomEpisode: () => {
      updateRelationshipBadge(true);
    },
  });
}

initAdvancedToggle();
initRelationshipStory();
