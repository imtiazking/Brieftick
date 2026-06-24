#!/usr/bin/env node
/**
 * Mobile CTA smoke — 390px production checks.
 */
import { chromium } from "playwright";

const BASE = (process.argv[2] || "https://www.forgeniq.com").replace(/\/$/, "");

function clerkModalVisible(page) {
  return page.evaluate(() => {
    const sel = [
      ".cl-modalBackdrop",
      ".cl-modalContent",
      ".cl-rootBox",
      "[class*='cl-modal']",
      "#clerk-components",
    ].join(",");
    const el = document.querySelector(sel);
    if (!el) return false;
    const st = getComputedStyle(el);
    return st.display !== "none" && st.visibility !== "hidden" && st.opacity !== "0";
  });
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  const checks = {};

  page.on("pageerror", (e) => errors.push(e.message));

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(BASE + "/", { waitUntil: "load", timeout: 90000 });
  await page.waitForTimeout(5000);

  await page.click(".auth-signup-btn");
  await page.waitForTimeout(4000);
  checks.navStartFree = {
    clerkLoaded: await page.evaluate(() => !!window.Clerk && !!window.__btClerkInitialized),
    openSignUp: await page.evaluate(() => typeof window.Clerk?.openSignUp === "function"),
    modal: await clerkModalVisible(page),
  };

  await page.goto(BASE + "/", { waitUntil: "load", timeout: 90000 });
  await page.waitForTimeout(4000);
  await page.click(".cw-hero-cta-btn.mobile-start-free, .cw-hero-cta-btn[data-split-action='signup']");
  await page.waitForTimeout(4000);
  checks.heroStartFree = {
    clerkLoaded: await page.evaluate(() => !!window.__btClerkInitialized),
    modal: await clerkModalVisible(page),
  };

  await page.goto(BASE + "/", { waitUntil: "load", timeout: 90000 });
  await page.waitForTimeout(4000);
  await page.click(".mobile-explore-dashboard, [data-split-action='demo']");
  await page.waitForTimeout(4000);
  checks.exploreDashboard = {
    clerkLoaded: await page.evaluate(() => !!window.__btClerkInitialized),
    modal: await clerkModalVisible(page),
    navIntent: await page.evaluate(() => {
      try {
        return sessionStorage.getItem("bt_nav_intent");
      } catch {
        return null;
      }
    }),
  };

  await page.goto(BASE + "/", { waitUntil: "load", timeout: 90000 });
  await page.waitForTimeout(3000);
  await page.click("#navMenuBtn");
  await page.waitForTimeout(400);
  await page.click("#navDrawerLinks .nav-link[data-route='pricing']");
  await page.waitForTimeout(1000);
  checks.pricingNav = await page.evaluate(() => window._activeRoute === "pricing");

  await browser.close();

  const pass =
    checks.navStartFree.clerkLoaded &&
    checks.navStartFree.modal &&
    checks.heroStartFree.clerkLoaded &&
    checks.heroStartFree.modal &&
    checks.exploreDashboard.clerkLoaded &&
    (checks.exploreDashboard.modal || checks.exploreDashboard.navIntent === "dashboard") &&
    checks.pricingNav &&
    !errors.some((e) => /ClerkJS components are not ready/i.test(e));

  console.log(JSON.stringify({ pass, checks, errors: errors.slice(0, 5), baseUrl: BASE }, null, 2));
  process.exit(pass ? 0 : 1);
}

main();
