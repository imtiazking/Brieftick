/**
 * Capture Market Risk gauge screenshot + verify composite vs VIX display.
 * Usage: node scripts/capture-market-risk-gauge.mjs [baseUrl]
 */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const base = (process.argv[2] || "http://127.0.0.1:3001/").replace(/\/?$/, "/");
const outDir = path.join(process.cwd(), "reports", "market-risk-gauge");

await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

await page.goto(base, { waitUntil: "domcontentloaded", timeout: 90_000 });
await page.waitForTimeout(2000);
await page.evaluate(() => window.route("dashboard"));
await page.waitForTimeout(3000);

await page.evaluate(async () => {
  if (typeof window.refreshMarketRiskState === "function") {
    await window.refreshMarketRiskState({
      fetchQuotes: true,
      fetchMacro: true,
      refreshImpact: false,
    });
  }
});
await page.waitForTimeout(8000);

const chips = page.locator("#page-dashboard .intel-wheel__chip");
const n = await chips.count();
for (let i = 0; i < n; i++) {
  const t = await chips.nth(i).textContent();
  if (t && /market risk/i.test(t)) {
    await chips.nth(i).click();
    break;
  }
}
await page.waitForTimeout(3000);

const audit = await page.evaluate(() => {
  const rs = window.riskState;
  const gauge = document.querySelector("#wheelModuleStage .live-gauge");
  const compositeHeadline = gauge?.querySelector(".live-gauge__composite-score")?.textContent?.trim();
  const compositeRating = gauge?.querySelector(".gauge-composite-value.live-gauge__value")?.textContent?.trim();
  const regime = gauge?.querySelector("[data-mood-label]")?.textContent?.trim();
  const vixDisplay = gauge?.querySelector(".gauge-vix-value")?.textContent?.trim();
  const vixAsOf = gauge?.querySelector("[data-vix-asof]")?.textContent?.trim();
  const dataVix = gauge?.dataset?.vix;
  const dataComposite = gauge?.dataset?.compositeScore;
  const expectedGaugeVix = rs?.gaugeVix != null ? rs.gaugeVix.toFixed(1) : null;
  const rawVix = rs?.vix != null ? rs.vix.toFixed(1) : null;
  const score = rs?.score != null ? String(Math.round(rs.score)) : null;
  const needleMatchesComposite =
    dataVix && expectedGaugeVix && Math.abs(parseFloat(dataVix) - parseFloat(expectedGaugeVix)) < 0.15;
  const compositeShown = compositeHeadline === score && compositeRating === score;
  const vixSeparate = vixDisplay === rawVix && compositeHeadline !== rawVix;
  return {
    rs: { score: rs?.score, label: rs?.label, vix: rs?.vix, gaugeVix: rs?.gaugeVix },
    ui: { compositeHeadline, compositeRating, regime, vixDisplay, vixAsOf, dataVix, dataComposite },
    checks: { compositeShown, vixSeparate, needleMatchesComposite },
  };
});

const shotPath = path.join(outDir, "market-risk-gauge.png");
await page.locator("#wheelModuleStage .rail-module--market-risk").screenshot({ path: shotPath });

console.log(JSON.stringify(audit, null, 2));
console.log(`\nScreenshot: ${shotPath}`);

const ok =
  audit.checks.compositeShown &&
  audit.checks.vixSeparate &&
  audit.checks.needleMatchesComposite;

await browser.close();
process.exit(ok ? 0 : 1);
