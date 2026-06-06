/**
 * Concept 5 — Market Analyst (Strategist Session)
 * Psychology: senior strategist beside you · active teaching · non-modal
 * @module design-lab/onboarding-tour/concepts/analyst
 */

import { getStrategistSessions } from "../shared-steps.js";
import { setActivePage } from "../tour-utils.js";

export function initAnalyst({ root, stepThreeVariant = "discover" }) {
  const session = getStrategistSessions(stepThreeVariant);
  const { intro, stops, outro } = session;

  /** @type {'intro' | 'stop' | 'outro'} */
  let phase = "intro";
  let stopIndex = 0;
  let walked = false;
  let open = true;

  root.innerHTML = `
    <div class="phil analyst" data-layer>
      <div class="strategist-dock" data-dock>
        <header class="strategist-dock__head">
          <div class="strategist-dock__identity">
            <div class="strategist-dock__avatar" aria-hidden="true">E</div>
            <div>
              <strong>Elena · Senior Market Strategist</strong>
              <span class="strategist-dock__cred">Guided session · design lab</span>
            </div>
          </div>
          <button type="button" class="strategist-dock__min" data-minimize aria-label="Minimize">—</button>
        </header>

        <div class="strategist-dock__roadmap" data-roadmap aria-label="Session stops"></div>

        <section class="strategist-dock__body" data-body aria-live="polite"></section>

        <footer class="strategist-dock__foot" data-foot></footer>
      </div>

      <div class="strategist-dock__minibar" data-minibar hidden>
        <button type="button" class="strategist-dock__restore" data-restore>
          <span>Elena</span> · Resume guided session
        </button>
      </div>

      <div class="strategist-coach" data-coach hidden aria-hidden="true">
        <svg class="strategist-coach__line" data-coach-line viewBox="0 0 200 80" preserveAspectRatio="none">
          <path d="M0,40 Q100,40 200,40" fill="none" stroke="rgba(212,168,90,0.5)" stroke-width="2"/>
        </svg>
        <span class="strategist-coach__label" data-coach-label>Look here</span>
      </div>
    </div>`;

  const layer = root.querySelector("[data-layer]");
  const dock = root.querySelector("[data-dock]");
  const minibar = root.querySelector("[data-minibar]");
  const body = root.querySelector("[data-body]");
  const foot = root.querySelector("[data-foot]");
  const roadmap = root.querySelector("[data-roadmap]");
  const coach = root.querySelector("[data-coach]");

  function clearHighlights() {
    document.querySelectorAll(".strategist-nav-glow").forEach((el) => {
      el.classList.remove("strategist-nav-glow");
    });
    document.querySelectorAll(".strategist-page-glow").forEach((el) => {
      el.classList.remove("strategist-page-glow");
    });
    coach.hidden = true;
  }

  function highlightTarget(navId, pageId) {
    clearHighlights();
    const nav = document.getElementById(navId);
    const page = document.getElementById(pageId);
    nav?.classList.add("strategist-nav-glow");
    page?.classList.add("strategist-page-glow");
    if (nav && coach) {
      positionCoach(nav);
    }
  }

  function positionCoach(navEl) {
    const r = navEl.getBoundingClientRect();
    const dockRect = dock.getBoundingClientRect();
    coach.hidden = false;
    coach.style.top = `${r.top + r.height / 2 - 12}px`;
    coach.style.left = `${Math.min(dockRect.right + 8, r.left - 120)}px`;
    coach.style.width = `${Math.max(80, r.left - dockRect.right - 16)}px`;
    root.querySelector("[data-coach-label]").textContent = `→ ${navEl.textContent?.trim()}`;
  }

  function renderRoadmap(activeIdx = -1) {
    roadmap.innerHTML = stops
      .map(
        (stop, i) => `
      <div class="strategist-stop ${i < activeIdx ? "is-done" : ""} ${i === activeIdx ? "is-live" : ""}">
        <span class="strategist-stop__num">${i + 1}</span>
        <span class="strategist-stop__name">${stop.step.title}</span>
      </div>`
      )
      .join("");
  }

  function renderIntro() {
    phase = "intro";
    walked = false;
    clearHighlights();
    renderRoadmap(-1);
    body.innerHTML = `
      <p class="strategist-dock__phase">Personal orientation</p>
      <h2 class="strategist-dock__title">${intro.headline}</h2>
      <p class="strategist-dock__say">${intro.body}</p>
      <ul class="strategist-dock__agenda">
        ${stops.map((s) => `<li><strong>${s.stopLabel}</strong> — ${s.title}</li>`).join("")}
      </ul>
      <p class="strategist-dock__meta">${intro.duration} · ${stops.length} stops · app stays usable</p>`;
    foot.innerHTML = `
      <button type="button" class="phil-btn phil-btn--ghost" data-dismiss>Not now</button>
      <button type="button" class="phil-btn phil-btn--gold" data-start>Begin guided session</button>`;
  }

  function renderStop(i) {
    phase = "stop";
    stopIndex = i;
    walked = false;
    const stop = stops[i];
    setActivePage(stop.step.pageId, stop.step.navId);
    renderRoadmap(i);
    body.innerHTML = `
      <p class="strategist-dock__phase">${stop.stopLabel}</p>
      <h2 class="strategist-dock__title">${stop.title}</h2>
      <blockquote class="strategist-dock__say">“${stop.strategistSays}”</blockquote>
      <div class="strategist-dock__teach">
        <span class="strategist-dock__teach-label">What I'll teach you here</span>
        <ul>${stop.teach.map((t) => `<li>${t}</li>`).join("")}</ul>
      </div>
      <p class="strategist-dock__look"><strong>On screen:</strong> ${stop.lookFor}</p>`;
    foot.innerHTML = `
      <button type="button" class="phil-btn phil-btn--ghost" data-skip-stop>Skip stop</button>
      <button type="button" class="phil-btn phil-btn--gold" data-walk>${stop.ctaWalk}</button>
      <button type="button" class="phil-btn phil-btn--gold" data-next hidden>${stop.ctaNext}</button>`;
  }

  function renderOutro() {
    phase = "outro";
    clearHighlights();
    renderRoadmap(stops.length);
    body.innerHTML = `
      <p class="strategist-dock__phase">Session complete</p>
      <h2 class="strategist-dock__title">${outro.headline}</h2>
      <p class="strategist-dock__say">${outro.body}</p>`;
    foot.innerHTML = `
      <button type="button" class="phil-btn phil-btn--gold" data-finish>Close session</button>`;
  }

  function walkToTarget() {
    const stop = stops[stopIndex];
    walked = true;
    setActivePage(stop.step.pageId, stop.step.navId);
    highlightTarget(stop.step.navId, stop.step.pageId);
    stop.step.navId &&
      document.getElementById(stop.step.navId)?.scrollIntoView({
        block: "nearest",
        inline: "center",
        behavior: "smooth",
      });
    root.querySelector("[data-walk]")?.setAttribute("hidden", "");
    root.querySelector("[data-next]")?.removeAttribute("hidden");
  }

  function nextStop() {
    if (stopIndex >= stops.length - 1) {
      renderOutro();
      return;
    }
    renderStop(stopIndex + 1);
  }

  function close(finished = false) {
    open = false;
    clearHighlights();
    layer?.classList.add("is-closed");
    minibar.hidden = true;
    if (finished) document.getElementById("tourFinishBanner")?.classList.add("is-visible");
  }

  function minimize() {
    dock.hidden = true;
    minibar.hidden = false;
  }

  function restore() {
    dock.hidden = false;
    minibar.hidden = true;
  }

  foot.addEventListener("click", (e) => {
    const t = e.target.closest(
      "[data-start],[data-walk],[data-next],[data-skip-stop],[data-finish],[data-dismiss]"
    );
    if (!t) return;
    if (t.hasAttribute("data-start")) renderStop(0);
    if (t.hasAttribute("data-walk")) walkToTarget();
    if (t.hasAttribute("data-next")) nextStop();
    if (t.hasAttribute("data-skip-stop")) nextStop();
    if (t.hasAttribute("data-finish")) close(true);
    if (t.hasAttribute("data-dismiss")) close(false);
  });

  root.querySelector("[data-minimize]")?.addEventListener("click", minimize);
  root.querySelector("[data-restore]")?.addEventListener("click", restore);

  const onResize = () => {
    if (phase === "stop" && walked) {
      highlightTarget(stops[stopIndex].step.navId, stops[stopIndex].step.pageId);
    }
  };
  window.addEventListener("resize", onResize);

  renderIntro();

  return () => {
    window.removeEventListener("resize", onResize);
    clearHighlights();
    root.innerHTML = "";
  };
}
