/**
 * Concept 1 — Spotlight Classic
 * @module design-lab/onboarding-tour/concepts/spotlight
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

/**
 * @param {object} opts
 * @param {import('../shared-steps.js').TourStep[]} opts.steps
 * @param {HTMLElement} opts.root
 */
export function initSpotlight({ steps, root }) {
  let stepIndex = 0;
  let open = true;

  root.innerHTML = `
    <div class="c-spotlight tour-layer is-open" data-tour-layer>
      <div class="tour-spotlight tour-spotlight--pill" data-spotlight></div>
      <div class="tour-arrow" data-arrow></div>
      <div class="tour-card" data-card>
        <div class="tour-progress">
          <div class="tour-dots" data-dots></div>
          <span class="tour-step-label" data-step-label></span>
        </div>
        <h2 class="tour-title" data-title></h2>
        <p class="tour-body" data-body></p>
        <div class="tour-actions">
          <button type="button" class="tour-btn tour-btn--skip" data-tour-skip>Skip tour</button>
          <button type="button" class="tour-btn tour-btn--primary" data-tour-next>Next</button>
        </div>
      </div>
    </div>`;

  const layer = root.querySelector("[data-tour-layer]");
  const spotlight = root.querySelector("[data-spotlight]");
  const arrow = root.querySelector("[data-arrow]");
  const card = root.querySelector("[data-card]");

  function positionCard(box) {
    if (!card || !arrow) return;
    const gap = 14;
    const margin = 12;
    card.classList.remove("tour-card--sheet");

    if (isMobile()) {
      card.classList.add("tour-card--sheet");
      arrow.classList.add("is-hidden");
      return;
    }

    arrow.classList.remove("is-hidden");
    const cardRect = card.getBoundingClientRect();
    const vh = window.innerHeight;
    let top = box.top + box.height + gap;
    if (top + cardRect.height > vh - margin) {
      top = Math.max(margin, box.top - cardRect.height - gap);
    }
    let left = box.left + box.width / 2 - cardRect.width / 2;
    left = Math.max(margin, Math.min(left, window.innerWidth - cardRect.width - margin));
    card.style.top = `${top}px`;
    card.style.left = `${left}px`;
    arrow.style.top = `${top - 9}px`;
    arrow.style.left = `${box.left + box.width / 2 - 9}px`;
  }

  function showStep(index) {
    const step = steps[index];
    if (!step || !spotlight) return;
    stepIndex = index;
    setActivePage(step.pageId, step.navId);
    const target = document.getElementById(step.navId);
    if (!target) return;
    highlightNav(target, true);
    target.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });

    requestAnimationFrame(() => {
      const box = positionSpotlight(spotlight, target.getBoundingClientRect(), step.pill);
      root.querySelector("[data-title]").textContent = step.title;
      root.querySelector("[data-body]").textContent = step.body;
      renderDots(root.querySelector("[data-dots]"), steps.length, index);
      root.querySelector("[data-step-label]").textContent = `Step ${index + 1} of ${steps.length}`;
      root.querySelector("[data-tour-next]").textContent =
        index === steps.length - 1 ? "Finish" : "Next";
      requestAnimationFrame(() => positionCard(box));
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
