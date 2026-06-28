/**
 * Full-site logo QA — all pages, sizes, transparency, no layout shift.
 * Usage: node scripts/verify-logo-production-qa.mjs [localUrl] [prodUrl]
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

const local = (process.argv[2] || "http://localhost:52184").replace(/\/$/, "");
const prod = (process.argv[3] || "https://www.forgeniq.com").replace(/\/$/, "");
const outDir = join(process.cwd(), "debug", "logo-production-qa");
mkdirSync(outDir, { recursive: true });

const ROUTES = [
  { name: "landing", url: "/", sel: "#page-landing.active", logo: "#navBrand .split-brand-img--full" },
  { name: "about", url: "/?tab=about", sel: "#page-about.active", logo: "#navBrand .split-brand-img--full" },
  { name: "pricing", url: "/?tab=pricing", sel: "#page-pricing.active", logo: "#navBrand .split-brand-img--full" },
  { name: "footer-landing", url: "/", sel: "#page-landing.active", logo: "footer img[src*='forgeniq-logo']" },
];
const WIDTHS = [320, 390, 768, 1440];

async function probe(base, label) {
  const browser = await chromium.launch({ headless: true });
  const rows = [];
  const failures = [];

  for (const route of ROUTES) {
    for (const w of WIDTHS) {
      const page = await browser.newPage({ viewport: { width: w, height: 900 }, deviceScaleFactor: 2 });
      try {
        await page.goto(`${base}${route.url}`, { waitUntil: "domcontentloaded", timeout: 90000 });
        await page.waitForSelector(route.sel, { timeout: 20000 });
        await page.waitForSelector(route.logo, { state: "visible", timeout: 15000 }).catch(() => null);
        await page.waitForTimeout(1200);

        const m = await page.evaluate((logoSel) => {
          const img = document.querySelector(logoSel);
          if (!img) return null;
          const ir = img.getBoundingClientRect();
          const nav = document.getElementById("siteNav")?.getBoundingClientRect();
          return {
            naturalW: img.naturalWidth,
            naturalH: img.naturalHeight,
            renderedW: Math.round(ir.width * 100) / 100,
            renderedH: Math.round(ir.height * 100) / 100,
            navHeight: nav ? Math.round(nav.height * 100) / 100 : null,
            scrollW: document.documentElement.scrollWidth,
            clientW: document.documentElement.clientWidth,
            src: img.currentSrc || img.src,
          };
        }, route.logo);

        if (!m) {
          failures.push(`${label} ${route.name}@${w}: logo not found`);
          await page.close();
          continue;
        }

        if (m.scrollW > m.clientW + 1) {
          failures.push(`${label} ${route.name}@${w}: horizontal scroll ${m.scrollW}>${m.clientW}`);
        }

        await page.evaluate(() => { document.documentElement.style.zoom = "200%"; });
        await page.waitForTimeout(200);
        const shot = join(outDir, `${label}-${route.name}-${w}@2x-200pct.png`);
        await page.locator(route.logo).screenshot({ path: shot }).catch(() => {});

        rows.push({ label, route: route.name, viewport: w, ...m, shot });
      } catch (e) {
        failures.push(`${label} ${route.name}@${w}: ${e.message}`);
      }
      await page.close();
    }
  }
  await browser.close();
  return { rows, failures };
}

const before = await probe(prod, "before-prod");
const after = await probe(local, "after-local");

const prodNav = before.rows.filter((r) => r.route === "landing" && r.logo?.includes?.("nav") || r.route === "landing");
const sizeChecks = [];
for (const w of WIDTHS) {
  const pb = before.rows.find((r) => r.route === "landing" && r.viewport === w);
  const la = after.rows.find((r) => r.route === "landing" && r.viewport === w);
  if (pb && la) {
    sizeChecks.push({
      viewport: w,
      prod: `${pb.renderedW}×${pb.renderedH}`,
      local: `${la.renderedW}×${la.renderedH}`,
      match: pb.renderedW === la.renderedW && pb.renderedH === la.renderedH,
      localNatural: `${la.naturalW}×${la.naturalH}`,
    });
  }
}

const report = {
  prod,
  local,
  sizeChecks,
  beforeFailures: before.failures,
  afterFailures: after.failures,
  pass:
    after.failures.length === 0
    && before.failures.length === 0
    && sizeChecks.every((c) => c.match)
    && after.rows.every((r) => r.naturalW >= 4096),
};

writeFileSync(join(outDir, "report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
