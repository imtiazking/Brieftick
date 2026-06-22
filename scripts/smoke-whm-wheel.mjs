import { chromium } from "playwright";

const b = await chromium.launch({ headless: true });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto("http://127.0.0.1:3457/", { waitUntil: "networkidle", timeout: 60000 });
await p.locator(".nav-link", { hasText: "What's Moving" }).click();
await p.waitForTimeout(2500);
const r = await p.evaluate(() => {
  const vp = document.querySelector("#page-why #whmWheelViewport");
  const dashVp = document.querySelector("#page-dashboard #wheelViewport");
  const label = vp?.querySelector(".intel-wheel__chip-label");
  return {
    labels: vp ? [...vp.querySelectorAll(".intel-wheel__chip-label")].map((l) => l.textContent.trim()) : [],
    chipCount: vp?.querySelectorAll(".intel-wheel__chip").length ?? 0,
    vpHeight: vp?.offsetHeight ?? 0,
    dashVpChips: dashVp?.querySelectorAll(".intel-wheel__chip").length ?? 0,
    engineHasPanel: !!document.querySelector("#whmWheelEngine .briefing-panel"),
  };
});
console.log(JSON.stringify(r, null, 2));
await b.close();
