/**
 * Before/after rollback comparison gallery (preview only — no deploy).
 * Usage: node scripts/capture-rollback-preview.mjs [currentUrl] [rollbackUrl]
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

const currentUrl = (process.argv[2] || "http://localhost:49696").replace(/\/$/, "");
const rollbackUrl = (process.argv[3] || "http://localhost:49697").replace(/\/$/, "");
const outDir = join(process.cwd(), "debug", "rollback-preview");
mkdirSync(outDir, { recursive: true });

const VIEWS = [
  { id: "landing-desktop", path: "/?tab=landing", width: 1440, height: 900, label: "Landing · desktop" },
  { id: "landing-mobile", path: "/?tab=landing", width: 390, height: 844, label: "Landing · mobile 390" },
  { id: "about-desktop", path: "/?tab=about", width: 1440, height: 900, label: "About · desktop" },
  { id: "about-mobile", path: "/?tab=about", width: 390, height: 844, label: "About · mobile 390" },
  { id: "pricing-desktop", path: "/?tab=pricing", width: 1440, height: 900, label: "Pricing · desktop" },
];

const report = {
  capturedAt: new Date().toISOString(),
  currentUrl,
  rollbackUrl,
  recommendedCommit: "f06210f",
  shots: [],
};

async function captureSet(page, base, tag, prefix) {
  for (const v of VIEWS) {
    await page.setViewportSize({ width: v.width, height: v.height });
    await page.goto(`${base}${v.path}`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForTimeout(1500);
    const navSel = "#siteNav, .nav-a";
    const heroSel = "#page-landing.active, #page-about.active, #page-pricing.active";
    await page.waitForSelector(heroSel, { timeout: 15000 }).catch(() => {});
    const navPath = join(outDir, `${prefix}-${v.id}-nav.png`);
    const pagePath = join(outDir, `${prefix}-${v.id}-hero.png`);
    await page.locator(navSel).first().screenshot({ path: navPath }).catch(async () => {
      await page.screenshot({ path: navPath, fullPage: false });
    });
    await page.screenshot({ path: pagePath, fullPage: false });
    const metrics = await page.evaluate(() => {
      const logo = document.querySelector("#navBrand .split-brand-img--full, #navBrand img");
      const lr = logo?.getBoundingClientRect();
      const nav = document.querySelector("#siteNav, .nav-a")?.getBoundingClientRect();
      return {
        logoW: lr ? Math.round(lr.width) : null,
        logoH: lr ? Math.round(lr.height) : null,
        navH: nav ? Math.round(nav.height) : null,
        hasV2: !!document.querySelector(".fq2-logo-stacked, link[href*='forgeniq-logo-v2']"),
        logoTransform: logo ? getComputedStyle(logo).transform : null,
      };
    });
    report.shots.push({ tag, view: v.id, label: v.label, nav: `${prefix}-${v.id}-nav.png`, hero: `${prefix}-${v.id}-hero.png`, metrics });
  }
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ deviceScaleFactor: 2 });
await captureSet(page, currentUrl, "current", "current");
await captureSet(page, rollbackUrl, "rollback-f06210f", "rollback");
await browser.close();

const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Rollback preview · f06210f vs current</title>
<style>
  body{margin:0;font-family:system-ui,sans-serif;background:#0a0c10;color:#e8ecf4;padding:24px}
  h1{font-size:1.25rem} .sub{color:#8b95a8;max-width:900px;line-height:1.5}
  .commit{background:#12151c;border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:16px;margin:20px 0}
  .commit code{color:#c9a04a}
  section{margin:32px 0} h2{font-size:.85rem;letter-spacing:.12em;text-transform:uppercase;color:#c9a04a}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
  .card{background:#12151c;border:1px solid rgba(255,255,255,.08);border-radius:10px;overflow:hidden}
  .card h3{padding:10px 14px;margin:0;font-size:.78rem;border-bottom:1px solid rgba(255,255,255,.08)}
  .card h3.current{color:#6b9fd4} .card h3.rollback{color:#7ec89a}
  .card img{display:block;width:100%;height:auto;background:#111}
  .metrics{padding:8px 14px;font-size:.72rem;color:#8b95a8}
  @media(max-width:900px){.grid{grid-template-columns:1fr}}
</style></head><body>
<h1>Rollback preview — do not deploy until approved</h1>
<p class="sub">Compare current HEAD vs proposed rollback commit <strong>f06210f</strong> (2026-06-25, before logo asset replacement and all scaling/V2 work).</p>
<div class="commit"><strong>Proposed rollback:</strong> <code>f06210f</code> — feat: improve portfolio execution broker workflow<br>
<strong>Current:</strong> <code>${process.env.CURRENT_SHA || "HEAD"}</code></div>
${VIEWS.map((v) => {
  const cur = report.shots.find((s) => s.tag === "current" && s.view === v.id);
  const rb = report.shots.find((s) => s.tag === "rollback-f06210f" && s.view === v.id);
  return `<section><h2>${v.label}</h2><div class="grid">
    <div class="card"><h3 class="current">Current (production-like)</h3><img src="${cur?.hero}" alt=""><div class="metrics">Logo ${cur?.metrics.logoW}×${cur?.metrics.logoH}px · nav ${cur?.metrics.navH}px · transform ${cur?.metrics.logoTransform || "none"} · V2 ${cur?.metrics.hasV2}</div></div>
    <div class="card"><h3 class="rollback">Rollback f06210f</h3><img src="${rb?.hero}" alt=""><div class="metrics">Logo ${rb?.metrics.logoW}×${rb?.metrics.logoH}px · nav ${rb?.metrics.navH}px · transform ${rb?.metrics.logoTransform || "none"} · V2 ${rb?.metrics.hasV2}</div></div>
  </div></section>`;
}).join("")}
</body></html>`;

writeFileSync(join(outDir, "index.html"), html);
writeFileSync(join(outDir, "report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ outDir, gallery: `${outDir}/index.html`, shotCount: report.shots.length }, null, 2));
