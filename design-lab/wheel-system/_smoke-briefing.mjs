import { chromium } from "playwright";

const b = await chromium.launch({ headless: true });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto("http://localhost:3457/design-lab/wheel-system/briefing", {
  waitUntil: "networkidle",
});
const segments = ["Today", "Why", "Winners", "Losers", "Next"];
const out = [];
for (const label of segments) {
  await p.locator(".intel-wheel__chip-label", { hasText: label }).click();
  await p.waitForTimeout(400);
  const syms = await p.locator(".briefing-stock__sym").allTextContents();
  const headline = await p.locator(".briefing-panel__headline").textContent();
  out.push({ segment: label, stocks: syms, headline });
}
console.log(JSON.stringify(out, null, 2));
await b.close();
