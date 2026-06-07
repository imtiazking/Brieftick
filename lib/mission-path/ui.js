/**
 * Mission Path — DOM rendering.
 * @module lib/mission-path/ui
 */

import {
  WELCOME,
  PROMO,
  COMPLETION,
  MISSIONS,
  TOTAL_MISSIONS,
  FINAL_RANK,
  progressHead,
  computeXp,
  currentRankLabel,
} from "./content.js";

/**
 * @param {number} missionIndex
 * @param {{ showTitle?: boolean }} [opts]
 */
function renderProgressHead(missionIndex, opts = {}) {
  const { step, title, time } = progressHead(missionIndex);
  const titleHtml =
    opts.showTitle && title
      ? `<p class="mp-progress-head__title">${title}</p>`
      : "";
  return `
    <div class="mp-progress-head">
      <p class="mp-progress-head__step">${step}</p>
      ${titleHtml}
      <p class="mp-progress-head__time">${time}</p>
    </div>`;
}

/**
 * @typedef {'hidden' | 'welcome' | 'mission' | 'complete' | 'pill' | 'promo'} ViewMode
 */

/**
 * @param {HTMLElement} root
 */
export function createMissionShell(root) {
  root.innerHTML = `
    <div class="mp-root" data-mp-root hidden>
      <div class="mp-dim" data-mp-dim hidden aria-hidden="true"></div>
      <div class="mp-welcome" data-mp-welcome hidden role="dialog" aria-label="Mission Path welcome"></div>
      <div class="mp-panel" data-mp-panel hidden role="dialog" aria-label="Mission Path"></div>
      <div class="mp-complete" data-mp-complete hidden role="dialog" aria-label="Mission Path complete"></div>
      <button type="button" class="mp-pill" data-mp-pill hidden>
        <span class="mp-pill__dot" aria-hidden="true"></span>
        <span data-mp-pill-text>Resume Mission Path</span>
      </button>
      <button type="button" class="mp-promo" data-mp-promo hidden>
        <span class="mp-promo__text"><span>${PROMO.label}</span><span>${PROMO.detail}</span></span>
        <span class="mp-promo__cta">Start →</span>
        <span class="mp-promo__dismiss" data-mp-promo-dismiss aria-label="Dismiss">×</span>
      </button>
    </div>`;

  return {
    root: root.querySelector("[data-mp-root]"),
    dim: root.querySelector("[data-mp-dim]"),
    welcome: root.querySelector("[data-mp-welcome]"),
    panel: root.querySelector("[data-mp-panel]"),
    complete: root.querySelector("[data-mp-complete]"),
    pill: root.querySelector("[data-mp-pill]"),
    promo: root.querySelector("[data-mp-promo]"),
  };
}

/**
 * @param {object} els
 * @param {ViewMode} mode
 */
export function setViewMode(els, mode) {
  const showRoot = mode !== "hidden";
  els.root.hidden = !showRoot;
  els.welcome.hidden = mode !== "welcome";
  els.panel.hidden = mode !== "mission";
  els.complete.hidden = mode !== "complete";
  els.pill.hidden = mode !== "pill";
  els.promo.hidden = mode !== "promo";
  els.dim.hidden = !(mode === "mission" || mode === "complete");

  document.body.classList.toggle("mp-open", mode === "mission" || mode === "complete");
  document.body.classList.toggle("mp-welcome-open", mode === "welcome");
  document.body.classList.toggle("mp-minimized", mode === "pill" || mode === "promo");
}

/**
 * @param {HTMLElement} el
 * @param {import('./store.js').UserProgress} progress
 */
export function renderWelcome(el, progress) {
  el.innerHTML = `
    <div class="mp-welcome__inner">
      <img src="/logo-symbol-transparent.png" alt="" class="mp-welcome__logo" width="56" height="56" />
      <p class="mp-tag">${WELCOME.tag}</p>
      <h1 class="mp-welcome__title">${WELCOME.headline}</h1>
      <p class="mp-welcome__body">${WELCOME.body}</p>
      ${renderProgressHead(0, { showTitle: true })}
      <div class="mp-welcome__actions">
        <button type="button" class="mp-btn mp-btn--gold" data-mp-begin>${WELCOME.beginCta}</button>
        <button type="button" class="mp-btn mp-btn--ghost" data-mp-skip>${WELCOME.skipCta}</button>
      </div>
    </div>`;
}

/**
 * @param {HTMLElement} el
 * @param {import('./store.js').UserProgress} progress
 * @param {boolean} isTerminal
 */
