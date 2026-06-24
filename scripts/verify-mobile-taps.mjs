#!/usr/bin/env node
/** Verify mobile taps hit correct elements and fire actions. */
import { chromium } from "playwright";

const BASE = "https://www.forgeniq.com";
const VPS = [
  { id: "iphone-13", width: 390, height: 844 },
  { id: "iphone-15-pro", width: 430, height: 932 },
  { id: "samsung-s24", width: 412, height: 915 },
];

async function probe(page, selector, label) {
  return page.evaluate(
    ({ selector, label }) => {
      const el = document.querySelector(selector);
      if (!el) return { label, found: false };
      const r = el.getBoundingClientRect();
      const x = Math.round(r.left + r.width / 2);
      const y = Math.round(r.top + r.height / 2);
      const top = document.elementFromPoint(x, y);
      const btnPe = getComputedStyle(el).pointerEvents;
      const hitsTarget = top === el || el.contains(top);
      return {
        label,
        found: true,
        hitsTarget,
        btnPe,
        topTag: top?.tagName,
        topCls: (top?.className?.toString?.() || "").slice(0, 50),
        center: { x, y },
      };
    },
    { selector, label }
  );
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const results = [];

  for (const vp of VPS) {
    const page = await browser.newPage();
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto(BASE + "/", { waitUntil: "load", timeout: 90000 });
    await page.waitForTimeout(5000);

    const landing = {
      startFreeNav: await probe(page, ".nav-a__end .auth-signup-btn", "Start Free nav"),
      startFreeHero: await probe(page, ".cw-hero-cta-btn[data-split-action='signup']", "Start Free hero"),
      exploreDash: await probe(page, ".cw-hero-cta-btn[data-split-action='demo']", "Explore Dashboard"),
    };

    let routeAfterExplore = null;
    page.on("dialog", (d) => d.dismiss().catch(() => {}));
    await page.evaluate(() => {
      window.__btTestRoute = null;
      const orig = window.route;
      window.route = function (n) {
        window.__btTestRoute = n;
        return orig?.(n);
      };
    });
    const exploreBtn = page.locator(".cw-hero-cta-btn[data-split-action='demo']");
    if (await exploreBtn.count()) {
      await exploreBtn.click({ timeout: 5000 });
      await page.waitForTimeout(800);
      routeAfterExplore = await page.evaluate(() => window.__btTestRoute);
    }

    await page.click("#navMenuBtn");
    await page.waitForTimeout(500);
    const drawer = {
      open: await page.evaluate(() => document.getElementById("navDrawer")?.classList.contains("is-open")),
      home: await probe(page, "#navDrawerLinks .nav-link[data-route='landing']", "Home"),
      about: await probe(page, "#navDrawerLinks .nav-link[data-route='about']", "About"),
      pricing: await probe(page, "#navDrawerLinks .nav-link[data-route='pricing']", "Pricing"),
    };

    let routeAfterAbout = null;
    const aboutLink = page.locator("#navDrawerLinks .nav-link[data-route='about']");
    if (await aboutLink.count()) {
      await aboutLink.click({ timeout: 5000 });
      await page.waitForTimeout(800);
      routeAfterAbout = await page.evaluate(() => window._activeRoute || window.__btTestRoute);
    }

    results.push({ viewport: vp.id, landing, routeAfterExplore, drawer, routeAfterAbout });
    await page.close();
  }

  await browser.close();
  const pass = results.every(
    (r) =>
      r.landing.startFreeNav.hitsTarget &&
      r.landing.startFreeHero.hitsTarget &&
      r.landing.startFreeHero.btnPe === "auto" &&
      r.landing.exploreDash.hitsTarget &&
      r.routeAfterExplore === "dashboard" &&
      r.drawer.open &&
      r.drawer.about.hitsTarget &&
      r.routeAfterAbout === "about"
  );
  console.log(JSON.stringify({ pass, results }, null, 2));
}

main();
