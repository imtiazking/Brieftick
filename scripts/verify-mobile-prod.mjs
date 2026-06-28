#!/usr/bin/env node
import { chromium } from "playwright";

const BASE = "https://www.forgeniq.com";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(BASE + "/", { waitUntil: "load", timeout: 90000 });
  await page.waitForTimeout(5000);

  const landing = await page.evaluate(() => ({
    logo: !!document.querySelector(".split-brand-img")?.offsetParent,
    startFree: !!document.querySelector(".nav-a__end .auth-signup-btn")?.offsetParent,
    hamburger: !!document.getElementById("navMenuBtn")?.offsetParent,
    heroCta: document.querySelector(".cw-hero-cta-btn")?.getBoundingClientRect().top < window.innerHeight,
    hudHidden: !document.querySelector(".cw-hud")?.offsetParent,
    tickerVisible: [...document.querySelectorAll(".cw-river")].some((el) => el.offsetParent),
  }));

  await page.click("#navMenuBtn");
  await page.waitForTimeout(400);
  const drawerOpen = await page.evaluate(() =>
    document.getElementById("navDrawer")?.classList.contains("is-open")
  );
  await page.click("#navDrawerClose");
  await page.waitForTimeout(300);
  const drawerClosed = await page.evaluate(() =>
    !document.getElementById("navDrawer")?.classList.contains("is-open")
  );

  await page.evaluate(() => window.route?.("about"));
  await page.waitForTimeout(2000);
  const about = await page.evaluate(() => ({
    ctaAboveFold:
      document.querySelector(".about-hero-cta__btn")?.getBoundingClientRect().top < window.innerHeight,
    horizontalScroll: document.documentElement.scrollWidth > window.innerWidth + 2,
    headlineFontPx: parseFloat(getComputedStyle(document.querySelector(".about-hero h1")).fontSize),
  }));

  await page.goto(BASE + "/", { waitUntil: "load", timeout: 90000 });
  await page.waitForTimeout(3000);
  await page.evaluate(() => window.route?.("dashboard"));
  await page.waitForTimeout(6000);
  const dashboard = await page.evaluate(() => ({
    active: document.getElementById("page-dashboard")?.classList.contains("active"),
    moduleCount: document.querySelectorAll("#page-dashboard .dash-rail-module, #page-dashboard .panel").length,
    quoteRouter: !!window.BrieftickQuoteRouter,
    appModulesDeferred: typeof window.__btLoadAppModules === "function",
  }));

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(BASE + "/", { waitUntil: "load", timeout: 90000 });
  await page.waitForTimeout(4000);
  const desktop = await page.evaluate(() => ({
    hamburgerHidden: !document.getElementById("navMenuBtn")?.offsetParent,
    navLinksVisible: (document.querySelector(".nav-a__links")?.getBoundingClientRect().width || 0) > 100,
    cinematicSnap: !!document.querySelector(".cw--snap"),
    mobileFlagOff: !document.documentElement.hasAttribute("data-mobile-conversion"),
  }));

  await browser.close();
  console.log(
    JSON.stringify({ landing, hamburger: { drawerOpen, drawerClosed }, about, dashboard, desktop }, null, 2)
  );
}

main();
