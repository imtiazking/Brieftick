/**
 * Shared tour DOM helpers — design lab only.
 * @module design-lab/onboarding-tour/tour-utils
 */

export const MOBILE_BREAK = 640;

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
