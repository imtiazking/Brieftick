/**
 * Capture FORGENIQ logo preview screenshots (header, footer, mobile nav).
 * Usage: node scripts/capture-logo-preview.mjs [baseUrl]
 */
import { chromium } from "playwright";
import { mkdirSync } from "fs";
import { join } from "path";

const base = (process.argv[2] || "http://localhost:3000").replace(/\/$/, "");
const outDir = join(process.cwd(), "debug", "logo-preview");
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });

async function shot(page, name, target) {
  const path = join(outDir, `${name}.png`);
  if (typeof target === "object" && "x" in target) {
    await page.screenshot({ path, clip: target });
  } else {
    await target.screenshot({ path });
  }
  console.log(`Wrote ${path}`);
}

async function waitForLogo(page) {
  await page.waitForSelector("#navBrand .split-brand-img--full, #navBrand .split-brand-img--symbol", {
    timeout: 15000,
  });
  await page.waitForTimeout(1600);
}

// Desktop header
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${base}/`, { waitUntil: "networkidle", timeout: 60000 });
  await waitForLogo(page);
  const nav = page.locator("#siteNav");
  const box = await nav.boundingBox();
  if (box) await shot(page, "01-homepage-header-desktop", box);
  await page.close();
}

// Footer check omitted for this capture run

// Mobile nav (symbol asset ≤480px)
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(`${base}/`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForSelector("#navBrand .split-brand-img--full", { state: "visible", timeout: 15000 });
  await page.waitForTimeout(1600);
  const nav = page.locator("#siteNav");
  await shot(page, "03-homepage-nav-mobile", nav);
  await page.close();
}

await browser.close();
console.log(`\nPreview base URL: ${base}/`);
