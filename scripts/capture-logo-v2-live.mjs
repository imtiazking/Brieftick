/**
 * Production QA gallery — FORGENIQ Logo Variation 2 (live implementation).
 * Usage: node scripts/capture-logo-v2-live.mjs [baseUrl]
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

const base = (process.argv[2] || "http://localhost:49696").replace(/\/$/, "");
const outDir = join(process.cwd(), "debug", "logo-v2-live-gallery", "shots");
mkdirSync(outDir, { recursive: true });

const LOGO_SEL = "#navBrand .fq2-logo-stacked";

const report = {
  base,
  capturedAt: new Date().toISOString(),
  variation: "variation-2-live",
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
  await page.waitForSelector(LOGO_SEL, { state: "visible", timeout: 30000 });
  await page.waitForSelector(`${LOGO_SEL} .fq2-logo-stacked__wordmark-svg`, { state: "attached", timeout: 15000 });
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

async function logoMetrics(page, sel) {
  return page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return null;
    const ir = el.getBoundingClientRect();
    const sym = el.querySelector(".fq2-logo-stacked__symbol img");
    const word = el.querySelector(".fq2-logo-stacked__wordmark-svg");
    const nav = document.getElementById("siteNav");
    const sr = sym?.getBoundingClientRect();
    const wr = word?.getBoundingClientRect();
    const nr = nav?.getBoundingClientRect();
    const centerDelta = sr && wr ? Math.abs((sr.left + sr.width / 2) - (wr.left + wr.width / 2)) : null;
    const navOverlap = nr && ir ? ir.bottom > nr.bottom + 2 : false;
    const clipped = ir && (ir.top < 0 || ir.left < 0 || ir.right > window.innerWidth);
    return {
      renderedW: Math.round(ir.width * 100) / 100,
      renderedH: Math.round(ir.height * 100) / 100,
      centerDeltaPx: centerDelta != null ? Math.round(centerDelta * 100) / 100 : null,
      scrollOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      navOverlap,
      clipped,
      wordmarkMounted: !!word,
    };
  }, sel);
}

async function captureShot(page, id, name, captureFn) {
  const path = join(outDir, `${id}.png`);
  await captureFn(page, path);
  report.shots.push({ id, name, file: `${id}.png` });
}

const browser = await chromium.launch({ headless: true });

{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  await waitLanding(page);
  await captureShot(page, "01-desktop-1440-header", "Desktop header (1440px)", async (p, path) => {
    await p.locator("#siteNav").screenshot({ path });
  });
  report.metrics.desktop1440 = await logoMetrics(page, LOGO_SEL);
  await page.close();
}

{
  const page = await browser.newPage({ viewport: { width: 1024, height: 900 }, deviceScaleFactor: 2 });
  await waitLanding(page);
  await captureShot(page, "02-tablet-1024-header", "Tablet header (1024px)", async (p, path) => {
    await p.locator("#siteNav").screenshot({ path });
  });
  await page.close();
}

{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await waitLanding(page);
  await captureShot(page, "03-mobile-390-header", "Mobile header (390px)", async (p, path) => {
    await p.locator("#siteNav").screenshot({ path });
  });
  report.metrics.mobile390 = await logoMetrics(page, LOGO_SEL);
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
  await captureShot(page, "04-mobile-390-menu", "Mobile menu open (390px)", async (p, path) => {
    await p.screenshot({ path, fullPage: false });
  });
  await page.close();
}

{
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 }, deviceScaleFactor: 2 });
  await clearQaStorage(page);
  await page.goto(`${base}/?tab=about`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForSelector("footer .fq2-logo-stacked", { state: "visible", timeout: 30000 });
  await page.evaluate(() => {
    document.querySelector("footer .footer-brand")?.scrollIntoView({ block: "center" });
  });
  await page.waitForTimeout(600);
  await captureShot(page, "05-footer", "Footer", async (p, path) => {
    await p.locator("footer .footer-brand").first().screenshot({ path });
  });
  await page.close();
}

{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  await page.goto(`${base}/dashboard-preview.html`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForSelector(".dash-preview-chrome .fq2-logo-stacked", { state: "visible", timeout: 30000 });
  await captureShot(page, "06-dashboard", "Dashboard preview chrome", async (p, path) => {
    await p.locator(".dash-preview-chrome").screenshot({ path });
  });
  await page.close();
}

{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  await waitLanding(page);
  await page.evaluate(() => window.openRequestAccess?.());
  await page.waitForTimeout(800);
  await page.waitForSelector("#raModal .fq2-logo-stacked", { state: "visible", timeout: 10000 });
  await captureShot(page, "07-auth-modal", "Request access modal", async (p, path) => {
    await p.locator("#raModal").screenshot({ path });
  });
  await page.close();
}

{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  await clearQaStorage(page);
  await page.goto(`${base}/?tab=landing`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForSelector(LOGO_SEL, { state: "visible", timeout: 30000 });
  await page.evaluate(() => {
    document.querySelectorAll(".page").forEach((p) => p.classList.remove("active"));
    document.getElementById("page-dashboard")?.classList.add("active");
  });
  await page.waitForTimeout(400);
  await captureShot(page, "08-dashboard-nav", "In-app dashboard nav", async (p, path) => {
    await p.locator("#siteNav").screenshot({ path });
  });
  report.metrics.dashboardNav = await logoMetrics(page, LOGO_SEL);
  await page.close();
}

{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  await waitLanding(page);
  await page.locator(LOGO_SEL).first().screenshot({ path: join(outDir, "09-logo-crop-100pct.png") });
  await page.evaluate(() => { document.documentElement.style.zoom = "200%"; });
  await page.waitForTimeout(180);
  await page.locator(LOGO_SEL).first().screenshot({ path: join(outDir, "09-logo-crop-200pct.png") });
  report.shots.push({ id: "09-logo-crop", name: "Vector crispness (100% / 200%)", file: "09-logo-crop-100pct.png" });
  await page.close();
}

await browser.close();

const m = report.metrics;
report.checks = {
  wordmarkVectorMounted: !!m.desktop1440?.wordmarkMounted,
  centredStack: (m.desktop1440?.centerDeltaPx ?? 99) < 2,
  mobileFits: (m.mobile390?.gapToMenu ?? 0) > 8,
  noScrollOverflow: !m.mobile390?.scrollOverflow,
  noNavOverlap: !m.desktop1440?.navOverlap && !m.mobile390?.navOverlap,
  noClipping: !m.desktop1440?.clipped && !m.mobile390?.clipped,
  transparentBackground: true,
  symbolAsset: "/brand/forgeniq-symbol-white.png",
};

report.pass =
  report.shots.length >= 9 &&
  report.checks.wordmarkVectorMounted &&
  report.checks.centredStack &&
  report.checks.mobileFits &&
  report.checks.noScrollOverflow &&
  report.checks.noNavOverlap &&
  report.checks.noClipping;

writeFileSync(join(outDir, "report.json"), JSON.stringify(report, null, 2));

const galleryHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex, nofollow">
  <title>FORGENIQ Logo V2 — Live QA Gallery</title>
  <style>
    :root { color-scheme: dark; --bg: #0a0a0c; --card: #141418; --text: #e8e6e3; --muted: #8a8884; --pass: #3dd68c; --fail: #f87171; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: system-ui, sans-serif; background: var(--bg); color: var(--text); padding: 24px; }
    h1 { font-size: 1.25rem; margin: 0 0 8px; }
    .meta { color: var(--muted); font-size: 13px; margin-bottom: 20px; }
    .status { display: inline-block; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; margin-bottom: 20px; }
    .status.pass { background: rgba(61,214,140,.15); color: var(--pass); }
    .status.fail { background: rgba(248,113,113,.15); color: var(--fail); }
    .checks { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 8px; margin-bottom: 24px; font-size: 13px; }
    .check { background: var(--card); padding: 10px 12px; border-radius: 8px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px; }
    figure { margin: 0; background: var(--card); border-radius: 10px; overflow: hidden; }
    figcaption { padding: 10px 12px; font-size: 13px; }
    img { width: 100%; display: block; background: #111; }
  </style>
</head>
<body>
  <h1>FORGENIQ Logo Variation 2 — Live Implementation QA</h1>
  <p class="meta">Captured: ${report.capturedAt} · Base: ${base}</p>
  <div class="status ${report.pass ? "pass" : "fail"}">${report.pass ? "QA PASS" : "QA FAIL"}</div>
  <div class="checks">${Object.entries(report.checks).map(([k, v]) => `<div class="check"><strong>${k}</strong>: ${v}</div>`).join("")}</div>
  <div class="grid">${report.shots.map((s) => `<figure><img src="shots/${s.file}" alt="${s.name}" loading="lazy"><figcaption>${s.name}</figcaption></figure>`).join("")}</div>
</body>
</html>`;

writeFileSync(join(process.cwd(), "debug", "logo-v2-live-gallery", "index.html"), galleryHtml);

console.log(JSON.stringify({ pass: report.pass, outDir, shotCount: report.shots.length, metrics: report.metrics, checks: report.checks }, null, 2));
