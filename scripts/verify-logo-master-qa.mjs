/**
 * Before/after logo QA: production vs local master export.
 * Usage: node scripts/verify-logo-master-qa.mjs [localUrl] [prodUrl]
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

const local = (process.argv[2] || "http://localhost:52184").replace(/\/$/, "");
const prod = (process.argv[3] || "https://www.forgeniq.com").replace(/\/$/, "");
const outDir = join(process.cwd(), "debug", "logo-master-qa");
mkdirSync(outDir, { recursive: true });

const WIDTHS = [390, 1440];
const BACKGROUNDS = [
  { name: "dark", css: "background:#0a0a0a" },
  { name: "light", css: "background:#f5f5f5" },
  { name: "gold", css: "background:linear-gradient(135deg,#1a1510,#3d2e1a)" },
];

async function capture(base, label, page) {
  const rows = [];
  for (const w of WIDTHS) {
    for (const dpr of [1, 2]) {
      const p = await page.context().browser().newPage({
        viewport: { width: w, height: 900 },
        deviceScaleFactor: dpr,
      });
      await p.goto(`${base}/`, { waitUntil: "domcontentloaded", timeout: 90000 });
      await p.waitForSelector("#page-landing.active", { timeout: 20000 });
      await p.waitForSelector("#navBrand .split-brand-img--full", { state: "visible", timeout: 20000 });
      await p.evaluate(() => new Promise((r) => setTimeout(r, 1500)));

      const metrics = await p.evaluate(() => {
        const img = document.querySelector("#navBrand .split-brand-img--full");
        const ir = img.getBoundingClientRect();
        return {
          naturalW: img.naturalWidth,
          naturalH: img.naturalHeight,
          renderedW: Math.round(ir.width * 100) / 100,
          renderedH: Math.round(ir.height * 100) / 100,
        };
      });

      await p.evaluate(() => { document.documentElement.style.zoom = "200%"; });
      await p.waitForTimeout(250);

      const shot = join(outDir, `${label}-${w}@${dpr}x-200pct.png`);
      await p.locator("#navBrand .split-brand-img--full").screenshot({ path: shot });

      for (const bg of BACKGROUNDS) {
        const bgShot = join(outDir, `${label}-${w}@${dpr}x-bg-${bg.name}.png`);
        await p.evaluate((css) => {
          document.getElementById("siteNav").style.cssText += css;
        }, bg.css);
        await p.locator("#navBrand .split-brand-img--full").screenshot({ path: bgShot });
      }

      rows.push({ viewport: w, dpr, ...metrics, zoomShot: shot });
      await p.close();
    }
  }
  return rows;
}

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();
const page = await ctx.newPage();

const before = await capture(prod, "before-prod", page);
const after = await capture(local, "after-local", page);

await browser.close();

const report = {
  prod,
  local,
  before,
  after,
  sizeParity: before.map((b, i) => {
    const a = after[i];
    return {
      viewport: b.viewport,
      dpr: b.dpr,
      prodRendered: `${b.renderedW}×${b.renderedH}`,
      localRendered: `${a.renderedW}×${a.renderedH}`,
      match: b.renderedW === a.renderedW && b.renderedH === a.renderedH,
      localNatural: `${a.naturalW}×${a.naturalH}`,
    };
  }),
  pass: after.every((a) => a.naturalW >= 4096)
    && before.every((b, i) => {
      const a = after[i];
      return b.renderedW === a.renderedW && b.renderedH === a.renderedH;
    }),
};

writeFileSync(join(outDir, "report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ pass: report.pass, sizeParity: report.sizeParity }, null, 2));
console.log(`Artifacts: ${outDir}`);
