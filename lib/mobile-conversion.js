/**
 * Mobile conversion sprint — navigation, performance guards (≤768px only).
 * @module lib/mobile-conversion
 */

export const MOBILE_MQ = "(max-width: 768px)";

const SIGNUP_SELECTOR =
  '[data-auth-action="signup"], [data-split-action="signup"], .auth-signup-btn, .mobile-start-free, .about-hero-cta__btn';

const SIGNIN_SELECTOR =
  '[data-auth-action="signin"], [data-split-action="signin"], .auth-signin-btn:not(.nav-drawer-signin)';

const DRAWER_SIGNIN_SELECTOR = '.nav-drawer-signin, .nav-a__drawer-auth .nav-drawer-signin';

const EXPLORE_SELECTOR =
  '[data-route="dashboard"], [data-split-action="dashboard"], [data-split-action="demo"], .mobile-explore-dashboard';

const CLERK_UI_SELECTOR =
  "#clerk-components, .cl-modalBackdrop, .cl-modalContent, .cl-rootBox, [class*='cl-modal'], [class*='cl-form'], [class*='cl-card'], [class*='cl-socialButtons']";

function isClerkUiTarget(target) {
  return !!(target && typeof target.closest === "function" && target.closest(CLERK_UI_SELECTOR));
}

/** @returns {Promise<unknown>} */
export async function ensureClerkReady() {
  if (typeof window.ensureClerkReady === "function") {
    return window.ensureClerkReady();
  }
  if (window.__btClerkInitialized && window.Clerk) return window.Clerk;
  if (typeof window.__btEnsureClerk === "function") await window.__btEnsureClerk();
  if (typeof window.initClerk === "function" && !window.__btClerkInitialized) {
    await window.initClerk();
  }
  return window.Clerk;
}

async function openMobileSignUp(e) {
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();
  closeNavDrawer();
  await ensureClerkReady();
  if (typeof window.Clerk?.openSignUp === "function") {
    window.Clerk.openSignUp();
  }
}

async function openMobileSignIn(e) {
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();
  closeNavDrawer();
  await ensureClerkReady();
  if (typeof window.Clerk?.openSignIn === "function") {
    window.Clerk.openSignIn();
  }
}

async function openMobileExplore(e) {
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();
  if (typeof window.routeWithAuth === "function") {
    if (!window._clerkUser && !window.Clerk?.user) {
      await ensureClerkReady();
    }
    window.routeWithAuth("dashboard");
    return;
  }
  if (typeof window.route === "function") window.route("dashboard");
}

/** Mobile-only delegated CTA handlers (capture phase). */
export function initMobileCtaHandlers() {
  if (!isMobileConversionViewport()) return;
  if (document.documentElement.dataset.mobileCtaInit === "1") return;
  document.documentElement.dataset.mobileCtaInit = "1";

  document.addEventListener(
    "click",
    (e) => {
      if (!isMobileConversionViewport()) return;
      if (isClerkUiTarget(e.target)) return;
      const signup = e.target.closest(SIGNUP_SELECTOR);
      if (signup) {
        openMobileSignUp(e);
        return;
      }
      const signin = e.target.closest(SIGNIN_SELECTOR);
      if (signin) {
        openMobileSignIn(e);
        return;
      }
      const drawerSignin = e.target.closest(DRAWER_SIGNIN_SELECTOR);
      if (drawerSignin) {
        openMobileSignIn(e);
        return;
      }
      const explore = e.target.closest(EXPLORE_SELECTOR);
      if (explore) {
        openMobileExplore(e);
      }
    },
    true
  );
}

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

const MOBILE_PUBLIC_DRAWER_ROUTES = new Set(["landing", "pricing", "about"]);

function shouldCloneNavLink(btn, source) {
  const route = btn.getAttribute("data-route");
  if (!route) return false;
  const isAuthed = source.classList.contains("nav--authed");
  if (!isAuthed && !MOBILE_PUBLIC_DRAWER_ROUTES.has(route)) return false;
  if (btn.id === "navLogicTab" && btn.style.display === "none") return false;
  const style = window.getComputedStyle(btn);
  if (style.display === "none" && !MOBILE_PUBLIC_DRAWER_ROUTES.has(route)) return false;
  return true;
}

