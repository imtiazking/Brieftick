/**
 * Side-by-side logo comparison — Variation 2 vs current lockup.
 * Usage: node scripts/capture-logo-variation-2-preview.mjs [baseUrl]
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

const base = (process.argv[2] || "http://localhost:49696").replace(/\/$/, "");
const outDir = join(process.cwd(), "debug", "logo-variation-2-preview", "shots");
mkdirSync(outDir, { recursive: true });

const VARIATION_CSS = "/debug/logo-variation-2-preview/logo-variation-2.css";
const VARIATION_JS = "/debug/logo-variation-2-preview/logo-variation-2.js";
const VARIATION_SEL = "#navBrand .fq2-logo-stacked";

const report = {
  base,
  capturedAt: new Date().toISOString(),
  variation: "variation-2-centred-stacked-vector",
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
  await page.addScriptTag({ url: `${base}/debug/logo-variation-2-preview/forgeniq-wordmark.inline.js` });
  await page.addScriptTag({ url: `${base}${VARIATION_JS}` });
}

async function applyNavVariation(page, mobile = false) {
  await loadVariation(page);
  await page.evaluate((isMobile) => {
    window.FqLogoVariation2.applyVariation({
      navVariant: isMobile ? "fq2-logo-stacked--nav-mobile" : "fq2-logo-stacked--nav-marketing",
    });
  }, mobile);
  await page.waitForTimeout(500);
}

async function applyContext(page, context) {
  await loadVariation(page);
  await page.evaluate((ctx) => window.FqLogoVariation2.applyVariation({ context: ctx }), context);
  await page.waitForTimeout(400);
}

async function logoMetrics(page, sel) {
  return page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return null;
    const ir = el.getBoundingClientRect();
    const sym = el.querySelector(".fq2-logo-stacked__symbol img");
    const word = el.querySelector(".fq2-logo-stacked__wordmark-svg");
    const sr = sym?.getBoundingClientRect();
    const wr = word?.getBoundingClientRect();
    const centerDelta = sr && wr ? Math.abs((sr.left + sr.width / 2) - (wr.left + wr.width / 2)) : null;
    return {
      renderedW: Math.round(ir.width * 100) / 100,
      renderedH: Math.round(ir.height * 100) / 100,
      centerDeltaPx: centerDelta != null ? Math.round(centerDelta * 100) / 100 : null,
      scrollOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    };
  }, sel);
}

async function captureLogoCrop(page, prefix, sel, label) {
  await page.evaluate(() => { document.documentElement.style.zoom = "100%"; });
  await page.waitForTimeout(120);
  await page.locator(sel).first().screenshot({ path: join(outDir, `${prefix}-${label}-crop-100pct.png`) });
  await page.evaluate(() => { document.documentElement.style.zoom = "200%"; });
  await page.waitForTimeout(180);
  await page.locator(sel).first().screenshot({ path: join(outDir, `${prefix}-${label}-crop-200pct.png`) });
  await page.evaluate(() => { document.documentElement.style.zoom = "100%"; });
}

async function capturePair(page, { id, name, capture, applyVariationFn, metricsSel }) {
  const currentPath = join(outDir, `${id}-current.png`);
  const variationPath = join(outDir, `${id}-variation2.png`);
  await capture(page, currentPath, false);
  const currentMetrics = metricsSel ? await logoMetrics(page, metricsSel.current) : null;
  await applyVariationFn(page);
  await capture(page, variationPath, true);
  const variationMetrics = metricsSel ? await logoMetrics(page, metricsSel.variation) : null;
  report.shots.push({
    id,
    name,
    current: `${id}-current.png`,
    variation2: `${id}-variation2.png`,
    currentMetrics,
    variationMetrics,
  });
}

const browser = await chromium.launch({ headless: true });

{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  await waitLanding(page);
  await capturePair(page, {
    id: "01-desktop-1440-header",
    name: "Desktop header (1440px)",
    capture: async (p, path) => { await p.locator("#siteNav").screenshot({ path }); },
    applyVariationFn: (p) => applyNavVariation(p, false),
    metricsSel: { current: "#navBrand .split-brand-img--full", variation: VARIATION_SEL },
  });
  report.metrics.desktop1440 = await logoMetrics(page, VARIATION_SEL);
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitLanding(page);
  await captureLogoCrop(page, "01-desktop-1440", "#navBrand .split-brand-img--full", "current");
  await applyNavVariation(page, false);
  await captureLogoCrop(page, "01-desktop-1440", VARIATION_SEL, "variation2");
  await page.close();
}

{
  const page = await browser.newPage({ viewport: { width: 1024, height: 900 }, deviceScaleFactor: 2 });
  await waitLanding(page);
  await capturePair(page, {
    id: "02-tablet-1024-header",
    name: "Tablet header (1024px)",
    capture: async (p, path) => { await p.locator("#siteNav").screenshot({ path }); },
    applyVariationFn: (p) => applyNavVariation(p, false),
    metricsSel: { current: "#navBrand .split-brand-img--full", variation: VARIATION_SEL },
  });
  await page.close();
}

{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await waitLanding(page);
  await capturePair(page, {
    id: "03-mobile-390-header",
    name: "Mobile header (390px)",
    capture: async (p, path) => { await p.locator("#siteNav").screenshot({ path }); },
    applyVariationFn: (p) => applyNavVariation(p, true),
    metricsSel: { current: "#navBrand .split-brand-img--full", variation: VARIATION_SEL },
  });
  report.metrics.mobile390 = await logoMetrics(page, VARIATION_SEL);
  report.metrics.mobile390.gapToMenu = await page.evaluate(() => {
    const logo = document.querySelector("#navBrand .fq2-logo-stacked");
    const menu = document.querySelector(".nav-a__menu-btn");
    return logo && menu ? Math.round((menu.getBoundingClientRect().left - logo.getBoundingClientRect().right) * 100) / 100 : null;
  });
  await page.close();
}

{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await waitLanding(page);
  await page.locator("#navMenuBtn").click();
  await page.waitForTimeout(500);
  await capturePair(page, {
    id: "04-mobile-390-menu",
    name: "Mobile menu open (390px)",
    capture: async (p, path) => { await p.screenshot({ path, fullPage: false }); },
    applyVariationFn: (p) => applyNavVariation(p, true),
  });
  await page.close();
}

{
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 }, deviceScaleFactor: 2 });
  await clearQaStorage(page);
  await page.goto(`${base}/?tab=about`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    document.documentElement.removeAttribute("data-split-landing");
    document.querySelector("footer .footer-brand")?.scrollIntoView({ block: "center" });
  });
  await page.waitForTimeout(600);
  const footerBrand = page.locator("footer .footer-brand").first();
  await capturePair(page, {
    id: "05-footer",
    name: "Footer",
    capture: async (p, path) => { await footerBrand.screenshot({ path }); },
    applyVariationFn: (p) => applyContext(p, "footer"),
    metricsSel: { current: "footer img[src*='forgeniq-logo']", variation: "footer .fq2-logo-stacked" },
  });
  await page.close();
}

{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  await page.goto(`${base}/dashboard-preview.html`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForSelector(".dash-preview-chrome .split-brand-img", { state: "visible", timeout: 30000 });
  await capturePair(page, {
    id: "06-dashboard",
    name: "Dashboard",
    capture: async (p, path) => { await p.locator(".dash-preview-chrome").screenshot({ path }); },
    applyVariationFn: (p) => applyContext(p, "dashboard"),
    metricsSel: { current: ".dash-preview-chrome .split-brand-img", variation: ".dash-preview-chrome .fq2-logo-stacked" },
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(".dash-preview-chrome .split-brand-img", { state: "visible", timeout: 30000 });
  await captureLogoCrop(page, "06-dashboard", ".dash-preview-chrome .split-brand-img", "current");
  await applyContext(page, "dashboard");
  await captureLogoCrop(page, "06-dashboard", ".dash-preview-chrome .fq2-logo-stacked", "variation2");
  await page.close();
}

{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  await waitLanding(page);
  await page.evaluate(() => window.openRequestAccess?.());
  await page.waitForTimeout(800);
  await capturePair(page, {
    id: "07-auth-modal",
    name: "Authentication / request access modal",
    capture: async (p, path) => { await p.locator("#raModal").screenshot({ path }); },
    applyVariationFn: (p) => applyContext(p, "auth"),
    metricsSel: { current: "#raModal img[src*='forgeniq-logo']", variation: "#raModal .fq2-logo-stacked" },
  });
  await page.close();
}

{
  const page = await browser.newPage({ viewport: { width: 800, height: 480 }, deviceScaleFactor: 2 });
  await page.goto(`${base}/debug/logo-variation-2-preview/standalone.html`, { waitUntil: "domcontentloaded" });
  for (const [panel, id] of [["#panel-dark", "08-standalone-dark"], ["#panel-white", "09-standalone-white"]]) {
    await page.evaluate(() => { document.body.classList.remove("capture-variation2"); document.body.classList.add("capture-current"); });
    await page.locator(`${panel} .side-by-side`).screenshot({ path: join(outDir, `${id}-current.png`) });
    await page.evaluate(() => { document.body.classList.remove("capture-current"); document.body.classList.add("capture-variation2"); });
    await page.locator(`${panel} .side-by-side`).screenshot({ path: join(outDir, `${id}-variation2.png`) });
    report.shots.push({ id, current: `${id}-current.png`, variation2: `${id}-variation2.png` });
  }
  await page.close();
}

{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await waitLanding(page);
  await captureLogoCrop(page, "03-mobile-390", "#navBrand .split-brand-img--full", "current");
  await applyNavVariation(page, true);
  await captureLogoCrop(page, "03-mobile-390", VARIATION_SEL, "variation2");
  await page.close();
}

await browser.close();

report.checks = {
  symbolUnchanged: "forgeniq-symbol-white.png (approved extract)",
  wordmarkVector: "forgeniq-wordmark.svg Inter Tight 900 paths",
  centredStack: (report.metrics.desktop1440?.centerDeltaPx ?? 99) < 2,
  mobileFits: (report.metrics.mobile390?.gapToMenu ?? 0) > 8,
  noScrollOverflow: !report.metrics.mobile390?.scrollOverflow,
  previewOnly: true,
};

report.pass = report.shots.length >= 9 && report.checks.centredStack && report.checks.mobileFits;

writeFileSync(join(outDir, "report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ pass: report.pass, outDir, shotCount: report.shots.length, metrics: report.metrics, checks: report.checks }, null, 2));
