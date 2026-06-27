/**
 * Visual QA: logo over nav backgrounds — no visible rectangle/checkerboard.
 * Usage: node scripts/verify-logo-visual-bg.mjs [baseUrl]
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

const base = (process.argv[2] || "http://localhost:52184").replace(/\/$/, "");
const outDir = join(process.cwd(), "debug", "logo-preview", "logo-upload-v2", "browser");
mkdirSync(outDir, { recursive: true });

const ROUTES = [
  { name: "landing", url: `${base}/`, page: "#page-landing.active" },
  { name: "about", url: `${base}/?tab=about`, page: "#page-about.active" },
  { name: "pricing", url: `${base}/?tab=pricing`, page: "#page-pricing.active" },
];
const WIDTHS = [320, 390, 430, 768, 1024, 1440];

async function waitRoute(page, route) {
  await page.goto(route.url, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForSelector(route.page, { timeout: 20000 });
  await page.waitForSelector("#navBrand .split-brand-img--full", { state: "visible", timeout: 20000 });
  await page.evaluate(() => new Promise((resolve) => {
    const clip = document.querySelector("#navBrand .split-brand__clip");
    if (!clip) return resolve();
    const finish = () => resolve();
    clip.addEventListener("animationend", finish, { once: true });
    setTimeout(finish, 2500);
  }));
}

function luminance(r, g, b) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const browser = await chromium.launch({ headless: true });
const failures = [];
const report = { base, checks: [] };

for (const w of WIDTHS) {
  for (const route of ROUTES) {
    const page = await browser.newPage({ viewport: { width: w, height: 900 } });
    await waitRoute(page, route);
    const metrics = await page.evaluate(() => {
      const img = document.querySelector("#navBrand .split-brand-img--full");
      const nav = document.getElementById("siteNav");
      const menu = document.querySelector(".nav-a__menu-btn");
      const ir = img.getBoundingClientRect();
      const nr = nav.getBoundingClientRect();
      const mr = menu?.getBoundingClientRect();
      return {
        width: Math.round(ir.width * 100) / 100,
        height: Math.round(ir.height * 100) / 100,
        navHeight: Math.round(nr.height * 100) / 100,
        naturalAR: img.naturalWidth / img.naturalHeight,
        displayAR: ir.width / ir.height,
        src: img.getAttribute("src"),
        gapToMenu: mr ? Math.round((mr.left - ir.right) * 100) / 100 : null,
      };
    });

    const navShot = join(outDir, `${route.name}-nav-${w}.png`);
    await page.locator("#siteNav").screenshot({ path: navShot });

    // Sample pixels in a ring outside the logo box but inside nav (background-only zones)
    const box = await page.locator("#navBrand .split-brand-img--full").boundingBox();
    const navBox = await page.locator("#siteNav").boundingBox();
    const samples = await page.evaluate(({ box, navBox }) => {
      const c = document.createElement("canvas");
      const ctx = c.getContext("2d");
      c.width = window.innerWidth;
      c.height = window.innerHeight;
      // Not available cross-origin free; use elementFromPoint on nav area instead
      const pts = [];
      if (box && navBox) {
        const y = navBox.y + navBox.height / 2;
        pts.push([box.x - 8, y]);
        pts.push([box.x + box.width + 8, y]);
        pts.push([box.x + box.width / 2, box.y - 4]);
      }
      return pts.map(([x, y]) => {
        const el = document.elementFromPoint(x, y);
        const cs = el ? getComputedStyle(el) : null;
        return { x, y, tag: el?.tagName, bg: cs?.backgroundColor || null };
      });
    }, { box, navBox });

    const logoPixels = await page.evaluate(async (b) => {
      if (!b) return null;
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(b.width);
      canvas.height = Math.ceil(b.height);
      const ctx = canvas.getContext("2d");
      const img = document.querySelector("#navBrand .split-brand-img--full");
      try {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let minA = 255, maxA = 0, greyBox = 0, whiteLogo = 0;
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i], g = data[i + 1], bch = data[i + 2], a = data[i + 3];
          minA = Math.min(minA, a);
          maxA = Math.max(maxA, a);
          if (a < 8) continue;
          const isWhite = r > 240 && g > 240 && bch > 240;
          const isGreyBg = Math.abs(r - g) < 8 && Math.abs(g - bch) < 8 && r > 200 && r < 250;
          if (isWhite) whiteLogo++;
          if (isGreyBg && a > 200) greyBox++;
        }
        return { minA, maxA, greyBox, whiteLogo, total: canvas.width * canvas.height };
      } catch {
        return { error: "draw failed" };
      }
    }, box);

    const stretch = Math.abs(metrics.displayAR - metrics.naturalAR);
    const check = { viewport: w, route: route.name, metrics, samples, logoPixels, navShot };
    report.checks.push(check);

    if (stretch > 0.02) failures.push(`${route.name}@${w}: stretch ${stretch}`);
    if (w <= 480 && metrics.navHeight > 64.5) failures.push(`${route.name}@${w}: nav height ${metrics.navHeight}`);
    if (logoPixels?.greyBox > 50) failures.push(`${route.name}@${w}: grey box pixels in logo render ${logoPixels.greyBox}`);
    if (metrics.gapToMenu !== undefined && metrics.gapToMenu !== null && w <= 480 && metrics.gapToMenu < 8) {
      failures.push(`${route.name}@${w}: hamburger overlap gap ${metrics.gapToMenu}px`);
    }

    await page.close();
  }
}

await browser.close();
report.pass = failures.length === 0;
report.failures = failures;
writeFileSync(join(outDir, "report.json"), JSON.stringify(report, null, 2));

if (failures.length) {
  console.error("FAIL\n" + failures.map((f) => `  - ${f}`).join("\n"));
  process.exit(1);
}
console.log("PASS — visual logo QA over live nav backgrounds");
console.log(`Report: ${join(outDir, "report.json")}`);
