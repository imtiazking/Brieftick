#!/usr/bin/env node
/**
 * Mobile UX audit — Landing + About
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const BASE = (process.argv[2] || "https://www.forgeniq.com").replace(/\/$/, "");
const OUT = join(ROOT, "reports", "mobile-ux");

const VIEWPORTS = [
  { id: "iphone-13", name: "iPhone 13", width: 390, height: 844 },
  { id: "iphone-15-pro-max", name: "iPhone 15 Pro Max", width: 430, height: 932 },
  { id: "samsung-s24", name: "Samsung S24", width: 412, height: 915 },
  { id: "ipad-mini", name: "iPad Mini", width: 744, height: 1133 },
];

function runLighthouse(url, outPath) {
  return new Promise((resolve) => {
    const child = spawn(
      "npx",
      [
        "lighthouse",
        url,
        "--only-categories=performance,accessibility",
        "--form-factor=mobile",
        "--screenEmulation.mobile",
        "--throttling-method=simulate",
        "--quiet",
        "--chrome-flags=--headless --no-sandbox",
        "--output=json",
        `--output-path=${outPath}`,
      ],
      { shell: true, stdio: "ignore" }
    );
    child.on("close", (code) => {
      if (code !== 0 || !existsSync(outPath)) {
        resolve({ error: `exit ${code}` });
        return;
      }
      try {
        const raw = JSON.parse(readFileSync(outPath, "utf8"));
        const a = raw.audits || {};
        resolve({
          performance: Math.round((raw.categories?.performance?.score || 0) * 100),
          accessibility: Math.round((raw.categories?.accessibility?.score || 0) * 100),
          lcpMs: Math.round(a["largest-contentful-paint"]?.numericValue || 0),
          cls: a["cumulative-layout-shift"]?.numericValue ?? null,
          fcpMs: Math.round(a["first-contentful-paint"]?.numericValue || 0),
        });
      } catch (e) {
        resolve({ error: e.message });
      }
    });
    setTimeout(() => {
      child.kill();
      resolve({ error: "timeout" });
    }, 180000);
  });
}

async function collectPageMetrics(page, pageId) {
  return page.evaluate((pid) => {
    const active = document.querySelector(".page.active");
    const pageEl = document.getElementById(`page-${pid}`) || active;
    const horizontalScroll =
      Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) >
      window.innerWidth + 2;

    const smallText = [];
    for (const el of document.querySelectorAll("body *")) {
      if (!(el instanceof HTMLElement)) continue;
      const st = getComputedStyle(el);
      if (st.display === "none" || st.visibility === "hidden") continue;
      const fs = parseFloat(st.fontSize);
      const text = (el.childNodes.length === 1 && el.childNodes[0].nodeType === 3
        ? el.textContent
        : ""
      ).trim();
      if (text && fs > 0 && fs < 11) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.top < window.innerHeight * 2.5) {
          smallText.push({ fontSize: fs, sample: text.slice(0, 40), cls: el.className?.toString?.().slice(0, 50) });
        }
      }
    }

    const ctas = [...document.querySelectorAll("a, button, .btn-primary, .btn-secondary, .t2-cta, .nav-cta")].filter(
      (el) => {
        const r = el.getBoundingClientRect();
        const t = (el.textContent || "").trim();
        return t.length > 2 && r.width > 36 && r.height > 20;
      }
    );
    const primaryCtas = ctas
      .filter((el) => /get started|try|sign up|launch|dashboard|explore|begin|open|start/i.test(el.textContent || ""))
      .map((el) => {
        const r = el.getBoundingClientRect();
        return {
          text: (el.textContent || "").trim().slice(0, 50),
          top: Math.round(r.top),
          belowFold: r.top >= window.innerHeight - 4,
        };
      });

    const heroH1 = pageEl?.querySelector("h1");
    const heroRect = heroH1?.getBoundingClientRect();
    const heroCta = pageEl?.querySelector(
      ".btn-primary, .t2-cta, .hero-cta, .about-cta-box a, .about-cta-box button, .cw-hero-cta-btn, .about-hero-cta__btn"
    );
    const heroCtaRect = heroCta?.getBoundingClientRect();

    let cls = 0;
    try {
      cls = performance
        .getEntriesByType("layout-shift")
        .filter((e) => !e.hadRecentInput)
        .reduce((s, e) => s + e.value, 0);
    } catch {
      /* */
    }
    const lcpEntries = performance.getEntriesByType("largest-contentful-paint");
    const lcp = lcpEntries[lcpEntries.length - 1];

    const animCount = document.getAnimations?.().length ?? 0;
    const hoverRules = [...document.styleSheets].reduce((n, sheet) => {
      try {
        return n + [...sheet.cssRules].filter((r) => r.selectorText?.includes(":hover")).length;
      } catch {
        return n;
      }
    }, 0);

    return {
      horizontalScroll,
      smallTextCount: smallText.length,
      smallTextSamples: smallText.slice(0, 6),
      primaryCtas,
      heroHeadline: heroH1?.textContent?.trim()?.slice(0, 100),
      heroFontPx: heroH1 ? parseFloat(getComputedStyle(heroH1).fontSize) : null,
      heroVisible: heroRect ? heroRect.top < window.innerHeight && heroRect.bottom > 0 : false,
      heroCtaBelowFold: heroCtaRect ? heroCtaRect.top >= window.innerHeight : null,
      heroCtaTop: heroCtaRect ? Math.round(heroCtaRect.top) : null,
      webLcpMs: lcp?.startTime ? Math.round(lcp.startTime) : null,
      webCls: Math.round(cls * 1000) / 1000,
      animationCount: animCount,
      hoverRuleCount: hoverRules,
      videoCount: document.querySelectorAll("video").length,
      canvasCount: document.querySelectorAll("canvas").length,
      navVisible: !!document.querySelector("nav, .nav, .topnav")?.getBoundingClientRect?.().height,
      hamburgerVisible: !!document.getElementById("navMenuBtn")?.offsetParent,
      navLinksInline: (() => {
        const links = document.querySelector(".nav-a__links");
        if (!links) return null;
        const r = links.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      })(),
      mobileConversionFlag: document.documentElement.hasAttribute("data-mobile-conversion"),
      hudHidden: !document.querySelector(".cw-hud")?.offsetParent,
      pageId: pid,
      activePageId: active?.id,
    };
  }, pageId);
}

