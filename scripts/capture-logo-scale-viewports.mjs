/**
 * Capture nav screenshots at all QA viewports (+15% scale review).
 * Usage: node scripts/capture-logo-scale-viewports.mjs [baseUrl]
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

const base = (process.argv[2] || "http://localhost:49696").replace(/\/$/, "");
const outDir = join(process.cwd(), "debug", "logo-qa-preview", "viewports");
mkdirSync(outDir, { recursive: true });

const WIDTHS = [320, 390, 430, 768, 1024, 1440];
const browser = await chromium.launch({ headless: true });
const rows = [];

for (const w of WIDTHS) {
  const page = await browser.newPage({ viewport: { width: w, height: 900 }, deviceScaleFactor: 2 });
  await page.addInitScript(() => {
    try {
      localStorage.removeItem("bt_preview_qa");
      localStorage.removeItem("bt_qa_last_route");
      sessionStorage.removeItem("bt_qa_last_route");
    } catch { /* ignore */ }
  });
  await page.goto(`${base}/?tab=landing`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForSelector("#navBrand .split-brand-img--full", { state: "visible", timeout: 30000 });
  await page.waitForTimeout(1200);

  const m = await page.evaluate(() => {
    const img = document.querySelector("#navBrand .split-brand-img--full");
    const nav = document.getElementById("siteNav");
    const menu = document.querySelector(".nav-a__menu-btn");
    const ir = img.getBoundingClientRect();
    const nr = nav.getBoundingClientRect();
    const mr = menu?.getBoundingClientRect();
    return {
      renderedW: Math.round(ir.width * 100) / 100,
      renderedH: Math.round(ir.height * 100) / 100,
      navHeight: Math.round(nr.height * 100) / 100,
      gapToMenu: mr ? Math.round((mr.left - ir.right) * 100) / 100 : null,
      scrollW: document.documentElement.scrollWidth,
      clientW: document.documentElement.clientWidth,
      transform: getComputedStyle(img).transform,
    };
  });

  await page.locator("#siteNav").screenshot({ path: join(outDir, `nav-${w}.png`) });
  rows.push({ viewport: w, ...m, shot: `viewports/nav-${w}.png` });
  await page.close();
}

await browser.close();
writeFileSync(join(outDir, "report.json"), JSON.stringify({ base, rows }, null, 2));
console.log(JSON.stringify(rows, null, 2));
