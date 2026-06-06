/**
 * Concept 3 — Mission Path
 * @module design-lab/onboarding-tour/concepts/mission
 */

import {
  bindTourActions,
  bindTourKeys,
  highlightNav,
  positionSpotlight,
  setActivePage,
} from "../tour-utils.js";

const MISSION_SHORT = { dashboard: "Dashboard", logic: "Logic", discover: "Discover", intelligence: "Intelligence" };

export function initMission({ steps, root }) {
  let stepIndex = 0;
  let open = true;

  const pathHtml = steps
    .map(
      (s, i) => `
    <li class="c-mission__node" data-mission-node="${i}">
      <span class="c-mission__badge">${i + 1}</span>
      <span class="c-mission__node-label">${MISSION_SHORT[s.id] || s.title}</span>
      <span class="c-mission__node-state" data-node-state="${i}"></span>
    </li>`
    )
    .join('<li class="c-mission__connector" aria-hidden="true"></li>');

  root.innerHTML = `
    <div class="c-mission tour-layer is-open" data-tour-layer>
      <div class="c-mission__veil"></div>
      <div class="tour-spotlight tour-spotlight--pill" data-spotlight></div>
      <div class="c-mission__card ${window.innerWidth <= 640 ? "c-mission__card--sheet" : ""}">
        <span class="c-mission__kicker">Start your session</span>
        <h2 class="c-mission__title">Your 3-step path</h2>
        <ol class="c-mission__path">${pathHtml}</ol>
        <div class="c-mission__detail">
          <h3 class="tour-title" data-title></h3>
          <p class="tour-body" data-body></p>
        </div>
        <div class="c-mission__bar" aria-hidden="true"><span data-progress-bar></span></div>
        <div class="tour-actions">
          <button type="button" class="tour-btn tour-btn--skip" data-tour-skip>Skip</button>
          <button type="button" class="tour-btn tour-btn--primary" data-tour-next>Next</button>
        </div>
      </div>
    </div>`;

  const layer = root.querySelector("[data-tour-layer]");
  const spotlight = root.querySelector("[data-spotlight]");

  function updatePath(index) {
    steps.forEach((_, i) => {
      const node = root.querySelector(`[data-mission-node="${i}"]`);
      const state = root.querySelector(`[data-node-state="${i}"]`);
      node?.classList.toggle("is-active", i === index);
      node?.classList.toggle("is-done", i < index);
      if (state) {
        state.textContent = i < index ? "✓" : i === index ? "Now" : "";
      }
    });
    const bar = root.querySelector("[data-progress-bar]");
    if (bar) bar.style.width = `${((index + 1) / steps.length) * 100}%`;
  }

  function showStep(index) {
    const step = steps[index];
    if (!step) return;
    stepIndex = index;
    setActivePage(step.pageId, step.navId);
    updatePath(index);
    const target = document.getElementById(step.navId);
    if (!target) return;
    highlightNav(target, true);
    target.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
    requestAnimationFrame(() => {
      if (spotlight) positionSpotlight(spotlight, target.getBoundingClientRect(), step.pill);
      root.querySelector("[data-title]").textContent = step.title;
      root.querySelector("[data-body]").textContent = step.body;
      root.querySelector("[data-tour-next]").textContent =
        index === steps.length - 1 ? "Finish session" : "Next step";
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
