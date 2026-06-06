/**
 * Concept 4 — Interactive Challenge / Quest
 * Psychology: gamification · self-verify · active participation
 * @module design-lab/onboarding-tour/concepts/quest
 */

import { getQuestChallenges } from "../shared-steps.js";
import { setActivePage } from "../tour-utils.js";

export function initQuest({ steps, root, stepThreeVariant = "discover" }) {
  const challenges = getQuestChallenges(stepThreeVariant);
  const done = new Set();
  let open = true;

  root.innerHTML = `
    <div class="phil quest" data-layer>
      <div class="quest__board">
        <header class="quest__header">
          <span class="quest__badge">Daily Quest</span>
          <h1>First Session Challenge</h1>
          <p>Complete each task yourself, then check it off. No hand-holding — you learn by doing.</p>
          <div class="quest__stats">
            <div><strong data-xp>0</strong><span>XP earned</span></div>
            <div><strong data-count>0/${challenges.length}</strong><span>Complete</span></div>
            <div class="quest__streak" data-streak>🔥 Streak ready</div>
          </div>
        </header>
        <ul class="quest__list" data-list></ul>
        <footer class="quest__footer">
          <button type="button" class="phil-btn phil-btn--ghost" data-skip>Skip quest</button>
          <button type="button" class="phil-btn phil-btn--gold" data-finish hidden>Claim reward</button>
        </footer>
      </div>
    </div>`;

  const layer = root.querySelector("[data-layer]");
  const list = root.querySelector("[data-list]");

  function totalXp() {
    return [...done].reduce((s, id) => {
      const c = challenges.find((x) => x.id === id);
      return s + (c?.xp || 0);
    }, 0);
  }

  function render() {
    list.innerHTML = challenges
      .map((c, i) => {
        const isDone = done.has(c.id);
        const isLocked = i > 0 && !done.has(challenges[i - 1].id);
        return `
        <li class="quest__card ${isDone ? "is-done" : ""} ${isLocked ? "is-locked" : ""}" data-card="${c.id}">
          <label class="quest__check">
            <input type="checkbox" data-check="${c.id}" ${isDone ? "checked disabled" : ""} ${isLocked ? "disabled" : ""}>
            <span class="quest__check-ui"></span>
          </label>
          <div class="quest__card-body">
            <span class="quest__xp-tag">+${c.xp} XP</span>
            <strong>${c.title}</strong>
            <p>${c.task}</p>
            <button type="button" class="quest__go" data-go="${c.id}" ${isLocked || isDone ? "disabled" : ""}>
              ${c.verifyLabel}
            </button>
          </div>
        </li>`;
      })
      .join("");

    root.querySelector("[data-xp]").textContent = String(totalXp());
    root.querySelector("[data-count]").textContent = `${done.size}/${challenges.length}`;
    root.querySelector("[data-streak]").textContent =
      done.size >= 2 ? "🔥 Streak active!" : done.size === 1 ? "🔥 Keep going" : "🔥 Streak ready";
    root.querySelector("[data-finish]").hidden = done.size < challenges.length;

    const activeIdx = challenges.findIndex((c) => !done.has(c.id));
    if (activeIdx >= 0) {
      setActivePage(challenges[activeIdx].step.pageId, challenges[activeIdx].step.navId);
    }
  }

  function complete(id) {
    done.add(id);
    render();
  }

  function close(finished = false) {
    open = false;
    layer?.classList.add("is-closed");
    if (finished) document.getElementById("tourFinishBanner")?.classList.add("is-visible");
  }

  list.addEventListener("click", (e) => {
    const go = e.target.closest("[data-go]");
    if (go && !go.disabled) complete(go.dataset.go);
  });
  list.addEventListener("change", (e) => {
    const cb = e.target.closest("[data-check]");
    if (cb?.checked) complete(cb.dataset.check);
  });
  root.querySelector("[data-skip]")?.addEventListener("click", () => close(false));
  root.querySelector("[data-finish]")?.addEventListener("click", () => close(true));

  render();

  return () => {
    root.innerHTML = "";
  };
}
