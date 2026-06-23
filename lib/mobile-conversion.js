/**
 * Mobile conversion sprint — navigation, performance guards (≤768px only).
 * @module lib/mobile-conversion
 */

export const MOBILE_MQ = "(max-width: 768px)";

/** @returns {boolean} */
export function isMobileConversionViewport() {
  return typeof window !== "undefined" && window.matchMedia(MOBILE_MQ).matches;
}

/** Sync html[data-mobile-conversion] for CSS hooks. */
export function syncMobileConversionFlag() {
  if (typeof document === "undefined") return;
  document.documentElement.toggleAttribute(
    "data-mobile-conversion",
    isMobileConversionViewport()
  );
}

function cloneLinksIntoDrawer() {
  const drawerLinks = document.getElementById("navDrawerLinks");
  const source = document.getElementById("navLinks");
  if (!drawerLinks || !source || drawerLinks.dataset.cloned === "1") return;
  drawerLinks.innerHTML = "";
  source.querySelectorAll(".nav-link").forEach((btn) => {
    const clone = btn.cloneNode(true);
    clone.classList.add("nav-link--drawer");
    clone.addEventListener("click", () => closeNavDrawer());
    drawerLinks.appendChild(clone);
  });
  drawerLinks.dataset.cloned = "1";
}

function wireDrawerAuth() {
  const slot = document.getElementById("navDrawerAuth");
  const signedOut = document.getElementById("authSignedOut");
  if (!slot || !signedOut || slot.dataset.wired === "1") return;
  const signIn = signedOut.querySelector(".auth-signin-btn");
  const signUp = signedOut.querySelector(".auth-signup-btn");
  if (signIn) {
    const b = signIn.cloneNode(true);
    b.addEventListener("click", () => {
      closeNavDrawer();
      signIn.click();
    });
    slot.appendChild(b);
  }
  if (signUp) {
    const b = signUp.cloneNode(true);
    b.classList.add("nav-drawer-signup-secondary");
    b.addEventListener("click", () => {
      closeNavDrawer();
      signUp.click();
    });
    slot.appendChild(b);
  }
  slot.dataset.wired = "1";
}

function openNavDrawer() {
  const drawer = document.getElementById("navDrawer");
  const btn = document.getElementById("navMenuBtn");
  if (!drawer || !btn) return;
  cloneLinksIntoDrawer();
  wireDrawerAuth();
  drawer.classList.add("is-open");
  drawer.setAttribute("aria-hidden", "false");
  btn.setAttribute("aria-expanded", "true");
  document.body.classList.add("nav-drawer-open");
}

function closeNavDrawer() {
  const drawer = document.getElementById("navDrawer");
  const btn = document.getElementById("navMenuBtn");
  if (!drawer || !btn) return;
  drawer.classList.remove("is-open");
  drawer.setAttribute("aria-hidden", "true");
  btn.setAttribute("aria-expanded", "false");
  document.body.classList.remove("nav-drawer-open");
}

/** @returns {() => void} */
export function initMobileNav() {
  syncMobileConversionFlag();

  const btn = document.getElementById("navMenuBtn");
  const closeBtn = document.getElementById("navDrawerClose");
  const backdrop = document.getElementById("navDrawerBackdrop");
  const drawer = document.getElementById("navDrawer");

  btn?.addEventListener("click", () => {
    if (drawer?.classList.contains("is-open")) closeNavDrawer();
    else openNavDrawer();
  });
  closeBtn?.addEventListener("click", closeNavDrawer);
  backdrop?.addEventListener("click", closeNavDrawer);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeNavDrawer();
  });

  window.addEventListener("resize", syncMobileConversionFlag, { passive: true });

  return closeNavDrawer;
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => initMobileNav());
  } else {
    initMobileNav();
  }
}
