/**
 * Hero nav logo parity: Landing = About = Pricing (desktop + mobile).
 * Usage: node scripts/verify-hero-nav-logo-parity.mjs [baseUrl]
 */
import { chromium } from "playwright";
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { createHash } from "crypto";

const base = (process.argv[2] || "http://localhost:3000").replace(/\/$/, "");
const outDir = join(process.cwd(), "debug", "logo-preview", "hero-parity");
mkdirSync(outDir, { recursive: true });

const ROUTES = ["landing", "about", "pricing"];
const SCENARIOS = [
  { label: "desktop", width: 1440, height: 900 },
  { label: "mobile-390", width: 390, height: 844 },
  { label: "mobile-412", width: 412, height: 915 },
  { label: "mobile-430", width: 430, height: 932 },
];

const STYLE_KEYS = [
  "src", "className", "width", "height", "left", "brandLeft", "brandTop",
  "objectFit", "objectPosition", "maxHeight", "maxWidth", "transform",
  "clipBackground", "aspectRatio", "hasSymbolFallback", "hasCheckerboard", "isClipped", "stretchDelta", "gapToMenu",
];

function hash(buf) {
  return createHash("sha256").update(buf).digest("hex").slice(0, 16);
}

function transparentBg(v) {
  return !v || v === "transparent" || v === "none" || String(v).startsWith("rgba(0, 0, 0, 0)");
}

const ROUTE_META = {
  landing: { url: (b) => `${b}/`, page: "#page-landing.active", attr: "data-split-landing" },
  about: { url: (b) => `${b}/?tab=about`, page: "#page-about.active", attr: "data-split-about" },
  pricing: { url: (b) => `${b}/?tab=pricing`, page: "#page-pricing.active", attr: "data-split-pricing" },
};

async function waitForRoute(page, route) {
  const meta = ROUTE_META[route];
  await page.goto(meta.url(base), { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForSelector(meta.page, { state: "attached", timeout: 20000 });
  await page.waitForFunction((attr) => document.documentElement.hasAttribute(attr), meta.attr, { timeout: 20000 });
  await page.waitForSelector("#navBrand .split-brand-img--full", { state: "visible", timeout: 20000 });
  await page.evaluate(() => new Promise((resolve) => {
    const clip = document.querySelector("#navBrand .split-brand__clip");
    if (!clip) return resolve();
    const finish = () => resolve();
    clip.addEventListener("animationend", finish, { once: true });
    setTimeout(finish, 2500);
  }));
}

async function collectMetrics(page) {
  return page.evaluate(() => {
    const brand = document.getElementById("navBrand");
    const img = document.querySelector("#navBrand .split-brand-img--full");
    const clip = document.querySelector("#navBrand .split-brand__clip");
    const menu = document.querySelector(".nav-a__menu-btn");
    if (!brand || !img) return null;
    const ir = img.getBoundingClientRect();
    const br = brand.getBoundingClientRect();
    const mr = menu?.getBoundingClientRect();
    const cs = getComputedStyle(img);
    const clipCs = clip ? getComputedStyle(clip) : null;
    const naturalAR = img.naturalWidth / img.naturalHeight;
    const displayAR = ir.width / ir.height;
    return {
      src: img.getAttribute("src"),
      className: img.className,
      width: Math.round(ir.width * 100) / 100,
      height: Math.round(ir.height * 100) / 100,
      left: Math.round(ir.left * 100) / 100,
      brandLeft: Math.round(br.left * 100) / 100,
      brandTop: Math.round(br.top * 100) / 100,
      objectFit: cs.objectFit,
      objectPosition: cs.objectPosition,
      maxHeight: cs.maxHeight,
      maxWidth: cs.maxWidth,
      transform: cs.transform,
      clipBackground: clipCs?.backgroundColor || "",
      aspectRatio: Math.round(displayAR * 1000) / 1000,
      hasSymbolFallback: !!document.querySelector("#navBrand .split-brand-img--symbol"),
      hasCheckerboard: false,
      isClipped: ir.width < 1 || ir.height < 1,
      stretchDelta: Math.round(Math.abs(naturalAR - displayAR) * 1000) / 1000,
      gapToMenu: mr ? Math.round((mr.left - ir.right) * 100) / 100 : null,
    };
  });
}

function compareAll(label, metrics, failures) {
  const ref = metrics.landing;
  for (const route of ["about", "pricing"]) {
    const cur = metrics[route];
    if (!ref || !cur) {
      failures.push(`${label}: missing metrics for ${route}`);
      continue;
    }
    for (const key of STYLE_KEYS) {
      const a = ref[key];
      const b = cur[key];
      const posKey = key === "left" || key === "brandTop" || key === "brandLeft";
      const match = posKey ? Math.round(Number(a) * 100) === Math.round(Number(b) * 100) : a === b;
      if (!match) failures.push(`${label}: landing vs ${route} ${key} — ${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
    }
    if (!transparentBg(cur.clipBackground)) failures.push(`${label}: ${route} clip not transparent`);
    if (label.startsWith("mobile") && cur.gapToMenu !== null && cur.gapToMenu < 8) {
      failures.push(`${label}: ${route} hamburger overlap (gap ${cur.gapToMenu}px)`);
    }
  }
}

const browser = await chromium.launch({ headless: true });
const failures = [];
const report = { base, scenarios: [] };

for (const scenario of SCENARIOS) {
  const metrics = {};
  const shots = {};
  for (const route of ROUTES) {
    const page = await browser.newPage({ viewport: { width: scenario.width, height: scenario.height } });
    await waitForRoute(page, route);
    metrics[route] = await collectMetrics(page);
    const box = await page.locator("#navBrand .split-brand-img--full").boundingBox();
    const shotPath = join(outDir, `${route}-${scenario.label}.png`);
    if (box) await page.screenshot({ path: shotPath, clip: box });
    shots[route] = shotPath;
    await page.close();
  }
  compareAll(scenario.label, metrics, failures);
  report.scenarios.push({ label: scenario.label, metrics, shots });
  console.log(`\n=== ${scenario.label} ===`);
  for (const route of ROUTES) console.log(route, metrics[route]);
}

await browser.close();
report.pass = failures.length === 0;
report.failures = failures;
writeFileSync(join(outDir, "report.json"), JSON.stringify(report, null, 2));

if (failures.length) {
  console.error("\nFAIL\n" + failures.map((f) => `  - ${f}`).join("\n"));
  process.exit(1);
}
console.log("\nPASS — Landing, About, and Pricing share identical hero nav logos.");
console.log(`Report: ${join(outDir, "report.json")}`);
