import { chromium } from "playwright";

const BASE = process.env.SMOKE_BASE || "http://127.0.0.1:3458";
const browser = await chromium.launch({ headless: true });
const errors = [];
const checks = {};

const page = await browser.newPage();
page.on("pageerror", (e) => errors.push(e.message));

await page.goto(`${BASE}/?qa=1`, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(1500);

const qa = await page.evaluate(() => ({
  active: window.isPreviewQaActive?.(),
  dashboardRoute: window.isPreviewQaRoute?.("dashboard"),
  scannerRoute: window.isPreviewQaRoute?.("scanner"),
  production: /^(www\.)?brieftick\.com$/i.test(location.hostname),
}));

checks.qaModeActive = qa.active === true;
checks.qaDashboardBypass = qa.dashboardRoute === true;
checks.qaDiscoverBypass = qa.scannerRoute === true;
checks.notProduction = qa.production === false;

await page.evaluate(() => {
  window.btQaSaveRoute?.("dashboard");
  window.route("dashboard");
});
await page.waitForTimeout(2000);

const onDashboard = await page.evaluate(
  () => document.querySelector("#page-dashboard")?.classList.contains("active") === true
);
checks.qaRouteDashboard = onDashboard;

await browser.close();

const pass =
  errors.length === 0 &&
  checks.qaModeActive &&
  checks.qaDashboardBypass &&
  checks.qaDiscoverBypass &&
  checks.notProduction &&
  checks.qaRouteDashboard;

console.log(JSON.stringify({ pass, errors, checks }, null, 2));
process.exit(pass ? 0 : 1);
