/**
 * Concept 1 — Mission Path
 * Psychology: achievement · RPG quest map · unlock missions
 * @module design-lab/onboarding-tour/concepts/mission
 */

import { getMissionNodes } from "../shared-steps.js";
import { setActivePage } from "../tour-utils.js";

export function initMission({ steps, root, stepThreeVariant = "discover" }) {
  const nodes = getMissionNodes(stepThreeVariant);
  let active = 0;
  let completed = new Set();
  let open = true;

  root.innerHTML = `
    <div class="phil mission" data-layer>
      <div class="mission__backdrop"></div>
      <div class="mission__frame">
        <header class="mission__header">
          <span class="mission__tag">Session Quest</span>
          <h1>Start your market session</h1>
          <p>Complete three missions to unlock the full FORGENIQ workflow.</p>
          <div class="mission__xp">
            <span data-xp-label>0 XP</span>
            <div class="mission__xp-track"><span data-xp-bar style="width:0%"></span></div>
          </div>
        </header>
        <ol class="mission__map" data-map></ol>
        <article class="mission__active" data-active-panel hidden>
          <span class="mission__rank" data-rank></span>
          <h2 data-title></h2>
          <p data-body></p>
          <div class="mission__actions">
            <button type="button" class="phil-btn phil-btn--ghost" data-skip>Skip quest</button>
            <button type="button" class="phil-btn phil-btn--gold" data-complete>Complete mission</button>
          </div>
        </article>
        <footer class="mission__footer" data-footer>
          <button type="button" class="phil-btn phil-btn--ghost" data-restart>Restart</button>
          <button type="button" class="phil-btn phil-btn--gold" data-begin>Begin Mission 1</button>
        </footer>
      </div>
    </div>`;

  const layer = root.querySelector("[data-layer]");
  const map = root.querySelector("[data-map]");
  const panel = root.querySelector("[data-active-panel]");
  const footer = root.querySelector("[data-footer]");

  function renderMap() {
    map.innerHTML = nodes
      .map(
        (n, i) => `
      <li class="mission__node ${completed.has(i) ? "is-done" : ""} ${i === active ? "is-active" : ""}" data-node="${i}">
        <div class="mission__node-icon">${i + 1}</div>
        <div class="mission__node-body">
          <strong>${n.step.title}</strong>
          <span>${n.rank} · ${n.reward}</span>
        </div>
        <span class="mission__node-status">${completed.has(i) ? "✓" : i === active ? "→" : "—"}</span>
      </li>`
      )
      .join("");
  }

  function xpTotal() {
    return [...completed].reduce((sum, i) => sum + (i === 0 ? 25 : i === 1 ? 50 : 100), 0);
  }

  function updateXp() {
    const xp = xpTotal();
    root.querySelector("[data-xp-label]").textContent = `${xp} XP`;
    root.querySelector("[data-xp-bar]").style.width = `${(completed.size / nodes.length) * 100}%`;
  }

  function showMission(i) {
    active = i;
    const n = nodes[i];
    setActivePage(n.step.pageId, n.step.navId);
    renderMap();
    panel.hidden = false;
    footer.hidden = true;
    root.querySelector("[data-rank]").textContent = `${n.rank} · ${n.reward}`;
    root.querySelector("[data-title]").textContent = n.step.title;
    root.querySelector("[data-body]").textContent = n.objective;
    root.querySelector("[data-complete]").textContent =
      i === nodes.length - 1 ? "Finish quest" : `Complete · Mission ${i + 1}`;
  }

  function completeMission() {
    completed.add(active);
    updateXp();
    if (active >= nodes.length - 1) {
      close(true);
      return;
    }
    showMission(active + 1);
  }

  function close(finished = false) {
    open = false;
    layer?.classList.add("is-closed");
    if (finished) document.getElementById("tourFinishBanner")?.classList.add("is-visible");
  }

  root.querySelector("[data-begin]")?.addEventListener("click", () => showMission(0));
  root.querySelector("[data-complete]")?.addEventListener("click", completeMission);
  root.querySelector("[data-skip]")?.addEventListener("click", () => close(false));
  root.querySelector("[data-restart]")?.addEventListener("click", () => {
    completed = new Set();
    active = 0;
    panel.hidden = true;
    footer.hidden = false;
    updateXp();
    renderMap();
    setActivePage(steps[0].pageId, steps[0].navId);
  });

  renderMap();
  updateXp();

  return () => {
    root.innerHTML = "";
  };
}
