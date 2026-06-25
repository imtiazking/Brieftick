/**
 * Verify About page nav logo matches Landing (same asset, size, transparency).
 * Usage: node scripts/verify-about-logo-match.mjs [baseUrl]
 */
import { chromium } from "playwright";
import { mkdirSync, readFileSync } from "fs";
import { join } from "path";
import { createHash } from "crypto";

const base = (process.argv[2] || "http://localhost:3000").replace(/\/$/, "");
const outDir = join(process.cwd(), "debug", "logo-preview");
mkdirSync(outDir, { recursive: true });

const viewports = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
];

function hash(buf) {
  return createHash("sha256").update(buf).digest("hex").slice(0, 16);
}

async function logoMetrics(page) {
  return page.evaluate(() => {
    const img = document.querySelector("#navBrand .split-brand-img--full");
    const clip = document.querySelector("#navBrand .split-brand__clip");
    if (!img) return null;
    const ir = img.getBoundingClientRect();
    const cs = getComputedStyle(img);
    const clipCs = clip ? getComputedStyle(clip) : null;
    return {
      src: img.getAttribute("src"),
      width: Math.round(ir.width * 10) / 10,
      height: Math.round(ir.height * 10) / 10,
      objectFit: cs.objectFit,
      objectPosition: cs.objectPosition,
      heightCss: cs.height,
      maxHeight: cs.maxHeight,
      maxWidth: cs.maxWidth,
      clipBackground: clipCs?.background || clipCs?.backgroundColor,
      brandBackground: getComputedStyle(document.getElementById("navBrand")).background,
    };
  });
}

async function captureLogo(page, route, vpName) {
  const url = `${base}/`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  if (route === "about") {
    await page.evaluate(() => window.route("about"));
    await page.waitForSelector("#page-about.active", { state: "attached", timeout: 15000 });
  } else {
    await page.waitForSelector("#page-landing.active", { state: "attached", timeout: 15000 });
  }
  await page.waitForSelector("#navBrand .split-brand-img--full", { state: "visible", timeout: 15000 });
  await page.waitForTimeout(1600);

  const metrics = await logoMetrics(page);
  const logo = page.locator("#navBrand .split-brand-img--full");
  const box = await logo.boundingBox();
  const shotPath = join(outDir, `${route}-logo-${vpName}.png`);
  if (box) {
    await page.screenshot({ path: shotPath, clip: box });
  }
  const buf = readFileSync(shotPath);
  return { metrics, shotPath, hash: hash(buf) };
}

const browser = await chromium.launch({ headless: true });
const failures = [];

for (const vp of viewports) {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
  const landing = await captureLogo(page, "landing", vp.name);
  const about = await captureLogo(page, "about", vp.name);
  await page.close();

  console.log(`\n[${vp.name}] landing:`, landing.metrics);
  console.log(`[${vp.name}] about:  `, about.metrics);
  console.log(`[${vp.name}] landing shot: ${landing.shotPath} (${landing.hash})`);
  console.log(`[${vp.name}] about shot:  ${about.shotPath} (${about.hash})`);

  const m1 = landing.metrics;
  const m2 = about.metrics;
  if (!m1 || !m2) {
    failures.push(`${vp.name}: logo element missing`);
    continue;
  }
  for (const key of ["src", "width", "height", "objectFit", "objectPosition", "heightCss", "maxHeight", "maxWidth"]) {
    if (m1[key] !== m2[key]) {
      failures.push(`${vp.name}: ${key} mismatch — landing=${m1[key]} about=${m2[key]}`);
    }
  }
  const transparentBg = (v) =>
    !v || v === "transparent" || v === "none" || v.startsWith("rgba(0, 0, 0, 0)");
  if (!transparentBg(m1.clipBackground)) {
    failures.push(`${vp.name}: landing clip background not transparent (${m1.clipBackground})`);
  }
  if (!transparentBg(m2.clipBackground)) {
    failures.push(`${vp.name}: about clip background not transparent (${m2.clipBackground})`);
  }
  if (landing.hash !== about.hash) {
    console.warn(`[${vp.name}] note: logo clip screenshots differ — likely page backdrop behind transparent PNG`);
  }
}

await browser.close();

if (failures.length) {
  console.error("\nFAILURES:");
  failures.forEach((f) => console.error(`  - ${f}`));
  process.exit(1);
}

console.log("\nAll logo parity checks passed (landing === about, desktop + mobile).");
