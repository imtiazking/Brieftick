#!/usr/bin/env node
/**
 * Portfolio Execution UX — production verification.
 */
import { chromium, devices } from "playwright";

const BASE = (process.argv[2] || "https://www.forgeniq.com").replace(/\/$/, "");
const consoleErrors = [];

function trackConsole(page) {
  page.on("pageerror", (e) => consoleErrors.push(e.message));
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const t = msg.text();
    if (/favicon|404.*\.(png|ico)|502|503|clerk|third-party|CORS policy/i.test(t)) return;
    consoleErrors.push(t);
  });
}

async function bootPortfolio(page) {
  await page.goto(BASE + "/", { waitUntil: "load", timeout: 90000 });
  await page.waitForFunction(() => typeof window.route === "function", { timeout: 60000 });
  await page.evaluate(async () => {
    window._clerkUser = { id: "pi-execution-smoke" };
    if (window.__btLoadAppModules) await window.__btLoadAppModules();
    window.route("portfolio-insights");
    if (typeof window.mountPortfolioInsights === "function") window.mountPortfolioInsights();
  });
  await page.waitForSelector("#page-portfolio-insights.active", { timeout: 30000 });
  await page.waitForTimeout(2000);
  const intro = page.locator("#piIntro");
  if (await intro.isVisible().catch(() => false)) {
    await page.locator("[data-pi-intro-dismiss]").click();
    await page.waitForTimeout(400);
  }
}

async function openExecutionModal(page) {
  await page.locator("#page-portfolio-insights [data-continue-broker]").first().click();
  await page.waitForSelector("#piExecutionModal.is-open", { timeout: 10000 });
}

async function runDesktop(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  trackConsole(page);
  const checks = {};

  await bootPortfolio(page);
  checks.pageLoads = await page.evaluate(
    () => document.getElementById("page-portfolio-insights")?.classList.contains("active")
  );

  await openExecutionModal(page);
  checks.modalOpens = await page.evaluate(
    () => document.getElementById("piExecutionModal")?.classList.contains("is-open")
  );

  const brokerStatuses = await page.evaluate(() =>
    [...document.querySelectorAll("#piExecutionBrokers .pi-exec-broker")].map((el) => ({
      name: el.querySelector(".pi-exec-broker__name")?.textContent?.trim(),
      status: el.querySelector(".pi-exec-broker__status")?.textContent?.trim(),
    }))
  );
  checks.brokersComingSoon =
    brokerStatuses.length === 4 &&
    brokerStatuses.every((b) => /Coming Soon/i.test(b.status || "")) &&
    brokerStatuses.some((b) => /Trading 212/i.test(b.name || "")) &&
    brokerStatuses.some((b) => /Interactive Brokers/i.test(b.name || "")) &&
    brokerStatuses.some((b) => /eToro/i.test(b.name || "")) &&
    brokerStatuses.some((b) => /^IG$/i.test(b.name || ""));

  checks.openBrokerHidden = await page.locator("#piOpenBrokerBtn").isHidden();

  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 8000 }).catch(() => null),
    page.locator("[data-export-csv]").click(),
  ]);
  checks.exportCsv = !!download && /\.csv$/i.test(download.suggestedFilename() || "");

  await ctx.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.locator("[data-copy-tickers]").click();
  await page.waitForTimeout(600);
  const clip = await page.evaluate(() => navigator.clipboard.readText().catch(() => ""));
  checks.copyTickers = /NVDA/.test(clip) || !!(await page.locator("#piToast:not([hidden])").textContent());

  checks.disclaimer = await page.evaluate(() => {
    const t = document.querySelector(".pi-disclaimer")?.textContent || "";
    return (
      /independent market intelligence platform/i.test(t) &&
      /never hold client funds or execute trades/i.test(t) &&
      /chosen broker/i.test(t)
    );
  });

  checks.noTrading212Cta = await page.evaluate(() => {
    const root = document.getElementById("page-portfolio-insights");
    const html = root?.innerHTML || "";
    return !/Continue with Trading212/i.test(html);
  });

  await ctx.close();
  return { viewport: "desktop", checks, brokerStatuses };
}

async function runMobile(browser) {
  const ctx = await browser.newContext({
    ...devices["iPhone 13"],
    viewport: devices["iPhone 13"].viewport,
  });
  const page = await ctx.newPage();
  trackConsole(page);
  const checks = {};

  await bootPortfolio(page);
  checks.pageLoads = await page.evaluate(
    () => document.getElementById("page-portfolio-insights")?.classList.contains("active")
  );

  const layout = await page.evaluate(() => ({
    horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
    executionVisible: !!document.querySelector("#piReady .pi-execution h2"),
    continueVisible: !!document.querySelector("[data-continue-broker]"),
  }));
  checks.mobileLayout =
    checks.pageLoads &&
    layout.executionVisible &&
    layout.continueVisible &&
    !layout.horizontalOverflow;

  await openExecutionModal(page);
  checks.modalOpens = await page.evaluate(
    () => document.getElementById("piExecutionModal")?.classList.contains("is-open")
  );
  const modalBox = await page.locator(".pi-exec-modal__sheet").boundingBox();
  checks.modalFitsViewport = !!modalBox && modalBox.width > 200;

  await ctx.close();
  return { viewport: "iphone-13", checks, layout };
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const desktop = await runDesktop(browser);
  const mobile = await runMobile(browser);
  await browser.close();

  const pass =
    desktop.checks.pageLoads &&
    desktop.checks.modalOpens &&
    desktop.checks.brokersComingSoon &&
    desktop.checks.openBrokerHidden &&
    desktop.checks.exportCsv &&
    desktop.checks.copyTickers &&
    desktop.checks.disclaimer &&
    desktop.checks.noTrading212Cta &&
    mobile.checks.pageLoads &&
    mobile.checks.mobileLayout &&
    mobile.checks.modalOpens &&
    mobile.checks.modalFitsViewport &&
    consoleErrors.length === 0;

  const out = { pass, baseUrl: BASE, consoleErrors, desktop, mobile };
  console.log(JSON.stringify(out, null, 2));
  process.exit(pass ? 0 : 1);
}

main();
