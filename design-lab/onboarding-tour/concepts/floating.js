/**
 * Concept 5 — Floating Assistant
 * @module design-lab/onboarding-tour/concepts/floating
 */

import {
  bindTourActions,
  bindTourKeys,
  highlightNav,
  renderDots,
  setActivePage,
} from "../tour-utils.js";

export function initFloating({ steps, root }) {
  let stepIndex = 0;
  let open = true;
  let expanded = false;

  root.innerHTML = `
    <div class="c-float tour-layer is-open" data-tour-layer>
      <div class="c-float__veil c-float__veil--light"></div>
      <button type="button" class="c-float__bubble" data-bubble aria-expanded="false" aria-label="Open tour assistant">
        <span class="c-float__bubble-icon" aria-hidden="true">✦</span>
        <span class="c-float__bubble-pulse" aria-hidden="true"></span>
      </button>
      <div class="c-float__panel" data-panel hidden>
        <button type="button" class="c-float__close" data-tour-close aria-label="Close tour">×</button>
        <div class="tour-progress">
          <div class="tour-dots" data-dots></div>
          <span class="tour-step-label" data-step-label></span>
        </div>
        <h2 class="tour-title" data-title></h2>
        <p class="tour-body" data-body></p>
        <div class="tour-actions tour-actions--compact">
          <button type="button" class="tour-btn tour-btn--ghost" data-tour-skip>Skip</button>
          <button type="button" class="tour-btn tour-btn--primary" data-tour-next>Next</button>
        </div>
      </div>
    </div>`;

  const layer = root.querySelector("[data-tour-layer]");
  const bubble = root.querySelector("[data-bubble]");
  const panel = root.querySelector("[data-panel]");

  function setExpanded(on) {
    expanded = on;
    panel?.toggleAttribute("hidden", !on);
    bubble?.setAttribute("aria-expanded", String(on));
    bubble?.classList.toggle("is-open", on);
  }

  function showStep(index) {
    const step = steps[index];
    if (!step) return;
    stepIndex = index;
    setActivePage(step.pageId, step.navId);
    const target = document.getElementById(step.navId);
    highlightNav(target, true);
    target?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
    root.querySelector("[data-title]").textContent = step.title;
    root.querySelector("[data-body]").textContent = step.body;
    renderDots(root.querySelector("[data-dots]"), steps.length, index);
    root.querySelector("[data-step-label]").textContent = `${index + 1}/${steps.length}`;
    root.querySelector("[data-tour-next]").textContent =
      index === steps.length - 1 ? "Finish" : "Next";
    if (!expanded) setExpanded(true);
  }

  function close() {
    open = false;
    layer?.classList.remove("is-open");
    highlightNav(null, false);
    setExpanded(false);
  }

  function onNext() {
    if (stepIndex >= steps.length - 1) {
      close();
      document.getElementById("tourFinishBanner")?.classList.add("is-visible");
      return;
    }
    showStep(stepIndex + 1);
  }

  bubble?.addEventListener("click", () => setExpanded(!expanded));
  bindTourActions(root, { onSkip: close, onNext, onRestart: () => showStep(0) });
  const unbindKeys = bindTourKeys((action) => {
    if (!open) return;
    if (action === "skip") close();
    if (action === "next") onNext();
  });

  showStep(0);
  setExpanded(true);

  return () => {
    unbindKeys();
    root.innerHTML = "";
  };
}
