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

await page.locator("#page-portfolio-insights .pi-chip").first().click();
checks.continueEnabled = !(await page
  .locator("#page-portfolio-insights [data-basket-continue]")
  .first()
  .isDisabled());

await page.locator("#page-portfolio-insights [data-basket-continue]").first().click();
checks.handoffOpen = await page.evaluate(
  () => document.getElementById("piHandoff")?.classList.contains("is-open")
);

const handoffTickers = await page.locator("#piHandoffTickers").textContent();
checks.handoffHasSelection = (handoffTickers || "").includes("NVDA");

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
  !checks.continueDisabled ||
  !checks.continueEnabled ||
  !checks.handoffOpen ||
  !checks.handoffHasSelection;

console.log(JSON.stringify({ checks, errors }, null, 2));
process.exit(failed ? 1 : 0);
