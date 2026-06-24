#!/usr/bin/env node
/**
 * Mobile nav regression check — drawer links + routing at 390/412/430px.
 */
import { chromium } from "playwright";

const BASE = (process.argv[2] || "https://www.forgeniq.com").replace(/\/$/, "");
const WIDTHS = [390, 412, 430];

async function checkViewport(browser, width) {
  const page = await browser.newPage();
  const result = { width, errors: [] };

  page.on("pageerror", (e) => result.errors.push(e.message));

  await page.setViewportSize({ width, height: 844 });
  await page.goto(BASE + "/", { waitUntil: "load", timeout: 90000 });
  await page.waitForTimeout(4000);

  await page.click("#navMenuBtn");
  await page.waitForTimeout(500);

  result.drawerLinks = await page.evaluate(() => {
    const links = [...document.querySelectorAll("#navDrawerLinks .nav-link")];
    return links.map((el) => ({
      route: el.getAttribute("data-route"),
      text: el.textContent.trim().replace(/\s+/g, " "),
      visible: (() => {
        const st = getComputedStyle(el);
        return st.display !== "none" && st.visibility !== "hidden" && el.offsetParent !== null;
      })(),
    }));
  });

  result.hasHome = result.drawerLinks.some((l) => l.route === "landing" && l.visible);
  result.hasPricing = result.drawerLinks.some((l) => l.route === "pricing" && l.visible);
  result.hasAbout = result.drawerLinks.some((l) => l.route === "about" && l.visible);

  // Pricing route
  await page.click("#navDrawerLinks .nav-link[data-route='pricing']");
  await page.waitForTimeout(1500);
  result.pricingRoute = await page.evaluate(() => ({
    activeRoute: window._activeRoute,
    pageActive: document.getElementById("page-pricing")?.classList.contains("active"),
    pageDisplay: document.getElementById("page-pricing")
      ? getComputedStyle(document.getElementById("page-pricing")).display
      : null,
    pageOpacity: document.getElementById("page-pricing")
      ? getComputedStyle(document.getElementById("page-pricing")).opacity
      : null,
    splitPricing: document.documentElement.hasAttribute("data-split-pricing"),
    splitLanding: document.documentElement.hasAttribute("data-split-landing"),
    pricingVisible: (() => {
      const el = document.querySelector("#page-pricing .pricing, #page-pricing .tier-grid");
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return r.height > 0 && r.width > 0;
    })(),
    scrollHeight: document.documentElement.scrollHeight,
    bodyScrollHeight: document.body.scrollHeight,
    hScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  }));

  // About route
  await page.goto(BASE + "/", { waitUntil: "load", timeout: 90000 });
  await page.waitForTimeout(3000);
  await page.click("#navMenuBtn");
  await page.waitForTimeout(400);
  await page.click("#navDrawerLinks .nav-link[data-route='about']");
  await page.waitForTimeout(2000);
  if (width === 390) {
    await page.screenshot({
      path: `reports/mobile-about-diagnosis/verify-about-${width}.png`,
      fullPage: true,
    });
  }
  result.aboutRoute = await page.evaluate(() => {
    const mission = document.querySelector("#about-mission h2");
    const topEl = document.elementFromPoint(195, 320);
    const mount = document.querySelector("#splitAboutMount");
    return {
      activeRoute: window._activeRoute,
      pageActive: document.getElementById("page-about")?.classList.contains("active"),
      pageDisplay: document.getElementById("page-about")
        ? getComputedStyle(document.getElementById("page-about")).display
        : null,
      pageZIndex: document.getElementById("page-about")
        ? getComputedStyle(document.getElementById("page-about")).zIndex
        : null,
      splitAbout: document.documentElement.hasAttribute("data-split-about"),
      splitLanding: document.documentElement.hasAttribute("data-split-landing"),
      mobileBgMounted: !!mount?.querySelector(".cw-mobile-bg"),
      mountPosition: mount ? getComputedStyle(mount).position : null,
      democratiseText: mission?.textContent?.trim() ?? null,
      democratiseVisible:
        !!mission &&
        mission.getBoundingClientRect().height > 0 &&
        getComputedStyle(mission).opacity !== "0" &&
        getComputedStyle(mission).visibility !== "hidden",
      bodyIncludesDemocratise: document.body.innerText.includes("Democratise market intelligence"),
      elementFromPoint: topEl
        ? `${topEl.tagName}.${(topEl.className || "").toString().split(" ")[0] || ""}`
        : null,
      aboutVisible: (() => {
        const el = document.querySelector("#page-about .about-wrap");
        if (!el) return false;
        const r = el.getBoundingClientRect();
        return r.height > 0 && r.width > 0;
      })(),
      scrollHeight: document.documentElement.scrollHeight,
      hScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  });

  // Direct hash/tab routes
  await page.goto(BASE + "/?tab=pricing", { waitUntil: "load", timeout: 90000 });
  await page.waitForTimeout(3000);
  result.directPricing = await page.evaluate(() => window._activeRoute === "pricing");

  await page.goto(BASE + "/?tab=about", { waitUntil: "load", timeout: 90000 });
  await page.waitForTimeout(3000);
  result.directAbout = await page.evaluate(() => window._activeRoute === "about");

  // Desktop nav check at 1280
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(BASE + "/", { waitUntil: "load", timeout: 90000 });
  await page.waitForTimeout(2000);
  result.desktopNav = await page.evaluate(() => {
    const links = [...document.querySelectorAll("#navLinks .nav-link")];
    return {
      pricing: links.some((l) => l.dataset.route === "pricing" && getComputedStyle(l).display !== "none"),
      about: links.some((l) => l.dataset.route === "about" && getComputedStyle(l).display !== "none"),
    };
  });

  await page.close();
  result.pass =
    result.hasHome &&
    result.hasPricing &&
    result.hasAbout &&
    result.pricingRoute?.activeRoute === "pricing" &&
    result.pricingRoute?.pageActive &&
    result.pricingRoute?.pricingVisible &&
    result.aboutRoute?.activeRoute === "about" &&
    result.aboutRoute?.pageActive &&
    result.aboutRoute?.aboutVisible &&
    result.aboutRoute?.bodyIncludesDemocratise &&
    result.aboutRoute?.democratiseVisible &&
    result.aboutRoute?.mobileBgMounted &&
    result.directPricing &&
    result.directAbout &&
    result.desktopNav?.pricing &&
    result.desktopNav?.about;

  return result;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const reports = [];
  for (const w of WIDTHS) {
    reports.push(await checkViewport(browser, w));
  }
  await browser.close();

  const pass = reports.every((r) => r.pass);
  console.log(JSON.stringify({ pass, baseUrl: BASE, reports }, null, 2));
  process.exit(pass ? 0 : 1);
}

main();
