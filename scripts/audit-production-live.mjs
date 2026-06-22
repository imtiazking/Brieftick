/**
 * Production live-data audit — console + network + badges per route.
 * Usage: node scripts/audit-production-live.mjs [baseUrl]
 */
import { chromium } from "playwright";

const base = (process.argv[2] || "https://www.forgeniq.com").replace(/\/$/, "");
const routes = [
  "landing",
  "dashboard",
  "why",
  "earnings",
  "portfolio",
  "scanner",
  "insiders",
  "options",
  "pricing",
  "about",
];

const report = { base, at: new Date().toISOString(), routes: [], apiErrors: [], consoleErrors: [] };

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

page.on("console", (msg) => {
  if (msg.type() === "error") report.consoleErrors.push(msg.text().slice(0, 200));
});
page.on("requestfailed", (req) => {
  const u = req.url();
  if (u.includes("/api/") || u.includes("finnhub") || u.includes("polygon")) {
    report.apiErrors.push({ url: u.slice(0, 120), err: req.failure()?.errorText });
  }
});

await page.goto(`${base}/`, { waitUntil: "networkidle", timeout: 120_000 });
await page.waitForTimeout(2000);

for (const route of routes) {
  report.consoleErrors.length = 0;
  report.apiErrors.length = 0;
  await page.evaluate((r) => window.route(r), route);
  await page.waitForTimeout(route === "dashboard" || route === "why" ? 5000 : 2500);

  const snap = await page.evaluate(() => {
    const badges = [...document.querySelectorAll(".bt-live-badge, #dashLiveBadge, #whmBriefingBadge, #optionsLiveBadge, #earnDataBadge")]
      .map((el) => ({ id: el.id || el.className, text: el.textContent?.trim() }));
    const illustrative = [...document.body.querySelectorAll("*")]
      .filter((el) => el.children.length === 0 && /illustrative|sample data|coming soon|mock|heuristic|preview data/i.test(el.textContent || ""))
      .slice(0, 8)
      .map((el) => el.textContent?.trim().slice(0, 100));
    const stuck = [...document.querySelectorAll("[class*='loading'], [class*='skeleton']")]
      .filter((el) => el.offsetParent !== null)
      .length;
    return { badges, illustrative, stuckLoading: stuck, title: document.title };
  });

  report.routes.push({ route, ...snap, consoleErrors: [...report.consoleErrors], apiErrors: [...report.apiErrors] });
}

// Mobile viewport
await page.setViewportSize({ width: 390, height: 844 });
await page.evaluate(() => window.route("landing"));
await page.waitForTimeout(2000);
const mobile = await page.evaluate(() => ({
  title: document.title,
  navLogo: document.querySelector("#navBrand img")?.src || null,
  badges: [...document.querySelectorAll(".bt-live-badge")].map((el) => el.textContent?.trim()),
}));
report.mobile = mobile;

await browser.close();
console.log(JSON.stringify(report, null, 2));
