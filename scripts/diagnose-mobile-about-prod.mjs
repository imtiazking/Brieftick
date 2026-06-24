#!/usr/bin/env node
/**
 * Deep mobile About page diagnostic — DOM, stacking, visibility.
 */
import { chromium } from "playwright";
import { mkdir, writeFile } from "fs/promises";
import path from "path";

const BASE = (process.argv[2] || "https://www.forgeniq.com").replace(/\/$/, "");
const OUT = path.join("reports", "mobile-about-diagnosis");

async function inspectAbout(page) {
  return page.evaluate(() => {
    const pageAbout = document.querySelector("#page-about");
    const pageLanding = document.querySelector("#page-landing");
    const aboutWrap = document.querySelector("#page-about .about-wrap");
    const mission = document.querySelector("#about-mission h2");
    const mount = document.querySelector("#splitAboutMount");
    const x = 195;
    const y = 300;
    const topEl = document.elementFromPoint(x, y);
    const stack = document.elementsFromPoint(x, y).slice(0, 8).map((el) => ({
      tag: el.tagName.toLowerCase(),
      id: el.id || null,
      class: (el.className || "").toString().slice(0, 80) || null,
    }));

    const cs = (el) => {
      if (!el) return null;
      const s = getComputedStyle(el);
      return {
        display: s.display,
        visibility: s.visibility,
        opacity: s.opacity,
        position: s.position,
        zIndex: s.zIndex,
        height: s.height,
        minHeight: s.minHeight,
        overflow: s.overflow,
        overflowY: s.overflowY,
        transform: s.transform,
        pointerEvents: s.pointerEvents,
      };
    };

    const rect = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { top: r.top, left: r.left, width: r.width, height: r.height };
    };

    return {
      url: location.href,
      search: location.search,
      activeRoute: window._activeRoute,
      htmlAttrs: {
        splitLanding: document.documentElement.hasAttribute("data-split-landing"),
        splitAbout: document.documentElement.hasAttribute("data-split-about"),
        splitPricing: document.documentElement.hasAttribute("data-split-pricing"),
        mobileConversion: document.documentElement.hasAttribute("data-mobile-conversion"),
        theme: document.documentElement.getAttribute("data-theme"),
      },
      pageAbout: {
        exists: !!pageAbout,
        className: pageAbout?.className,
        active: pageAbout?.classList.contains("active"),
        style: cs(pageAbout),
        rect: rect(pageAbout),
      },
      pageLanding: {
        active: pageLanding?.classList.contains("active"),
        style: cs(pageLanding),
        rect: rect(pageLanding),
      },
      aboutWrap: {
        style: cs(aboutWrap),
        rect: rect(aboutWrap),
        textLen: aboutWrap?.textContent?.trim().length ?? 0,
      },
      mission: {
        text: mission?.textContent?.trim() ?? null,
        style: cs(mission),
        rect: rect(mission),
        visible: mission ? mission.getBoundingClientRect().height > 0 : false,
      },
      splitAboutMount: {
        exists: !!mount,
        innerHTMLLen: mount?.innerHTML?.length ?? 0,
        style: cs(mount),
        rect: rect(mount),
      },
      elementFromPoint: {
        x,
        y,
        top: topEl
          ? { tag: topEl.tagName, id: topEl.id, class: (topEl.className || "").toString().slice(0, 60) }
          : null,
        stack,
      },
      missionInViewport: mission
        ? (() => {
            const r = mission.getBoundingClientRect();
            return r.top < innerHeight && r.bottom > 0 && r.height > 0;
          })()
        : false,
      bodyTextIncludes: document.body.innerText.includes("Democratise market intelligence"),
      scrollHeight: document.documentElement.scrollHeight,
      innerHeight: window.innerHeight,
    };
  });
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(BASE + "/", { waitUntil: "load", timeout: 90000 });
  await page.waitForTimeout(5000);

  const before = await inspectAbout(page);

  await page.click("#navMenuBtn");
  await page.waitForTimeout(400);
  await page.click("#navDrawerLinks .nav-link[data-route='about']");
  await page.waitForTimeout(2000);

  const afterDrawer = await inspectAbout(page);
  await page.screenshot({ path: path.join(OUT, "about-after-drawer-390.png"), fullPage: true });

  // Direct tab route
  await page.goto(BASE + "/?tab=about", { waitUntil: "load", timeout: 90000 });
  await page.waitForTimeout(3000);
  const afterTab = await inspectAbout(page);
  await page.screenshot({ path: path.join(OUT, "about-tab-route-390.png"), fullPage: true });

  // Compare pricing
  await page.goto(BASE + "/", { waitUntil: "load", timeout: 90000 });
  await page.waitForTimeout(3000);
  await page.click("#navMenuBtn");
  await page.waitForTimeout(300);
  await page.click("#navDrawerLinks .nav-link[data-route='pricing']");
  await page.waitForTimeout(1500);
  const pricing = await page.evaluate(() => {
    const el = document.querySelector("#page-pricing .pricing-head h1, #page-pricing .pricing");
    return {
      activeRoute: window._activeRoute,
      pricingActive: document.getElementById("page-pricing")?.classList.contains("active"),
      text: el?.textContent?.slice(0, 80),
      rect: el?.getBoundingClientRect(),
      topAt300: document.elementFromPoint(195, 300)?.tagName,
    };
  });
  await page.screenshot({ path: path.join(OUT, "pricing-after-drawer-390.png"), fullPage: true });

  await browser.close();

  const report = {
    baseUrl: BASE,
    errors,
    before,
    afterDrawer,
    afterTab,
    pricing,
    pass:
      afterDrawer.bodyTextIncludes &&
      afterDrawer.mission?.text?.includes("Democratise") &&
      afterDrawer.missionInViewport &&
      afterTab.bodyTextIncludes,
  };

  await writeFile(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.pass ? 0 : 1);
}

main();
