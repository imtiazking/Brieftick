import { chromium } from "playwright";

const BASE = process.env.SMOKE_BASE || "http://127.0.0.1:3458";
const browser = await chromium.launch({ headless: true });
const results = { base: BASE, checks: {}, errors: [] };

async function setupUser(page, userId) {
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForFunction(() => window.MissionPathController, { timeout: 30000 });
  await page.waitForTimeout(2000);
  await page.evaluate(
    ({ userId }) => {
      localStorage.removeItem("brieftick_mission_path_v1");
      localStorage.removeItem("bt_pi_intro_dismissed");
      const user = { id: userId, publicMetadata: {} };
      if (typeof _clerkUser !== "undefined") _clerkUser = user;
      window._clerkUser = user;
      window.MissionPathController.onAuthReady(user);
    },
    { userId }
  );
  await page.waitForTimeout(1000);
}

async function completeAllMissions(page) {
  await page.click("[data-mp-begin]");
  await page.waitForTimeout(500);
  for (let i = 0; i < 6; i++) {
    await page.click("[data-mp-verify]");
    await page.waitForTimeout(250);
  }
}

const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on("pageerror", (e) => results.errors.push(e.message));

await setupUser(page, "mp_pi_integration_qa");
await completeAllMissions(page);

results.checks.completionTitle = await page.textContent(".mp-complete__title");
results.checks.completionSub = await page.textContent(".mp-complete__sub");
results.checks.nextStepBody = await page.textContent(".mp-complete__next-body");
results.checks.enterCta = await page.textContent("[data-mp-enter]");

await page.click("[data-mp-enter]");
await page.waitForFunction(
  () => document.getElementById("page-portfolio-insights")?.classList.contains("active"),
  { timeout: 10000 }
);
await page.waitForSelector("#piIntro:not([hidden])", { timeout: 10000 });

results.checks.missionPathClosed = await page.evaluate(() => ({
  rootHidden: document.querySelector("[data-mp-root]")?.hidden,
  completeHidden: document.querySelector("[data-mp-complete]")?.hidden,
  bodyOpen: document.body.classList.contains("mp-open"),
}));

results.checks.portfolioInsightsActive = await page.evaluate(() => ({
  pageActive: document.getElementById("page-portfolio-insights")?.classList.contains("active"),
  navActive: document
    .querySelector('[data-route="portfolio-insights"]')
    ?.classList.contains("active"),
}));

results.checks.introVisible = await page.locator("#piIntro").isVisible();

await page.evaluate(() => {
  window.MissionPathController.onAuthReady(window._clerkUser);
});
await page.waitForTimeout(1200);

results.checks.noRelaunch = await page.evaluate(() => {
  const u = JSON.parse(localStorage.getItem("brieftick_mission_path_v1") || "{}").users
    ?.mp_pi_integration_qa;
  return {
    status: u?.status,
    welcomeHidden: document.querySelector("[data-mp-welcome]")?.hidden,
    rootHidden: document.querySelector("[data-mp-root]")?.hidden,
    stillOnPortfolioInsights: document
      .getElementById("page-portfolio-insights")
      ?.classList.contains("active"),
  };
});

await browser.close();

const failed =
  results.errors.length > 0 ||
  results.checks.completionTitle?.trim() !== "Mission Complete" ||
  results.checks.completionSub?.trim() !== "You now understand how Brieftick works." ||
  results.checks.nextStepBody?.trim() !== "Build your first investment basket." ||
  results.checks.enterCta?.trim() !== "Open Portfolio Insights" ||
  !results.checks.missionPathClosed?.rootHidden ||
  !results.checks.missionPathClosed?.completeHidden ||
  results.checks.missionPathClosed?.bodyOpen === true ||
  !results.checks.portfolioInsightsActive?.pageActive ||
  !results.checks.portfolioInsightsActive?.navActive ||
  !results.checks.introVisible ||
  results.checks.noRelaunch?.status !== "completed" ||
  results.checks.noRelaunch?.welcomeHidden === false ||
  results.checks.noRelaunch?.rootHidden === false ||
  !results.checks.noRelaunch?.stillOnPortfolioInsights;

console.log(JSON.stringify(results, null, 2));
process.exit(failed ? 1 : 0);
