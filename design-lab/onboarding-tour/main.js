/**
 * Onboarding philosophy lab — five distinct experiences
 * @module design-lab/onboarding-tour/main
 */

import { getSteps } from "./shared-steps.js";
import { applyStepThreeNav } from "./tour-utils.js";
import { initMission } from "./concepts/mission.js";
import { initBriefing } from "./concepts/briefing.js";
import { initCopilot } from "./concepts/copilot.js";
import { initQuest } from "./concepts/quest.js";
import { initAnalyst } from "./concepts/analyst.js";

/** @type {Record<string, { id: string, label: string, init: Function, mode: string }>} */
const CONCEPTS = {
  mission: {
    id: "mission",
    label: "Mission Path",
    mode: "immersive",
    init: initMission,
  },
  briefing: {
    id: "briefing",
    label: "Morning Briefing",
    mode: "immersive",
    init: initBriefing,
  },
  copilot: {
    id: "copilot",
    label: "AI Co-Pilot",
    mode: "immersive",
    init: initCopilot,
  },
  quest: {
    id: "quest",
    label: "Quest",
    mode: "immersive",
    init: initQuest,
  },
  analyst: {
    id: "analyst",
    label: "Market Analyst",
    mode: "ambient",
    init: initAnalyst,
  },
};

const CONCEPT_ORDER = ["mission", "briefing", "copilot", "quest", "analyst"];

let activeConcept = "mission";
let stepThreeVariant = "discover";
/** @type {(() => void) | null} */
let destroyTour = null;

const root = document.getElementById("tourRoot");
const tabs = document.getElementById("conceptTabs");
const restartBtn = document.getElementById("tourRestart");
const variantDiscover = document.getElementById("variantDiscover");
const variantIntel = document.getElementById("variantIntelligence");
const finishBanner = document.getElementById("tourFinishBanner");
const mockApp = document.getElementById("mockApp");

function readHashConcept() {
  const hash = window.location.hash.replace(/^#/, "");
  return CONCEPTS[hash] ? hash : null;
}

function setHashConcept(id) {
  const url = new URL(window.location.href);
  url.hash = id;
  history.replaceState(null, "", url);
}

function mountConcept(id) {
  if (destroyTour) {
    destroyTour();
    destroyTour = null;
  }
  finishBanner?.classList.remove("is-visible");

  activeConcept = id;
  const concept = CONCEPTS[id];
  if (!concept || !root) return;

  applyStepThreeNav(stepThreeVariant);
  const steps = getSteps(stepThreeVariant);

  document.body.dataset.concept = id;
  document.body.dataset.conceptMode = concept.mode;
  mockApp?.classList.toggle("is-ambient", concept.mode === "ambient");

  document.querySelectorAll("[data-concept-tab]").forEach((tab) => {
    tab.classList.toggle("is-active", tab.dataset.conceptTab === id);
  });

  destroyTour = concept.init({ steps, root, stepThreeVariant });
  setHashConcept(id);
}

function setStepThreeVariant(variant) {
  stepThreeVariant = variant;
  variantDiscover?.classList.toggle("is-active", variant === "discover");
  variantIntel?.classList.toggle("is-active", variant === "intelligence");
  mountConcept(activeConcept);
}

function buildTabs() {
  if (!tabs) return;
  tabs.innerHTML = CONCEPT_ORDER.map(
    (id) =>
      `<button type="button" class="concept-tab" data-concept-tab="${id}">${CONCEPTS[id].label}</button>`
  ).join("");

  tabs.querySelectorAll("[data-concept-tab]").forEach((btn) => {
    btn.addEventListener("click", () => mountConcept(btn.dataset.conceptTab));
  });
}

buildTabs();
restartBtn?.addEventListener("click", () => mountConcept(activeConcept));
variantDiscover?.addEventListener("click", () => setStepThreeVariant("discover"));
variantIntel?.addEventListener("click", () => setStepThreeVariant("intelligence"));
finishBanner?.querySelector("button")?.addEventListener("click", () => {
  finishBanner.classList.remove("is-visible");
});

document.querySelectorAll(".mock-nav__link").forEach((link) => {
  link.addEventListener("click", () => {
    if (destroyTour && document.body.dataset.conceptMode !== "ambient") return;
    const pageId = link.dataset.page;
    if (!pageId) return;
    document.querySelectorAll(".mock-page").forEach((p) => {
      p.classList.toggle("is-active", p.id === pageId);
    });
    document.querySelectorAll(".mock-nav__link").forEach((l) => {
      l.classList.toggle("is-active", l === link);
    });
  });
});

const initialConcept = readHashConcept() || "mission";
mountConcept(initialConcept);

window.addEventListener("hashchange", () => {
  const id = readHashConcept();
  if (id && id !== activeConcept) mountConcept(id);
});