function cloneLinksIntoDrawer() {
  const drawerLinks = document.getElementById("navDrawerLinks");
  const source = document.getElementById("navLinks");
  if (!drawerLinks || !source) return;
  drawerLinks.innerHTML = "";
  source.querySelectorAll(".nav-link").forEach((btn) => {
    if (!shouldCloneNavLink(btn, source)) return;
    const clone = btn.cloneNode(true);
    clone.classList.remove("app-tab");
    clone.classList.add("nav-link--drawer");
    clone.style.display = "";
    clone.addEventListener("click", (e) => {
      e.preventDefault();
      const routeName = clone.getAttribute("data-route");
      closeNavDrawer();
      const go = () => {
        if (!routeName) return;
        if (MOBILE_PUBLIC_DRAWER_ROUTES.has(routeName) && typeof window.route === "function") {
          window.route(routeName);
          return;
        }
        if (typeof window.routeWithAuth === "function") {
          window.routeWithAuth(routeName);
        } else if (typeof window.route === "function") {
          window.route(routeName);
        }
      };
      requestAnimationFrame(() => requestAnimationFrame(go));
    });
    drawerLinks.appendChild(clone);
  });
}

function wireDrawerAuth() {
  const slot = document.getElementById("navDrawerAuth");
  if (!slot) return;

  const signedIn = window._clerkUser || window.Clerk?.user;
  slot.innerHTML = "";

  if (signedIn) {
    const dash = document.createElement("button");
    dash.type = "button";
    dash.className = "auth-signup-btn nav-drawer-dashboard";
    dash.textContent = "Open Dashboard";
    dash.addEventListener("click", () => {
      closeNavDrawer();
      if (typeof window.routeWithAuth === "function") window.routeWithAuth("dashboard");
      else if (typeof window.route === "function") window.route("dashboard");
    });
    slot.appendChild(dash);
    return;
  }

  const signedOut = document.getElementById("authSignedOut");
  if (!signedOut) return;

  const signIn = signedOut.querySelector(".auth-signin-btn");
  const signUp = signedOut.querySelector(".auth-signup-btn");
  if (signIn) {
    const b = signIn.cloneNode(true);
    b.classList.remove("auth-signin-btn");
    b.classList.add("nav-drawer-signin");
    b.addEventListener("click", async () => {
      closeNavDrawer();
      if (typeof window.clerkSignIn === "function") {
        await window.clerkSignIn();
        return;
      }
      await ensureClerkReady();
      window.Clerk?.openSignIn?.();
    });
    slot.appendChild(b);
  }
  if (signUp) {
    const b = signUp.cloneNode(true);
    b.classList.remove("auth-signup-btn");
    b.classList.add("nav-drawer-signup", "nav-drawer-signup-secondary");
    b.addEventListener("click", async () => {
      closeNavDrawer();
      if (typeof window.clerkSignUp === "function") {
        await window.clerkSignUp();
        return;
      }
      await ensureClerkReady();
      window.Clerk?.openSignUp?.();
    });
    slot.appendChild(b);
  }
}

/** Refresh drawer auth CTAs after Clerk sign-in/out. */
export function refreshMobileDrawerAuth() {
  if (!isMobileConversionViewport()) return;
  wireDrawerAuth();
}

function openNavDrawer() {
  const drawer = document.getElementById("navDrawer");
  const btn = document.getElementById("navMenuBtn");
  if (!drawer || !btn) return;
  cloneLinksIntoDrawer();
  wireDrawerAuth(); // always rebuild — reflects signed-in state
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

  const drawer = document.getElementById("navDrawer");
  const closeBtn = document.getElementById("navDrawerClose");
  const backdrop = document.getElementById("navDrawerBackdrop");

  if (document.documentElement.dataset.mobileNavInit === "1") return closeNavDrawer;
  document.documentElement.dataset.mobileNavInit = "1";

  document.addEventListener("click", (e) => {
    const menuBtn = e.target.closest("#navMenuBtn");
    if (menuBtn) {
      e.preventDefault();
      if (drawer?.classList.contains("is-open")) closeNavDrawer();
      else openNavDrawer();
      return;
    }
    if (e.target.closest("#navDrawerClose") || e.target.closest("#navDrawerBackdrop")) {
      closeNavDrawer();
    }
  });

  closeBtn?.addEventListener("click", closeNavDrawer);
  backdrop?.addEventListener("click", closeNavDrawer);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeNavDrawer();
  });

  window.addEventListener("resize", syncMobileConversionFlag, { passive: true });

  return closeNavDrawer;
}

function bootMobileNav() {
  initMobileNav();
  initMobileCtaHandlers();
  window.BrieftickMobileNav = {
    refreshDrawerAuth: refreshMobileDrawerAuth,
    closeDrawer: closeNavDrawer,
  };
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootMobileNav);
  } else {
    bootMobileNav();
  }
}
