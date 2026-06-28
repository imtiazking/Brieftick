/**
 * QA: logo sharpness at 200% zoom + rendered size parity after hi-res asset swap.
 * Usage: node scripts/verify-logo-sharpness.mjs [baseUrl]
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

const base = (process.argv[2] || "http://localhost:52184").replace(/\/$/, "");
const outDir = join(process.cwd(), "debug", "logo-quality-probe", "qa");
mkdirSync(outDir, { recursive: true });

const WIDTHS = [320, 390, 1440];
const browser = await chromium.launch({ headless: true });
const report = { base, checks: [], pass: true };

for (const w of WIDTHS) {
  for (const dpr of [1, 2]) {
    const page = await browser.newPage({
      viewport: { width: w, height: 900 },
      deviceScaleFactor: dpr,
    });
    await page.goto(`${base}/`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForSelector("#page-landing.active", { timeout: 20000 });
    await page.waitForSelector("#navBrand .split-brand-img--full", { state: "visible", timeout: 20000 });
    await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 1500)));

    const metrics = await page.evaluate(() => {
      const img = document.querySelector("#navBrand .split-brand-img--full");
      const ir = img.getBoundingClientRect();
      return {
        naturalW: img.naturalWidth,
        naturalH: img.naturalHeight,
        renderedW: Math.round(ir.width * 100) / 100,
        renderedH: Math.round(ir.height * 100) / 100,
        src: img.currentSrc || img.src,
      };
    });

    await page.evaluate(() => {
      document.documentElement.style.zoom = "200%";
    });
    await page.waitForTimeout(300);

    const shot = join(outDir, `logo-${w}@${dpr}x-200pct.png`);
    await page.locator("#navBrand .split-brand-img--full").screenshot({ path: shot });

    const check = {
      viewport: w,
      dpr,
      ...metrics,
      screenshot: shot,
      hiResAsset: metrics.naturalW >= 4096,
    };
    if (!check.hiResAsset) report.pass = false;
    report.checks.push(check);
    await page.close();
  }
}

await browser.close();
writeFileSync(join(outDir, "report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ pass: report.pass, checks: report.checks.map((c) => ({ w: c.viewport, dpr: c.dpr, natural: `${c.naturalW}×${c.naturalH}`, rendered: `${c.renderedW}×${c.renderedH}` })) }, null, 2));
