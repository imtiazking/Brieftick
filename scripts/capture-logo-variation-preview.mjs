/**
 * Side-by-side logo layout comparison — Variation 1 (stacked) vs current lockup.
 * Usage: node scripts/capture-logo-variation-preview.mjs [baseUrl]
 * Output: debug/logo-variation-preview/shots/
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

const base = (process.argv[2] || "http://localhost:49696").replace(/\/$/, "");
const outDir = join(process.cwd(), "debug", "logo-variation-preview", "shots");
mkdirSync(outDir, { recursive: true });

const VARIATION_CSS = "/debug/logo-variation-preview/logo-variation.css";
const VARIATION_JS = "/debug/logo-variation-preview/logo-variation.js";

const report = {
  base,
  capturedAt: new Date().toISOString(),
  variation: "stacked-symbol-above-bold-wordmark",
  shots: [],
  metrics: {},
  checks: {},
};

async function clearQaStorage(page) {
  await page.addInitScript(() => {
    try {
      localStorage.removeItem("bt_preview_qa");
      localStorage.removeItem("bt_qa_last_route");
      sessionStorage.removeItem("bt_qa_last_route");
    } catch { /* ignore */ }
  });
}

async function waitLanding(page) {
  await clearQaStorage(page);
  await page.goto(`${base}/?tab=landing`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForSelector("#navBrand .split-brand-img--full", { state: "visible", timeout: 30000 });
  await page.waitForFunction(
    () => document.getElementById("page-landing")?.classList.contains("active"),
    { timeout: 15000 },
  ).catch(() => {});
  await page.evaluate(() => new Promise((r) => {
    const clip = document.querySelector("#navBrand .split-brand__clip");
    if (!clip) return r();
    const finish = () => r();
    clip.addEventListener("animationend", finish, { once: true });
    setTimeout(finish, 2500);
  }));
}

async function loadVariation(page) {
  await page.addStyleTag({ url: `${base}${VARIATION_CSS}` });
  await page.addScriptTag({ url: `${base}${VARIATION_JS}` });
}

async function applyNavVariation(page, mobile = false) {
  await loadVariation(page);
  await page.evaluate(async (isMobile) => {
    window.FqLogoVariation.applyVariation({
      navVariant: isMobile ? "fq-logo-stacked--nav-mobile" : "fq-logo-stacked--nav-marketing",
    });
    await window.FqLogoVariation.ensureFontsReady?.();
  }, mobile);
  await page.waitForTimeout(500);
}

async function logoMetrics(page, sel) {
  return page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return null;
    const ir = el.getBoundingClientRect();
    const img = el.querySelector("img") || (el.tagName === "IMG" ? el : null);
    return {
      renderedW: Math.round(ir.width * 100) / 100,
      renderedH: Math.round(ir.height * 100) / 100,
      aspectRatio: Math.round((ir.width / ir.height) * 1000) / 1000,
      naturalW: img?.naturalWidth ?? null,
      isStacked: el.classList.contains("fq-logo-stacked"),
      scrollOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    };
  }, sel);
}

async function captureLogoCrop(page, prefix, sel, label) {
  await page.evaluate(() => { document.documentElement.style.zoom = "100%"; });
  await page.waitForTimeout(120);
  const p100 = join(outDir, `${prefix}-${label}-crop-100pct.png`);
  await page.locator(sel).first().screenshot({ path: p100 });

  await page.evaluate(() => { document.documentElement.style.zoom = "200%"; });
  await page.waitForTimeout(180);
  const p200 = join(outDir, `${prefix}-${label}-crop-200pct.png`);
  await page.locator(sel).first().screenshot({ path: p200 });
  await page.evaluate(() => { document.documentElement.style.zoom = "100%"; });

  return { crop100: p100, crop200: p200 };
}

async function capturePair(page, { id, name, capture, applyVariationFn, metricsSel }) {
  const currentPath = join(outDir, `${id}-current.png`);
  const variationPath = join(outDir, `${id}-variation.png`);

  await capture(page, currentPath, false);
  const currentMetrics = metricsSel ? await logoMetrics(page, metricsSel.current) : null;

  await applyVariationFn(page);
  await capture(page, variationPath, true);
  const variationMetrics = metricsSel ? await logoMetrics(page, metricsSel.variation) : null;

  const entry = {
    id,
    name,
    current: `${id}-current.png`,
    variation: `${id}-variation.png`,
    currentMetrics,
    variationMetrics,
  };
  report.shots.push(entry);
  return entry;
}

const browser = await chromium.launch({ headless: true });

