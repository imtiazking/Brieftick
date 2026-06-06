/**
 * Concept 5 — Floating Market Analyst
 * Psychology: optional expert · whisper tips · non-modal
 * @module design-lab/onboarding-tour/concepts/analyst
 */

import { getAnalystNotes } from "../shared-steps.js";
import { setActivePage } from "../tour-utils.js";

export function initAnalyst({ steps, root, stepThreeVariant = "discover" }) {
  const notes = getAnalystNotes(stepThreeVariant);
  let index = 0;
  let collected = 0;
  let expanded = true;
  let open = true;

  root.innerHTML = `
    <div class="phil analyst" data-layer>
      <div class="analyst__widget ${expanded ? "is-expanded" : ""}" data-widget>
        <button type="button" class="analyst__fab" data-fab aria-label="Market analyst">
          <span class="analyst__fab-icon">📊</span>
          <span class="analyst__fab-badge" data-badge>3</span>
        </button>
        <div class="analyst__panel" data-panel>
          <header class="analyst__head">
            <div>
              <strong>Sarah · Market Analyst</strong>
              <span class="analyst__mood" data-mood>On desk</span>
            </div>
            <button type="button" class="analyst__close" data-close aria-label="Close">×</button>
          </header>
          <p class="analyst__whisper" data-whisper></p>
          <details class="analyst__detail" open>
            <summary>Why this matters</summary>
            <p data-detail></p>
          </details>
          <div class="analyst__notes">
            <span data-notes-label>Notes collected: 0/3</span>
            <div class="analyst__notes-dots" data-dots></div>
          </div>
          <div class="analyst__actions">
            <button type="button" class="phil-btn phil-btn--ghost" data-dismiss>Not now</button>
            <button type="button" class="phil-btn phil-btn--gold" data-cta></button>
          </div>
        </div>
      </div>
      <div class="analyst__pings" data-pings aria-hidden="true"></div>
    </div>`;

  const layer = root.querySelector("[data-layer]");
  const widget = root.querySelector("[data-widget]");
  const pings = root.querySelector("[data-pings]");

  function renderDots() {
    const dots = root.querySelector("[data-dots]");
    dots.innerHTML = notes
      .map(
        (_, i) =>
          `<span class="analyst__dot ${i < collected ? "is-collected" : i === index ? "is-live" : ""}"></span>`
      )
      .join("");
    root.querySelector("[data-notes-label]").textContent = `Notes collected: ${collected}/${notes.length}`;
    root.querySelector("[data-badge]").textContent = String(Math.max(0, notes.length - collected));
  }

  function pingNav(navId) {
    pings.innerHTML = "";
    const el = document.getElementById(navId);
    if (!el) return;
    const r = el.getBoundingClientRect();
    const ping = document.createElement("div");
    ping.className = "analyst__ping";
    ping.style.top = `${r.top + r.height / 2}px`;
    ping.style.left = `${r.left + r.width / 2}px`;
    pings.appendChild(ping);
  }

  function showNote(i) {
    if (i >= notes.length) {
      close(true);
      return;
    }
    index = i;
    const n = notes[i];
    setActivePage(n.step.pageId, n.step.navId);
    pingNav(n.step.navId);
    root.querySelector("[data-mood]").textContent = n.mood;
    root.querySelector("[data-whisper]").textContent = n.whisper;
    root.querySelector("[data-detail]").textContent = n.detail;
    root.querySelector("[data-cta]").textContent =
      i === notes.length - 1 ? "Finish · Thanks Sarah" : n.cta;
    renderDots();
    widget.classList.add("is-expanded");
    expanded = true;
  }

  function advance() {
    collected += 1;
    renderDots();
    showNote(index + 1);
  }

  function close(finished = false) {
    open = false;
    layer?.classList.add("is-closed");
    pings.innerHTML = "";
    if (finished) document.getElementById("tourFinishBanner")?.classList.add("is-visible");
  }

  root.querySelector("[data-cta]")?.addEventListener("click", advance);
  root.querySelector("[data-dismiss]")?.addEventListener("click", () => close(false));
  root.querySelector("[data-close]")?.addEventListener("click", () => {
    widget.classList.remove("is-expanded");
    expanded = false;
  });
  root.querySelector("[data-fab]")?.addEventListener("click", () => {
    expanded = !expanded;
    widget.classList.toggle("is-expanded", expanded);
  });

  const onResize = () => pingNav(notes[index]?.step.navId);
  window.addEventListener("resize", onResize);

  showNote(0);

  return () => {
    window.removeEventListener("resize", onResize);
    root.innerHTML = "";
  };
}