async function goToPage(page, pageId) {
  await page.goto(BASE + "/", { waitUntil: "load", timeout: 90000 });
  await page.waitForSelector(`#page-${pageId}`, { state: "attached", timeout: 60000 });
  await page.waitForTimeout(3000);
  await page.evaluate((pid) => {
    try {
      if (typeof window.route === "function") window.route(pid);
      else {
        document.querySelectorAll(".page").forEach((p) => p.classList.remove("active"));
        document.getElementById(`page-${pid}`)?.classList.add("active");
      }
    } catch {
      document.querySelectorAll(".page").forEach((p) => p.classList.remove("active"));
      document.getElementById(`page-${pid}`)?.classList.add("active");
    }
    window.BrieftickSplitLanding?.onSplitRoute?.(pid);
  }, pageId);
  await page.waitForTimeout(2000);
}

async function main() {
  mkdirSync(join(OUT, "screenshots"), { recursive: true });
  const report = {
    baseUrl: BASE,
    generatedAt: new Date().toISOString(),
    lighthouse: {},
    devices: [],
  };

  report.lighthouse.landing = await runLighthouse(BASE + "/", join(OUT, "lh-landing.json"));

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  for (const vp of VIEWPORTS) {
    const device = { ...vp, pages: {} };
    for (const pid of ["landing", "about"]) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await goToPage(page, pid);
      const shot = join(OUT, "screenshots", `${pid}-${vp.id}.png`);
      await page.screenshot({ path: shot, fullPage: false });
      device.pages[pid] = { screenshot: shot.replace(/\\/g, "/"), metrics: await collectPageMetrics(page, pid) };
    }
    report.devices.push(device);
  }

  // About page Playwright perf (post-route)
  await page.setViewportSize({ width: 390, height: 844 });
  await goToPage(page, "about");
  await page.waitForTimeout(1000);
  report.lighthouse.aboutPlaywright = await page.evaluate(() => {
    const lcp = performance.getEntriesByType("largest-contentful-paint").at(-1);
    let cls = 0;
    try {
      cls = performance
        .getEntriesByType("layout-shift")
        .filter((e) => !e.hadRecentInput)
        .reduce((s, e) => s + e.value, 0);
    } catch {
      /* */
    }
    return { webLcpMs: lcp ? Math.round(lcp.startTime) : null, webCls: Math.round(cls * 1000) / 1000 };
  });

  await browser.close();

  const sprintVp = report.devices.filter((d) =>
    ["iphone-13", "samsung-s24", "iphone-15-pro-max"].includes(d.id)
  );
  report.sprintValidation = {
    viewports: sprintVp.map((d) => ({
      id: d.id,
      landing: {
        noHorizontalScroll: !d.pages.landing?.metrics?.horizontalScroll,
        hamburgerVisible: d.pages.landing?.metrics?.hamburgerVisible,
        navLinksHidden: d.pages.landing?.metrics?.navLinksInline === false,
        ctaAboveFold: d.pages.landing?.metrics?.heroCtaBelowFold === false,
        hudHidden: d.pages.landing?.metrics?.hudHidden,
      },
      about: {
        noHorizontalScroll: !d.pages.about?.metrics?.horizontalScroll,
        ctaAboveFold: d.pages.about?.metrics?.heroCtaBelowFold === false,
      },
    })),
    lighthouse: report.lighthouse.landing,
    targets: {
      lighthousePerformanceMin: 80,
      lcpMsMax: 3000,
      clsMax: 0.05,
    },
    pass:
      report.lighthouse.landing?.performance >= 80 &&
      report.lighthouse.landing?.lcpMs <= 3000 &&
      (report.lighthouse.landing?.cls ?? 0) <= 0.05 &&
      sprintVp.every(
        (d) =>
          !d.pages.landing?.metrics?.horizontalScroll &&
          d.pages.landing?.metrics?.hamburgerVisible &&
          d.pages.landing?.metrics?.heroCtaBelowFold === false &&
          !d.pages.about?.metrics?.horizontalScroll &&
          d.pages.about?.metrics?.heroCtaBelowFold === false
      ),
  };

  writeFileSync(join(OUT, "audit-raw.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main();
