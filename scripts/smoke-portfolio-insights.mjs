import { chromium } from "playwright";

const BASE = process.env.SMOKE_BASE || "http://127.0.0.1:3458";
const browser = await chromium.launch({ headless: true });
const errors = [];
const checks = {};

const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on("pageerror", (e) => errors.push(e.message));

await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(1500);

checks.navTab = await page.locator('[data-route="portfolio-insights"]').count();

await page.evaluate(() => {
  if (typeof window.route === "function") window.route("portfolio-insights");
  if (typeof window.mountPortfolioInsights === "function") window.mountPortfolioInsights();
});
await page.waitForSelector("#piIntro:not([hidden])", { timeout: 15000 });

checks.pageActive = await page.evaluate(
  () => document.getElementById("page-portfolio-insights")?.classList.contains("active")
);
checks.headline = await page.locator("#page-portfolio-insights .pi-header h1").textContent();
checks.navActive = await page.evaluate(
  () => document.querySelector('[data-route="portfolio-insights"]')?.classList.contains("active")
);
checks.introVisible = await page.locator("#piIntro").isVisible();
checks.basketsSub = await page.locator("#piBasketsSub").textContent();
checks.basketsRendered = await page.locator("#page-portfolio-insights .pi-basket").count();
checks.companyLabel = await page
  .locator("#page-portfolio-insights [data-selected-count]")
  .first()
  .textContent();
checks.executionLabel = await page.locator("#piReadyLabel").textContent();
checks.executionTitle = await page.locator("#piReady .pi-execution h2").textContent();
checks.brokersLabel = await page.locator("#piBrokersLabel").textContent();
checks.brokersSub = await page.locator("#piBrokersSub").textContent();
checks.disclaimer = await page.locator(".pi-disclaimer").textContent();

await page.locator("#page-portfolio-insights [data-pi-intro-dismiss]").click();
checks.introDismissed = await page.evaluate(
  () => localStorage.getItem("bt_pi_intro_dismissed") === "1"
);

await page.evaluate(() => {
  const basket = document.querySelector("#page-portfolio-insights .pi-basket");
  basket?.querySelectorAll(".pi-chip.is-selected").forEach((chip) => chip.click());
});
checks.continueDisabled = await page
  .locator("#page-portfolio-insights [data-basket-continue]")
  .first()
  .isDisabled();

checks.openBasketDisabled = await page
  .locator("#page-portfolio-insights [data-open-basket]")
  .first()
  .isDisabled();

await page.locator("#page-portfolio-insights .pi-chip").first().click();
checks.continueEnabled = !(await page
  .locator("#page-portfolio-insights [data-basket-continue]")
  .first()
  .isDisabled());
checks.continueBtnLabel = await page
  .locator("#page-portfolio-insights [data-basket-continue]")
  .first()
  .textContent();
checks.openBasketEnabled = !(await page
  .locator("#page-portfolio-insights [data-open-basket]")
  .first()
  .isDisabled());

await page.evaluate(() => {
  const basket = document.querySelector("#page-portfolio-insights .pi-basket");
  const chips = basket?.querySelectorAll(".pi-chip") || [];
  chips.forEach((chip, i) => {
    if (i > 0 && chip.classList.contains("is-selected")) chip.click();
  });
});
checks.singleCompanyLabel = await page
  .locator("#page-portfolio-insights [data-selected-count]")
  .first()
  .textContent();

await page.locator("#page-portfolio-insights [data-open-basket]").first().click();
checks.basketReviewOpen = await page.evaluate(
  () => document.getElementById("piBasketReview")?.classList.contains("is-open")
);
checks.basketReviewTitle = await page.locator("#piBasketReviewTitle").textContent();
checks.basketReviewTickers = await page.locator("#piBasketReviewTickers").textContent();
checks.basketReviewCount = await page.locator("#piBasketReviewCount").textContent();
checks.basketReviewRisk = await page.locator("#piBasketReviewRisk").textContent();
checks.basketReviewContinue = await page.locator("[data-basket-review-continue]").textContent();

await page.locator("[data-basket-review-continue]").click();
checks.executionModalOpen = await page.evaluate(
  () => document.getElementById("piExecutionModal")?.classList.contains("is-open")
);

const executionTitle = await page.locator("#piExecutionTitle").textContent();
const executionLead = await page.locator(".pi-exec-modal__lead").textContent();
const executionTickers = await page.locator("#piExecutionTickers").textContent();
const brokerCount = await page.locator("#piExecutionBrokers .pi-exec-broker").count();
const exportBtn = await page.locator("[data-export-csv]").textContent();
const copyBtn = await page.locator("[data-copy-tickers]").textContent();
const closeBtn = await page.locator("[data-execution-close]").last().textContent();
const openBrokerHidden = await page.locator("#piOpenBrokerBtn").isHidden();

checks.executionCopy =
  executionTitle?.trim() === "Execution" &&
  /Choose where you'd like to execute your basket/i.test(executionLead || "") &&
  (executionTickers || "").trim() === "NVDA" &&
  brokerCount === 4 &&
  exportBtn?.trim() === "Export CSV" &&
  copyBtn?.trim() === "Copy ticker list" &&
  closeBtn?.trim() === "Close" &&
  openBrokerHidden;

checks.integrationsRendered = await page.locator("#piBrokers .pi-broker").count();

await browser.close();

const failed =
  errors.length > 0 ||
  checks.navTab !== 1 ||
  !checks.pageActive ||
  !checks.navActive ||
  !checks.introVisible ||
  !checks.introDismissed ||
  checks.basketsSub?.trim() !== "Select one or more companies to include." ||
  checks.companyLabel?.trim() !== "5 companies selected" ||
  checks.singleCompanyLabel?.trim() !== "1 company selected" ||
  checks.headline?.trim() !== "Portfolio Insights" ||
  checks.basketsRendered !== 4 ||
  checks.executionLabel?.trim() !== "Execution" ||
  checks.executionTitle?.trim() !== "Execution" ||
  checks.brokersLabel?.trim() !== "Broker Integrations" ||
  !/Connect your preferred broker when available/i.test(checks.brokersSub || "") ||
  !/independent market intelligence platform/i.test(checks.disclaimer || "") ||
  !/never hold client funds or execute trades/i.test(checks.disclaimer || "") ||
  !checks.continueDisabled ||
  !checks.openBasketDisabled ||
  !checks.continueEnabled ||
  !/Continue to Broker/i.test(checks.continueBtnLabel || "") ||
  !checks.openBasketEnabled ||
  !checks.basketReviewOpen ||
  checks.basketReviewTitle?.trim() !== "AI Infrastructure Basket" ||
  checks.basketReviewTickers?.trim() !== "NVDA" ||
  checks.basketReviewCount?.trim() !== "1 company selected" ||
  !checks.basketReviewRisk?.includes("Risk note") ||
  !/Continue to Broker/i.test(checks.basketReviewContinue || "") ||
  !checks.executionModalOpen ||
  !checks.executionCopy ||
  checks.integrationsRendered !== 4;

console.log(JSON.stringify({ checks, errors }, null, 2));
process.exit(failed ? 1 : 0);
