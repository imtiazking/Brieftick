/**
 * Concept 2 — Command Coach
 * @module design-lab/onboarding-tour/concepts/command
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

export function initCommand({ steps, root }) {
  let stepIndex = 0;
  let open = true;

  root.innerHTML = `
    <div class="c-command tour-layer is-open" data-tour-layer>
      <div class="c-command__veil" aria-hidden="true"></div>
      <div class="tour-spotlight tour-spotlight--soft tour-spotlight--pill" data-spotlight></div>
      <aside class="c-command__panel ${isMobile() ? "c-command__panel--sheet" : ""}" data-panel>
        <header class="c-command__head">
          <div class="c-command__avatar" aria-hidden="true">B</div>
          <div>
            <span class="c-command__kicker">Brieftick Coach</span>
            <span class="c-command__status">Guided setup · <span data-step-label>1 of 3</span></span>
          </div>
        </header>
        <div class="tour-progress">
          <div class="tour-dots" data-dots></div>
        </div>
        <h2 class="tour-title" data-title></h2>
        <p class="tour-body" data-body></p>
        <div class="tour-actions tour-actions--stack">
          <button type="button" class="tour-btn tour-btn--primary" data-tour-next>Next</button>
          <button type="button" class="tour-btn tour-btn--ghost" data-tour-skip>Skip tour</button>
        </div>
      </aside>
    </div>`;

  const layer = root.querySelector("[data-tour-layer]");
  const spotlight = root.querySelector("[data-spotlight]");

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
      if (spotlight) positionSpotlight(spotlight, target.getBoundingClientRect(), step.pill);
      root.querySelector("[data-title]").textContent = step.title;
      root.querySelector("[data-body]").textContent = step.body;
      renderDots(root.querySelector("[data-dots]"), steps.length, index);
      root.querySelector("[data-step-label]").textContent = `${index + 1} of ${steps.length}`;
      root.querySelector("[data-tour-next]").textContent =
        index === steps.length - 1 ? "Finish" : "Next";
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