export function renderMissionPanel(el, progress, isTerminal) {
  const idx = progress.currentMission ?? 0;
  const mission = MISSIONS[idx];
  if (!mission) return;

  const xp = computeXp(progress);
  const xpPct = Math.round((progress.completedMissions.length / TOTAL_MISSIONS) * 100);
  const rank = currentRankLabel(progress);

  const pills = MISSIONS.map((m, i) => {
    const done = progress.completedMissions.includes(i);
    const active = i === idx;
    const skipped = progress.skippedMissions?.includes(i);
    let cls = "mp-pill-map__item";
    if (done) cls += " is-done";
    else if (active) cls += " is-active";
    else if (skipped) cls += " is-skipped";
    return `<span class="${cls}" title="${m.title}">${i + 1}</span>`;
  }).join("");

  const whenHtml = mission.context
    ? `<p class="mp-prose mp-prose--when">${mission.context}</p>`
    : "";

  let taskHtml = "";
  if (mission.checklist?.length) {
    const items = mission.checklist
      .map((c) => {
        const checked = progress.mission1Checklist?.includes(c.wheelId);
        const hint = c.hint || c.teach || "";
        return `
        <button type="button" class="mp-check ${checked ? "is-checked" : ""}" data-mp-check="${c.wheelId}">
          <span class="mp-check__box" aria-hidden="true">${checked ? "✓" : ""}</span>
          <span class="mp-check__body">
            <strong>${c.label}</strong>
            ${hint ? `<span>${hint}</span>` : ""}
          </span>
        </button>`;
      })
      .join("");
    taskHtml = `
      <p class="mp-task-intro">${mission.action}</p>
      <div class="mp-checklist">${items}</div>`;
  } else {
    taskHtml = `<p class="mp-task-text">${mission.action}</p>`;
  }

  const verifyLabel =
    mission.id === "find-opportunities" && !isTerminal && mission.verifyLabelFree
      ? mission.verifyLabelFree
      : mission.verifyLabel;

  const helperExtra =
    mission.id === "find-opportunities" && !isTerminal
      ? "Full scans are a Terminal feature. Review the page layout and sample results for now."
      : mission.helper ?? "";

  el.innerHTML = `
    <div class="mp-panel__handle" aria-hidden="true"></div>
    <header class="mp-panel__head">
      <div>
        <p class="mp-tag">${WELCOME.tag}</p>
        ${renderProgressHead(idx, { showTitle: true })}
      </div>
      <button type="button" class="mp-panel__min" data-mp-minimize aria-label="Minimize">—</button>
    </header>
    <div class="mp-panel__progress">
      <span class="mp-panel__progress-stats"><span>${rank}</span><span>${xp} XP</span></span>
      <div class="mp-xp-track"><span style="width:${xpPct}%"></span></div>
    </div>
    <div class="mp-pill-map" aria-label="Mission progress">${pills}</div>
    <div class="mp-panel__body">
      <p class="mp-prose mp-prose--lead">${mission.lead}</p>
      ${whenHtml}
      <div class="mp-block mp-block--task">
        <p class="mp-block__label">Your task</p>
        ${taskHtml}
        ${helperExtra ? `<p class="mp-helper">${helperExtra}</p>` : ""}
      </div>
      ${
        mission.route
          ? `<button type="button" class="mp-btn mp-btn--ghost mp-btn--block" data-mp-goto>Open ${mission.title === "Investigate a Move" ? "What's Moving" : mission.title === "Find Opportunities" ? "Discover Stocks" : mission.title}</button>`
          : ""
      }
    </div>
    <footer class="mp-panel__foot">
      <button type="button" class="mp-btn mp-btn--ghost" data-mp-skip-mission>Skip mission</button>
      <button type="button" class="mp-btn mp-btn--gold" data-mp-verify>${verifyLabel}</button>
    </footer>`;
}

/**
 * @param {HTMLElement} el
 * @param {import('./store.js').UserProgress} progress
 */
export function renderCompletion(el, progress) {
  const xp = computeXp(progress);

  el.innerHTML = `
    <div class="mp-complete__inner">
      <p class="mp-complete__icon" aria-hidden="true">✓</p>
      <p class="mp-tag">Session Quest</p>
      <h2 class="mp-complete__title">${COMPLETION.headline}</h2>
      <p class="mp-complete__sub">${COMPLETION.subhead}</p>
      <p class="mp-prose mp-prose--lead">${COMPLETION.loopSummary}</p>
      <p class="mp-complete__xp"><span>${xp} XP earned</span><span>${FINAL_RANK} rank</span></p>
      <p class="mp-prose mp-prose--closing">${COMPLETION.closingLine}</p>
      <div class="mp-complete__actions">
        <button type="button" class="mp-btn mp-btn--gold" data-mp-enter>${COMPLETION.enterCta}</button>
        <button type="button" class="mp-btn mp-btn--ghost" data-mp-restart>${COMPLETION.restartCta}</button>
      </div>
    </div>`;
}

/**
 * @param {HTMLElement} pill
 * @param {import('./store.js').UserProgress} progress
 */
export function updatePill(pill, progress) {
  const n = (progress.currentMission ?? 0) + 1;
  const text = pill.querySelector("[data-mp-pill-text]");
  if (text) {
    const head = progressHead((progress.currentMission ?? 0));
    text.innerHTML = `<span class="mp-pill__step">${head.step}</span><span class="mp-pill__action">Resume</span>`;
  }
}

/**
 * @param {HTMLElement} statusEl
 * @param {import('./store.js').UserProgress|null} progress
 */
export function renderSettingsStatus(statusEl, progress) {
  if (!statusEl) return;
  if (!progress) {
    statusEl.textContent = "Not started";
    return;
  }
  if (progress.status === "completed") {
    const date = progress.completedAt
      ? new Date(progress.completedAt).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
          year: "numeric",
        })
      : "";
    statusEl.textContent = date ? `Completed on ${date}` : "Completed";
    return;
  }
  const head = progressHead(progress.currentMission ?? 0);
  const rank = currentRankLabel(progress);
  const xp = computeXp(progress);
  statusEl.innerHTML = `<span class="mp-settings-status__step">${head.step}</span><span class="mp-settings-status__title">${head.title}</span><span class="mp-settings-status__detail">${rank}, ${xp} XP earned</span>`;
}

/**
 * @param {object} settingsEls
 * @param {import('./store.js').UserProgress|null} progress
 */
export function syncSettingsButtons(settingsEls, progress) {
  const completed = progress?.status === "completed";
  if (settingsEls.continueBtn) {
    settingsEls.continueBtn.hidden = completed || !progress;
    settingsEls.continueBtn.disabled = completed;
  }
}