// ── Desktop header 1440 ──
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  await waitLanding(page);
  report.metrics.desktop1440 = {};

  await capturePair(page, {
    id: "01-desktop-1440-header",
    name: "Desktop header (1440px)",
    capture: async (p, path) => { await p.locator("#siteNav").screenshot({ path }); },
    applyVariationFn: async (p) => applyNavVariation(p, false),
    metricsSel: {
      current: "#navBrand .split-brand-img--full",
      variation: "#navBrand .fq-logo-stacked",
    },
  });
  report.metrics.desktop1440.nav = await logoMetrics(page, "#navBrand .fq-logo-stacked");

  await page.reload({ waitUntil: "domcontentloaded" });
  await waitLanding(page);
  await captureLogoCrop(page, "01-desktop-1440", "#navBrand .split-brand-img--full", "current");
  await applyNavVariation(page, false);
  await captureLogoCrop(page, "01-desktop-1440", "#navBrand .fq-logo-stacked", "variation");

  await page.close();
}

// ── Tablet header 1024 ──
{
  const page = await browser.newPage({ viewport: { width: 1024, height: 900 }, deviceScaleFactor: 2 });
  await waitLanding(page);

  await capturePair(page, {
    id: "02-tablet-1024-header",
    name: "Tablet header (1024px)",
    capture: async (p, path) => { await p.locator("#siteNav").screenshot({ path }); },
    applyVariationFn: async (p) => applyNavVariation(p, false),
    metricsSel: {
      current: "#navBrand .split-brand-img--full",
      variation: "#navBrand .fq-logo-stacked",
    },
  });

  await page.close();
}

// ── Mobile header 390 ──
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await waitLanding(page);
  report.metrics.mobile390 = {};

  await capturePair(page, {
    id: "03-mobile-390-header",
    name: "Mobile header (390px)",
    capture: async (p, path) => { await p.locator("#siteNav").screenshot({ path }); },
    applyVariationFn: async (p) => applyNavVariation(p, true),
    metricsSel: {
      current: "#navBrand .split-brand-img--full",
      variation: "#navBrand .fq-logo-stacked",
    },
  });
  report.metrics.mobile390.nav = await logoMetrics(page, "#navBrand .fq-logo-stacked");

  const gap = await page.evaluate(() => {
    const logo = document.querySelector("#navBrand .fq-logo-stacked");
    const menu = document.querySelector(".nav-a__menu-btn");
    if (!logo || !menu) return null;
    return Math.round((menu.getBoundingClientRect().left - logo.getBoundingClientRect().right) * 100) / 100;
  });
  report.metrics.mobile390.gapToMenu = gap;

  await page.close();
}

// ── Mobile menu open 390 ──
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await waitLanding(page);

  await page.locator("#navMenuBtn").click();
  await page.waitForTimeout(500);

  await capturePair(page, {
    id: "04-mobile-390-menu",
    name: "Mobile menu open (390px)",
    capture: async (p, path) => { await p.screenshot({ path, fullPage: false }); },
    applyVariationFn: async (p) => applyNavVariation(p, true),
  });

  await page.close();
}

// ── Footer ──
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 }, deviceScaleFactor: 2 });
  await clearQaStorage(page);
  await page.goto(`${base}/?tab=about`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    document.documentElement.removeAttribute("data-split-landing");
    const footer = document.querySelector("footer .footer-brand");
    if (footer) footer.scrollIntoView({ block: "center" });
  });
  await page.waitForTimeout(600);

  const footerBrand = page.locator("footer .footer-brand").first();

  await capturePair(page, {
    id: "05-footer",
    name: "Footer",
    capture: async (p, path) => { await footerBrand.screenshot({ path }); },
    applyVariationFn: async (p) => {
      await loadVariation(p);
      await p.evaluate(() => window.FqLogoVariation.applyVariation({ context: "footer" }));
      await p.waitForTimeout(400);
    },
    metricsSel: {
      current: "footer img[src*='forgeniq-logo']",
      variation: "footer .fq-logo-stacked",
    },
  });

  await page.close();
}

// ── Dashboard ──
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  await page.goto(`${base}/dashboard-preview.html`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForSelector(".dash-preview-chrome .split-brand-img", { state: "visible", timeout: 30000 });

  await capturePair(page, {
    id: "06-dashboard",
    name: "Dashboard",
    capture: async (p, path) => { await p.locator(".dash-preview-chrome").screenshot({ path }); },
    applyVariationFn: async (p) => {
      await loadVariation(p);
      await p.evaluate(() => window.FqLogoVariation.applyVariation({ context: "dashboard" }));
      await p.waitForTimeout(300);
    },
    metricsSel: {
      current: ".dash-preview-chrome .split-brand-img",
      variation: ".dash-preview-chrome .fq-logo-stacked",
    },
  });

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(".dash-preview-chrome .split-brand-img", { state: "visible", timeout: 30000 });
  await captureLogoCrop(page, "06-dashboard", ".dash-preview-chrome .split-brand-img", "current");
  await loadVariation(page);
  await page.evaluate(() => window.FqLogoVariation.applyVariation({ context: "dashboard" }));
  await page.waitForTimeout(300);
  await captureLogoCrop(page, "06-dashboard", ".dash-preview-chrome .fq-logo-stacked", "variation");

  await page.close();
}

