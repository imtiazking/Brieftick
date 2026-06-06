/**
 * Onboarding tour concept lab — orchestrator
 * @module design-lab/onboarding-tour/main
 */

import { getSteps } from "./shared-steps.js";
import { applyStepThreeNav } from "./tour-utils.js";
import { initSpotlight } from "./concepts/spotlight.js";
import { initCommand } from "./concepts/command.js";
import { initMission } from "./concepts/mission.js";
import { initGuide } from "./concepts/guide.js";
import { initFloating } from "./concepts/floating.js";

/** @type {Record<string, { id: string, label: string, copy: 'default' | 'market', init: Function }>} */
const CONCEPTS = {
  spotlight: {
    id: "spotlight",
    label: "Spotlight Classic",
    copy: "default",
    init: initSpotlight,
  },
  command: {
    id: "command",
    label: "Command Coach",
    copy: "default",
    init: initCommand,
  },
  mission: {
    id: "mission",
    label: "Mission Path",
    copy: "default",
    init: initMission,
  },
  guide: {
    id: "guide",
    label: "Market Guide",
    copy: "market",
    init: initGuide,
  },
  floating: {
    id: "floating",
    label: "Floating Assistant",
    copy: "default",
    init: initFloating,
  },
};

const CONCEPT_ORDER = ["spotlight", "command", "mission", "guide", "floating"];

let activeConcept = "spotlight";
let stepThreeVariant = "discover";
/** @type {(() => void) | null} */
let destroyTour = null;

const root = document.getElementById("tourRoot");
const tabs = document.getElementById("conceptTabs");
const restartBtn = document.getElementById("tourRestart");
const variantDiscover = document.getElementById("variantDiscover");
const variantIntel = document.getElementById("variantIntelligence");
const finishBanner = document.getElementById("tourFinishBanner");

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
  const steps = getSteps(concept.copy, stepThreeVariant);

  document.querySelectorAll("[data-concept-tab]").forEach((tab) => {
    tab.classList.toggle("is-active", tab.dataset.conceptTab === id);
  });

  destroyTour = concept.init({ steps, root });
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
    if (destroyTour) return;
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

const initialConcept = readHashConcept() || "spotlight";
mountConcept(initialConcept);

window.addEventListener("hashchange", () => {
  const id = readHashConcept();
  if (id && id !== activeConcept) mountConcept(id);
});
