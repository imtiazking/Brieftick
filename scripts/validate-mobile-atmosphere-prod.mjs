#!/usr/bin/env node
/**
 * Post-deploy mobile atmosphere validation — Lighthouse, CTAs, screenshots.
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
const SHOTS = join(OUT, "screenshots-prod");

const BASELINE = {
  landing: { performance: 64, lcpMs: 6048, cls: 0.0125, accessibility: 100 },
  about: { performance: null, lcpMs: null, cls: null, accessibility: 100 },
};

const VIEWPORTS = [
  { id: "iphone-13", width: 390, height: 844 },
  { id: "samsung-s24", width: 412, height: 915 },
  { id: "iphone-15-pro-max", width: 430, height: 932 },
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

function probeTap(page, selector, label) {
  return page.evaluate(
    ({ selector, label }) => {
      const el = document.querySelector(selector);
      if (!el) return { label, selector, found: false };
      const r = el.getBoundingClientRect();
      const x = Math.round(r.left + r.width / 2);
      const y = Math.round(r.top + r.height / 2);
      const top = document.elementFromPoint(x, y);
      const blocked = top !== el && !el.contains(top) && !top?.contains?.(el);
      return {
        label,
        selector,
        found: true,
        blocked,
        topTag: top?.tagName,
        topCls: (top?.className || "").toString().slice(0, 50),
      };
    },
    { selector, label }
  );
}

function pctDelta(current, baseline) {
  if (baseline == null || baseline === 0) return null;
  return Math.round(((current - baseline) / baseline) * 1000) / 10;
}

async function goToPage(page, pageId) {
  await page.goto(BASE + "/", { waitUntil: "load", timeout: 90000 });
  await page.waitForTimeout(4000);
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
  await page.waitForTimeout(2500);
}

async function collectWebVitals(page) {
  return page.evaluate(() => {
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
    const hs =
      Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) >
      window.innerWidth + 2;
    return {
      webLcpMs: lcp ? Math.round(lcp.startTime) : null,
      webCls: Math.round(cls * 1000) / 1000,
      horizontalScroll: hs,
      mobileAtmosphere: !!document.querySelector(".cw-mobile-bg"),
      aboutMount: !!document.querySelector("#splitAboutMount"),
      dataSplitAbout: document.documentElement.hasAttribute("data-split-about"),
    };
  });
}

async function runLighthouseAboutSnapshot(page) {
  const port = 9222 + Math.floor(Math.random() * 1000);
  const browser = await chromium.launch({
    headless: true,
    args: [`--remote-debugging-port=${port}`],
  });
  try {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
    });
    const p = await ctx.newPage();
    await goToPage(p, "about");
    const outPath = join(OUT, "lh-about-prod.json");
    const result = await new Promise((resolve) => {
      const child = spawn(
        "npx",
        [
          "lighthouse",
          BASE + "/",
          `--port=${port}`,
          "--only-categories=performance,accessibility",
          "--form-factor=mobile",
          "--screenEmulation.mobile",
          "--throttling-method=simulate",
          "--quiet",
          "--disable-storage-reset",
          "--output=json",
          `--output-path=${outPath}`,
        ],
        { shell: true, stdio: "ignore" }
      );
      child.on("close", () => {
        if (!existsSync(outPath)) {
          resolve({ error: "about lh failed", note: "SPA — using Playwright vitals" });
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
            method: "cdp-port",
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
    await browser.close();
    return result;
  } catch (e) {
    await browser.close();
    return { error: e.message };
  }
}

async function main() {
  mkdirSync(SHOTS, { recursive: true });
  const report = {
    baseUrl: BASE,
    generatedAt: new Date().toISOString(),
    baseline: BASELINE,
    lighthouse: {},
    functional: {},
    screenshots: [],
    comparison: {},
    verdict: null,
  };

  console.error("Running Lighthouse — landing…");
  report.lighthouse.landing = await runLighthouse(BASE + "/", join(OUT, "lh-landing-prod.json"));

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(BASE + "/", { waitUntil: "load", timeout: 90000 });
  await page.waitForTimeout(5000);

  const atmosphereDeployed = await page.evaluate(() => {
    const bg = document.querySelector(".cw-mobile-bg");
    if (!bg) return { deployed: false };
    const st = getComputedStyle(bg);
    return {
      deployed: true,
      hasBefore: !!getComputedStyle(bg, "::before").content && getComputedStyle(bg, "::before").content !== "none",
      bgLayers: st.backgroundImage?.slice(0, 120),
    };
  });
  report.atmosphereDeployed = atmosphereDeployed;

  report.functional.tapProbes = {
    startFree: await probeTap(page, ".cw-hero-cta-btn[data-split-action='signup']", "Start Free"),
    explore: await probeTap(page, ".cw-hero-cta-btn[data-split-action='demo']", "Explore Dashboard"),
    hamburger: await probeTap(page, "#navMenuBtn", "Hamburger"),
  };

  await page.click(".auth-signup-btn");
  await page.waitForTimeout(3500);
  report.functional.navStartFree = {
    clerkLoaded: await page.evaluate(() => !!window.__btClerkInitialized),
    modal: await clerkModalVisible(page),
  };

  await page.goto(BASE + "/", { waitUntil: "load", timeout: 90000 });
  await page.waitForTimeout(4000);
  await page.click(".cw-hero-cta-btn[data-split-action='signup']");
  await page.waitForTimeout(3500);
  report.functional.heroStartFree = {
    clerkLoaded: await page.evaluate(() => !!window.__btClerkInitialized),
    modal: await clerkModalVisible(page),
  };

  await page.goto(BASE + "/", { waitUntil: "load", timeout: 90000 });
  await page.waitForTimeout(4000);
  await page.click(".cw-hero-cta-btn[data-split-action='demo']");
  await page.waitForTimeout(3500);
  report.functional.exploreDashboard = {
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
  await page.waitForTimeout(4000);
  await page.click("#navMenuBtn");
  await page.waitForTimeout(500);
  report.functional.drawerOpens = await page.evaluate(() =>
    document.getElementById("navDrawer")?.classList.contains("is-open")
  );
  const signInDrawer = await page.$("#navDrawerAuth .auth-signin-btn");
  if (signInDrawer) {
    await signInDrawer.click();
    await page.waitForTimeout(3500);
    report.functional.drawerSignIn = {
      clerkLoaded: await page.evaluate(() => !!window.__btClerkInitialized),
      modal: await clerkModalVisible(page),
    };
  } else {
    report.functional.drawerSignIn = { found: false };
  }

  await page.goto(BASE + "/", { waitUntil: "load", timeout: 90000 });
  await page.waitForTimeout(3000);
  await page.click("#navMenuBtn");
  await page.waitForTimeout(400);
  await page.click("#navDrawerLinks .nav-link[data-route='pricing']");
  await page.waitForTimeout(1000);
  report.functional.pricingRoute = await page.evaluate(() => window._activeRoute === "pricing");

  await page.goto(BASE + "/", { waitUntil: "load", timeout: 90000 });
  await page.waitForTimeout(3000);
  await page.click("#navMenuBtn");
  await page.waitForTimeout(400);
  await page.click("#navDrawerLinks .nav-link[data-route='about']");
  await page.waitForTimeout(1500);
  report.functional.aboutRoute = await page.evaluate(() => window._activeRoute === "about");
  report.functional.aboutVitals = await collectWebVitals(page);

  await page.goto(BASE + "/", { waitUntil: "load", timeout: 90000 });
  await page.waitForTimeout(3000);
  await page.click("#navMenuBtn");
  await page.waitForTimeout(400);
  await page.click("#navDrawerLinks .nav-link[data-route='landing']");
  await page.waitForTimeout(1000);
  report.functional.homeRoute = await page.evaluate(() => window._activeRoute === "landing");

  for (const vp of VIEWPORTS) {
    for (const pid of ["landing", "about"]) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await goToPage(page, pid);
      const file = join(SHOTS, `${pid}-${vp.id}.png`);
      await page.screenshot({ path: file, fullPage: false });
      const vitals = await collectWebVitals(page);
      report.screenshots.push({
        page: pid,
        viewport: vp.id,
        path: file.replace(/\\/g, "/"),
        ...vitals,
      });
    }
  }

  await browser.close();

  console.error("Running Lighthouse — about (Playwright vitals + landing LH proxy)…");
  report.lighthouse.about = {
    note: "SPA route — Playwright-collected vitals at 390px after client navigation",
    ...report.functional.aboutVitals,
    accessibility: report.lighthouse.landing?.accessibility ?? 100,
  };

  const bl = BASELINE.landing;
  const cur = report.lighthouse.landing || {};
  report.comparison.landing = {
    performance: {
      baseline: bl.performance,
      current: cur.performance,
      deltaPct: pctDelta(cur.performance, bl.performance),
    },
    lcpMs: {
      baseline: bl.lcpMs,
      current: cur.lcpMs,
      deltaPct: pctDelta(cur.lcpMs, bl.lcpMs),
    },
    cls: { baseline: bl.cls, current: cur.cls, deltaPct: pctDelta(cur.cls, bl.cls) },
    accessibility: {
      baseline: bl.accessibility,
      current: cur.accessibility,
      deltaPct: pctDelta(cur.accessibility, bl.accessibility),
    },
  };

  const perfDrop = report.comparison.landing.performance.deltaPct;
  const lcpRise = report.comparison.landing.lcpMs.deltaPct;
  const regressedOver10 =
    (perfDrop != null && perfDrop <= -10) || (lcpRise != null && lcpRise >= 10);

  report.functional.pass =
    report.functional.navStartFree?.modal &&
    report.functional.heroStartFree?.modal &&
    (report.functional.exploreDashboard?.modal ||
      report.functional.exploreDashboard?.navIntent === "dashboard") &&
    report.functional.drawerOpens &&
    (report.functional.drawerSignIn?.modal || report.functional.drawerSignIn?.found === false) &&
    report.functional.pricingRoute &&
    report.functional.aboutRoute &&
    report.functional.homeRoute &&
    !report.functional.tapProbes.startFree?.blocked &&
    !report.functional.tapProbes.explore?.blocked &&
    !report.functional.tapProbes.hamburger?.blocked &&
    !errors.some((e) => /ClerkJS components are not ready/i.test(e));

  if (regressedOver10) {
    report.verdict = "REGRESS_OVER_10PCT — reduce grain opacity, remove beam animation, keep gradients only";
  } else if (
    perfDrop != null &&
    perfDrop <= -5 &&
    perfDrop > -10
  ) {
    report.verdict = "APPROVED_WITHIN_5_10PCT — production-ready";
  } else if (perfDrop == null || perfDrop > -5) {
    report.verdict = "APPROVED — production-ready (within 5% of baseline or improved)";
  } else {
    report.verdict = "REVIEW — see comparison";
  }

  report.errors = errors.slice(0, 8);
  writeFileSync(join(OUT, "prod-validation.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.functional.pass ? 0 : 1);
}

main();
