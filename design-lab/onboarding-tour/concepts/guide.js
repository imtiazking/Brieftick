/**
 * Concept 4 — Market Guide
 * @module design-lab/onboarding-tour/concepts/guide
 */

import {
  bindTourActions,
  bindTourKeys,
  highlightNav,
  isMobile,
  positionSpotlight,
  renderDots,
  setActivePage,
} from "../tour-utils.js";

const GUIDE_FRAMES = ["Read the market", "Ask the market", "Find the story"];

export function initGuide({ steps, root }) {
  let stepIndex = 0;
  let open = true;

  root.innerHTML = `
    <div class="c-guide tour-layer is-open" data-tour-layer>
      <div class="c-guide__veil"></div>
      <div class="tour-spotlight tour-spotlight--pill" data-spotlight></div>
      <div class="c-guide__card ${isMobile() ? "c-guide__card--sheet" : ""}" data-card>
        <header class="c-guide__header">
          <span class="c-guide__seal">Market Guide</span>
          <span class="c-guide__frame" data-frame></span>
        </header>
        <div class="tour-progress">
          <div class="tour-dots tour-dots--line" data-dots></div>
          <span class="tour-step-label" data-step-label></span>
        </div>
        <h2 class="tour-title c-guide__title" data-title></h2>
        <p class="tour-body" data-body></p>
        <div class="tour-actions">
          <button type="button" class="tour-btn tour-btn--skip" data-tour-skip>Skip</button>
          <button type="button" class="tour-btn tour-btn--primary c-guide__cta" data-tour-next>Continue</button>
        </div>
      </div>
    </div>`;

  const layer = root.querySelector("[data-tour-layer]");
  const spotlight = root.querySelector("[data-spotlight]");
  const card = root.querySelector("[data-card]");

  function positionCard(box) {
    if (!card || isMobile()) {
      card?.classList.add("c-guide__card--sheet");
      return;
    }
    card.classList.remove("c-guide__card--sheet");
    const gap = 16;
    const margin = 16;
    const cardRect = card.getBoundingClientRect();
    let top = box.top + box.height + gap;
    if (top + cardRect.height > window.innerHeight - margin) {
      top = Math.max(margin, box.top - cardRect.height - gap);
    }
    let left = Math.max(margin, box.left + box.width / 2 - cardRect.width / 2);
    left = Math.min(left, window.innerWidth - cardRect.width - margin);
    card.style.top = `${top}px`;
    card.style.left = `${left}px`;
  }

  function showStep(index) {
    const step = steps[index];
    if (!step) return;
    stepIndex = index;
    setActivePage(step.pageId, step.navId);
    const target = document.getElementById(step.navId);
    if (!target) return;
    highlightNav(target, true);
    target.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
    requestAnimationFrame(() => {
      const box = spotlight
        ? positionSpotlight(spotlight, target.getBoundingClientRect(), step.pill)
        : null;
      root.querySelector("[data-frame]").textContent = GUIDE_FRAMES[index] || "";
      root.querySelector("[data-title]").textContent = step.title;
      root.querySelector("[data-body]").textContent = step.body;
      renderDots(root.querySelector("[data-dots]"), steps.length, index);
      root.querySelector("[data-step-label]").textContent = `${index + 1} / ${steps.length}`;
      root.querySelector("[data-tour-next]").textContent =
        index === steps.length - 1 ? "Finish" : "Continue";
      if (box) requestAnimationFrame(() => positionCard(box));
    });
  }

  function close() {
    open = false;
    layer?.classList.remove("is-open");
    highlightNav(null, false);
  }

  function onNext() {
    if (stepIndex >= steps.length - 1) {
      close();
      document.getElementById("tourFinishBanner")?.classList.add("is-visible");
      return;
    }
    showStep(stepIndex + 1);
  }

  bindTourActions(root, { onSkip: close, onNext, onRestart: () => showStep(0) });
  const unbindKeys = bindTourKeys((action) => {
    if (!open) return;
    if (action === "skip") close();
    if (action === "next") onNext();
  });
  const onResize = () => open && showStep(stepIndex);
  window.addEventListener("resize", onResize);
  showStep(0);

  return () => {
    unbindKeys();
    window.removeEventListener("resize", onResize);
    root.innerHTML = "";
  };
}
