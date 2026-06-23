/**
 * Capture What Matters module screenshot.
 * Usage: node scripts/capture-what-matters.mjs [baseUrl] [outName]
 */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const base = (process.argv[2] || "http://127.0.0.1:3001/").replace(/\/?$/, "/");
const outName = process.argv[3] || "what-matters-live.png";
const outDir = path.join(process.cwd(), "reports", "what-matters");
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto(base, { waitUntil: "domcontentloaded", timeout: 90_000 });
await page.waitForTimeout(2000);
await page.evaluate(() => window.route("dashboard"));
await page.waitForTimeout(3000);
const chips = page.locator("#page-dashboard .intel-wheel__chip");
const n = await chips.count();
for (let i = 0; i < n; i++) {
  const t = await chips.nth(i).textContent();
  if (t && /what matters/i.test(t)) {
    await chips.nth(i).click();
    break;
  }
}
await page.waitForTimeout(8000);
const shotPath = path.join(outDir, outName);
await page.locator("#wheelModuleStage .rail-module--what-matters").screenshot({ path: shotPath });
const audit = await page.evaluate(() => {
  const feed = window.whatMattersFeed;
  const cards = [...document.querySelectorAll("#wheelModuleStage .alert-visual")].map((c) => ({
    date: c.querySelector(".alert-visual__date")?.textContent?.trim(),
    event: c.querySelector(".alert-visual__head")?.textContent?.trim(),
    source: c.querySelector(".alert-visual__source")?.textContent?.trim(),
    importance: c.querySelector(".alert-visual__importance")?.textContent?.trim(),
  }));
  return {
    refreshedAt: document.querySelector("[data-what-matters-refreshed]")?.dataset?.refreshedAt,
    refreshedLabel: document.querySelector("[data-what-matters-refreshed]")?.textContent?.trim(),
    cards,
    feed,
  };
});
console.log(JSON.stringify(audit, null, 2));
console.log(`Screenshot: ${shotPath}`);
await browser.close();