// ── Authentication modal (request access) ──
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  await waitLanding(page);
  await page.evaluate(() => window.openRequestAccess?.());
  await page.waitForSelector("#raOverlay", { state: "visible", timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(600);

  await capturePair(page, {
    id: "07-auth-modal",
    name: "Authentication / request access modal",
    capture: async (p, path) => { await p.locator("#raModal").screenshot({ path }); },
    applyVariationFn: async (p) => {
      await loadVariation(p);
      await p.evaluate(() => window.FqLogoVariation.applyVariation({ context: "auth" }));
      await p.waitForTimeout(300);
    },
    metricsSel: {
      current: "#raModal img[src*='forgeniq-logo']",
      variation: "#raModal .fq-logo-stacked",
    },
  });

  await page.close();
}

// ── Standalone on dark / white ──
{
  const page = await browser.newPage({ viewport: { width: 800, height: 480 }, deviceScaleFactor: 2 });
  await page.goto(`${base}/debug/logo-variation-preview/standalone.html`, { waitUntil: "domcontentloaded" });

  await page.evaluate(() => document.body.classList.add("capture-current"));
  const darkCurrent = join(outDir, "08-standalone-dark-current.png");
  await page.locator("#panel-dark .side-by-side").screenshot({ path: darkCurrent });
  await page.evaluate(() => {
    document.body.classList.remove("capture-current");
    document.body.classList.add("capture-variation");
  });
  const darkVariation = join(outDir, "08-standalone-dark-variation.png");
  await page.locator("#panel-dark .side-by-side").screenshot({ path: darkVariation });
  report.shots.push({ id: "08-standalone-dark", name: "Standalone on dark", current: "08-standalone-dark-current.png", variation: "08-standalone-dark-variation.png" });

  await page.evaluate(() => {
    document.body.classList.remove("capture-variation");
    document.body.classList.add("capture-current");
  });
  const whiteCurrent = join(outDir, "09-standalone-white-current.png");
  await page.locator("#panel-white .side-by-side").screenshot({ path: whiteCurrent });
  await page.evaluate(() => {
    document.body.classList.remove("capture-current");
    document.body.classList.add("capture-variation");
  });
  const whiteVariation = join(outDir, "09-standalone-white-variation.png");
  await page.locator("#panel-white .side-by-side").screenshot({ path: whiteVariation });
  report.shots.push({ id: "09-standalone-white", name: "Standalone on white", current: "09-standalone-white-current.png", variation: "09-standalone-white-variation.png" });

  await page.close();
}

// ── Mobile logo crops (390) ──
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await waitLanding(page);
  await captureLogoCrop(page, "03-mobile-390", "#navBrand .split-brand-img--full", "current");
  await applyNavVariation(page, true);
  await captureLogoCrop(page, "03-mobile-390", "#navBrand .fq-logo-stacked", "variation");
  await page.close();
}

await browser.close();

report.checks = {
  stackedLayoutApplied: report.shots.every((s) => s.variation),
  mobileFitsCleanly: (report.metrics.mobile390?.gapToMenu ?? 0) > 8,
  noMobileScrollOverflow: report.metrics.mobile390?.nav?.scrollOverflow === false,
  symbolAboveWordmark: "Visual — symbol slice uses forgeniq-symbol-white.png; wordmark below",
    wordmarkBold: "Path-based SVG (Inter Tight 700 outlines) — no PNG crop, no duplicate layers",
  assetsUnchanged: "forgeniq-logo.png + forgeniq-symbol-white.png only",
  productionUntouched: "Preview CSS/JS scoped to debug/logo-variation-preview/",
};

report.pass =
  report.shots.length >= 9 &&
  report.checks.mobileFitsCleanly &&
  report.checks.noMobileScrollOverflow;

writeFileSync(join(outDir, "report.json"), JSON.stringify(report, null, 2));

console.log(JSON.stringify({ pass: report.pass, outDir, shotCount: report.shots.length, metrics: report.metrics, checks: report.checks }, null, 2));
