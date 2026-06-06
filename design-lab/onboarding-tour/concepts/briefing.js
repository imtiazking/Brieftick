/**
 * Concept 2 — Bloomberg-style Morning Briefing
 * Psychology: terminal authority · read-through · professional rhythm
 * @module design-lab/onboarding-tour/concepts/briefing
 */

import { getBriefingSections } from "../shared-steps.js";
import { setActivePage } from "../tour-utils.js";

export function initBriefing({ steps, root, stepThreeVariant = "discover" }) {
  const sections = getBriefingSections(stepThreeVariant);
  let index = 0;
  let open = true;

  root.innerHTML = `
    <div class="phil briefing" data-layer>
      <div class="briefing__terminal">
        <header class="briefing__bar">
          <span>BRIEFTICK</span>
          <span class="briefing__clock" data-clock></span>
          <span class="briefing__line" data-line-counter>LN 1/${sections.length}</span>
        </header>
        <div class="briefing__scroll" data-scroll></div>
        <footer class="briefing__keys">
          <span>→ Next section</span>
          <span>Esc Skip</span>
          <div class="briefing__progress"><span data-progress></span></div>
          <button type="button" class="phil-btn phil-btn--amber" data-next>Continue →</button>
        </footer>
      </div>
    </div>`;

  const layer = root.querySelector("[data-layer]");
  const scroll = root.querySelector("[data-scroll]");

  function renderSection(i) {
    const sec = sections[i];
    index = i;
    scroll.innerHTML = `
      <p class="briefing__kicker">${sec.kicker}</p>
      <h2 class="briefing__headline">${sec.headline}</h2>
      <p class="briefing__body">${sec.body}</p>
      <p class="briefing__meta">${sec.meta}</p>`;

    const stepMap = { dashboard: 0, logic: 1, discover: 2, intelligence: 2 };
    const stepIdx = stepMap[sec.id];
    if (stepIdx != null && steps[stepIdx]) {
      setActivePage(steps[stepIdx].pageId, steps[stepIdx].navId);
    }

    root.querySelector("[data-line-counter]").textContent = `LN ${i + 1}/${sections.length}`;
    root.querySelector("[data-progress]").style.width = `${((i + 1) / sections.length) * 100}%`;
    root.querySelector("[data-next]").textContent =
      i === sections.length - 1 ? "End briefing" : "Continue →";
  }

  function tickClock() {
    const el = root.querySelector("[data-clock]");
    if (!el) return;
    const now = new Date();
    el.textContent = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  }

  function next() {
    if (index >= sections.length - 1) {
      close(true);
      return;
    }
    renderSection(index + 1);
  }

  function close(finished = false) {
    open = false;
    layer?.classList.add("is-closed");
    if (finished) document.getElementById("tourFinishBanner")?.classList.add("is-visible");
  }

  root.querySelector("[data-next]")?.addEventListener("click", next);
  const keyFn = (e) => {
    if (!open) return;
    if (e.key === "ArrowRight" || e.key === "Enter") next();
    if (e.key === "Escape") close(false);
  };
  document.addEventListener("keydown", keyFn);
  tickClock();
  const clockIv = setInterval(tickClock, 30000);
  renderSection(0);

  return () => {
    document.removeEventListener("keydown", keyFn);
    clearInterval(clockIv);
    root.innerHTML = "";
  };
}
