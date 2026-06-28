/**
 * Measure logo intrinsic vs rendered resolution, DPR, and effective upscale factor.
 * Usage: node scripts/probe-logo-resolution.mjs [baseUrl]
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

const base = (process.argv[2] || "http://localhost:52184").replace(/\/$/, "");
const outDir = join(process.cwd(), "debug", "logo-quality-probe");
mkdirSync(outDir, { recursive: true });

const WIDTHS = [320, 390, 430, 768, 1024, 1440];
const DPRS = [1, 2, 3];

const browser = await chromium.launch({ headless: true });
const rows = [];

for (const dpr of DPRS) {
  for (const w of WIDTHS) {
    const page = await browser.newPage({
      viewport: { width: w, height: 900 },
      deviceScaleFactor: dpr,
    });
    await page.goto(`${base}/`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForSelector("#page-landing.active", { timeout: 20000 });
    await page.waitForSelector("#navBrand .split-brand-img--full", { state: "visible", timeout: 20000 });
    await page.evaluate(() => new Promise((resolve) => {
      const clip = document.querySelector("#navBrand .split-brand__clip");
      if (!clip) return resolve();
      const finish = () => resolve();
      clip.addEventListener("animationend", finish, { once: true });
      setTimeout(finish, 2500);
    }));

    const m = await page.evaluate(() => {
      const img = document.querySelector("#navBrand .split-brand-img--full");
      const cs = getComputedStyle(img);
      const ir = img.getBoundingClientRect();
      const layoutW = img.offsetWidth;
      const layoutH = img.offsetHeight;
      const transform = cs.transform;
      let scaleX = 1;
      let scaleY = 1;
      if (transform && transform !== "none") {
        const m3 = transform.match(/matrix3d\(([^)]+)\)/);
        const m2 = transform.match(/matrix\(([^)]+)\)/);
        const parts = (m3?.[1] || m2?.[1] || "").split(",").map((v) => parseFloat(v.trim()));
        if (parts.length >= 4) {
          scaleX = parts[0];
          scaleY = parts[3];
        }
      }
      return {
        naturalW: img.naturalWidth,
        naturalH: img.naturalHeight,
        layoutW,
        layoutH,
        renderedW: ir.width,
        renderedH: ir.height,
        scaleX,
        scaleY,
        imageRendering: cs.imageRendering,
        dpr: window.devicePixelRatio,
        src: img.currentSrc || img.src,
      };
    });

    const physicalW = m.renderedW * m.dpr;
    const physicalH = m.renderedH * m.dpr;
    const intrinsicToPhysical = m.naturalW / physicalW;
    const layoutToRendered = m.renderedW / m.layoutW;

    rows.push({
      viewport: w,
      dpr,
      ...m,
      physicalW: Math.round(physicalW * 100) / 100,
      physicalH: Math.round(physicalH * 100) / 100,
      intrinsicToPhysical: Math.round(intrinsicToPhysical * 1000) / 1000,
      layoutToRendered: Math.round(layoutToRendered * 1000) / 1000,
      upscalingViaTransform: layoutToRendered > 1.001,
      sufficientForRetina: m.naturalW >= physicalW,
    });

    if (dpr === 2 && (w === 390 || w === 1440)) {
      await page.locator("#navBrand .split-brand-img--full").screenshot({
        path: join(outDir, `logo-${w}@${dpr}x.png`),
      });
    }

    await page.close();
  }
}

await browser.close();

const report = {
  base,
  probedAt: new Date().toISOString(),
  summary: {
    assetIntrinsic: `${rows[0]?.naturalW}×${rows[0]?.naturalH}`,
    transformUpscaleDesktop: rows.find((r) => r.viewport === 1440 && r.dpr === 1)?.scaleX,
    transformUpscaleMobile: rows.find((r) => r.viewport === 390 && r.dpr === 1)?.scaleX,
  },
  rows,
};

writeFileSync(join(outDir, "report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report.summary, null, 2));
console.log(`Wrote ${join(outDir, "report.json")}`);
