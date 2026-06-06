/**
 * Shared tour DOM helpers — design lab only.
 * @module design-lab/onboarding-tour/tour-utils
 */

export const MOBILE_BREAK = 640;
export const PAD = 8;

export function isMobile() {
  return window.innerWidth <= MOBILE_BREAK;
}

/**
 * @param {string} stepThree
 */
export function applyStepThreeNav(stepThree) {
  const discoverNav = document.getElementById("nav-discover");
  const intelNav = document.getElementById("nav-intelligence");
  if (discoverNav) discoverNav.hidden = stepThree !== "discover";
  if (intelNav) intelNav.hidden = stepThree !== "intelligence";
}

/**
 * @param {string} pageId
 * @param {string} [navId]
 */
export function setActivePage(pageId, navId) {
  document.querySelectorAll(".mock-page").forEach((p) => {
    p.classList.toggle("is-active", p.id === pageId);
  });
  document.querySelectorAll(".mock-nav__link").forEach((link) => {
    link.classList.toggle("is-active", navId ? link.id === navId : false);
  });
}

/**
 * @param {HTMLElement | null} container
 * @param {number} total
 * @param {number} active
 */
export function renderDots(container, total, active) {
  if (!container) return;
  container.innerHTML = "";
  for (let i = 0; i < total; i++) {
    const dot = document.createElement("span");
    dot.className = "tour-dot";
    if (i < active) dot.classList.add("is-done");
    if (i === active) dot.classList.add("is-active");
    container.appendChild(dot);
  }
}

/**
 * @param {HTMLElement} spotlight
 * @param {DOMRect} rect
 * @param {boolean} [pill]
 */
export function positionSpotlight(spotlight, rect, pill) {
  const top = Math.max(0, rect.top - PAD);
  const left = Math.max(0, rect.left - PAD);
  spotlight.style.top = `${top}px`;
  spotlight.style.left = `${left}px`;
  spotlight.style.width = `${rect.width + PAD * 2}px`;
  spotlight.style.height = `${rect.height + PAD * 2}px`;
  spotlight.classList.toggle("tour-spotlight--pill", !!pill);
  return { top, left, width: rect.width + PAD * 2, height: rect.height + PAD * 2 };
}

/**
 * @param {HTMLElement | null} el
 * @param {boolean} on
 */
export function highlightNav(el, on) {
  document.querySelectorAll(".mock-nav__link").forEach((l) => l.classList.remove("is-tour-target"));
  if (on && el) el.classList.add("is-tour-target");
}

/**
 * @param {HTMLElement} target
 * @param {number} [pad]
 */
export function scrollTargetIntoView(target, pad = PAD) {
  target.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  return target.getBoundingClientRect();
}

/**
 * @param {HTMLElement} root
 * @param {object} handlers
 */
export function bindTourActions(root, handlers) {
  root.querySelector("[data-tour-skip]")?.addEventListener("click", handlers.onSkip);
  root.querySelector("[data-tour-next]")?.addEventListener("click", handlers.onNext);
  root.querySelector("[data-tour-restart]")?.addEventListener("click", handlers.onRestart);
  root.querySelector("[data-tour-close]")?.addEventListener("click", handlers.onSkip);
}

/**
 * @param {() => void} onKey
 */
export function bindTourKeys(onKey) {
  const fn = (e) => {
    if (e.key === "Escape") onKey("skip");
    if (e.key === "Enter") onKey("next");
  };
  document.addEventListener("keydown", fn);
  return () => document.removeEventListener("keydown", fn);
}
