/**
 * Concept 3 — AI Co-Pilot Conversation
 * Psychology: dialogue · suggested replies · low-friction guidance
 * @module design-lab/onboarding-tour/concepts/copilot
 */

import { getCopilotScript } from "../shared-steps.js";
import { setActivePage } from "../tour-utils.js";

export function initCopilot({ steps, root, stepThreeVariant = "discover" }) {
  const script = getCopilotScript(stepThreeVariant);
  let turn = 0;
  let open = true;
  const history = [];

  root.innerHTML = `
    <div class="phil copilot" data-layer>
      <div class="copilot__shell">
        <header class="copilot__head">
          <div class="copilot__avatar">AI</div>
          <div>
            <strong>Brieftick Co-Pilot</strong>
            <span>Guided conversation · not financial advice</span>
          </div>
          <button type="button" class="copilot__skip" data-skip>Skip</button>
        </header>
        <div class="copilot__thread" data-thread aria-live="polite"></div>
        <div class="copilot__typing" data-typing hidden>
          <span></span><span></span><span></span>
        </div>
        <div class="copilot__chips" data-chips></div>
        <div class="copilot__depth">
          <span data-depth-label>Intro</span>
          <div class="copilot__depth-bar"><span data-depth-bar style="width:20%"></span></div>
        </div>
      </div>
    </div>`;

  const layer = root.querySelector("[data-layer]");
  const thread = root.querySelector("[data-thread]");
  const chips = root.querySelector("[data-chips]");
  const typing = root.querySelector("[data-typing]");

  const depthLabels = ["Intro", "Dashboard", "Logic", "Discover", "Done"];

  function appendBubble(role, text) {
    const div = document.createElement("div");
    div.className = `copilot__msg copilot__msg--${role}`;
    div.innerHTML = text.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
    thread.appendChild(div);
    thread.scrollTop = thread.scrollHeight;
    history.push({ role, text });
  }

  function syncPageForTurn(t) {
    if (t === 1) setActivePage(steps[0].pageId, steps[0].navId);
    if (t === 2) setActivePage(steps[1].pageId, steps[1].navId);
    if (t === 3) setActivePage(steps[2].pageId, steps[2].navId);
  }

  function updateDepth(t) {
    const pct = Math.min(100, 20 + t * 20);
    root.querySelector("[data-depth-bar]").style.width = `${pct}%`;
    root.querySelector("[data-depth-label]").textContent = depthLabels[t] || "Done";
  }

  function showTurn(t) {
    turn = t;
    syncPageForTurn(t);
    updateDepth(t);
    const entry = script[t];
    if (!entry) return;

    typing.hidden = false;
    chips.innerHTML = "";
    setTimeout(() => {
      typing.hidden = true;
      appendBubble("bot", entry.text);
      chips.innerHTML = entry.chips
        .map((c) => `<button type="button" class="copilot__chip" data-chip="${c}">${c}</button>`)
        .join("");
    }, 600 + Math.random() * 400);
  }

  function onChip(label) {
    appendBubble("user", label);
    if (label === "Skip intro" || label === "Done") {
      close(label === "Done");
      return;
    }
    if (turn >= script.length - 1) {
      close(true);
      return;
    }
    showTurn(turn + 1);
  }

  function close(finished = false) {
    open = false;
    layer?.classList.add("is-closed");
    if (finished) document.getElementById("tourFinishBanner")?.classList.add("is-visible");
  }

  chips.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-chip]");
    if (!btn) return;
    onChip(btn.dataset.chip);
  });
  root.querySelector("[data-skip]")?.addEventListener("click", () => close(false));

  showTurn(0);

  return () => {
    root.innerHTML = "";
  };
}
