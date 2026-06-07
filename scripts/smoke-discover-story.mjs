import { chromium } from "playwright";

const BASE = process.env.SMOKE_BASE || "http://127.0.0.1:3458";
const browser = await chromium.launch({ headless: true });
const errors = [];
const checks = {};

async function openDiscover(page) {
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2000);

  const navLabel = await page
    .locator('[data-route="scanner"]')
    .textContent()
    .catch(() => "");
  checks.navDiscover = /\bDiscover\b/.test(navLabel || "") && !/Discover Stocks/.test(navLabel || "");

  await page.evaluate(() => {
    if (typeof window.route === "function") window.route("scanner");
  });
  await page.waitForTimeout(1500);
  await page.waitForFunction(() => document.getElementById("discoverStoryFeed")?.children.length > 0, {
    timeout: 15000,
  });
}

{
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await openDiscover(page);

  checks.hero = (await page.textContent(".discover-hero h1"))?.trim() === "Discover";
  checks.cardsCount = await page.locator(".discover-story-card").count();
  checks.sixCards = checks.cardsCount === 6;

  const cardAudit = await page.evaluate(() => {
    const cards = [...document.querySelectorAll(".discover-story-card")];
    const required = [
      "What is happening?",
      "Why is it happening?",
      "How strong is the story?",
      "What could change the story?",
      "Which stocks are exposed?",
    ];
    return cards.map((card) => {
      const text = card.innerText.toLowerCase();
      const missing = required.filter((q) => !text.includes(q.toLowerCase()));
      const tickers = card.querySelectorAll(".discover-ticker-chip").length;
      const strength = card.querySelector(".discover-story-card__strength-fill");
      return {
        theme: card.dataset.theme,
        missing,
        tickers,
        hasStrength: !!strength,
      };
    });
  });

  checks.allCardsComplete =
    cardAudit.length === 6 &&
    cardAudit.every((c) => c.missing.length === 0 && c.tickers >= 4 && c.hasStrength);

  checks.scanCollapsed = await page.evaluate(
    () => !document.getElementById("discoverScanRefine")?.open
  );

  const scannerTeaser = page.locator("#page-scanner .teaser-strip");
  checks.teaserStrip = await scannerTeaser.isVisible();
  checks.freeGatingHint = await scannerTeaser
    .textContent()
    .then((t) => /lite mode|Terminal/i.test(t || ""));

  await page.locator('[data-action="explore"]').first().click();
  await page.waitForTimeout(600);
  checks.explorePanel = await page.evaluate(() => {
    const panel = document.getElementById("dmsRelPanel");
    return panel && !panel.hidden && panel.classList.contains("is-open");
  });

  await page.click("#dmsRelClose");
  await page.waitForTimeout(400);

  await page.locator('[data-action="movers"]').first().click();
  await page.waitForTimeout(1200);
  checks.moversOpensScan = await page.evaluate(
    () => document.getElementById("discoverScanRefine")?.open === true
  );

  await page.waitForTimeout(2000);
  checks.scanRanOrAttempted = await page.evaluate(() => {
    const grid = document.getElementById("scannerGrid");
    const hasCards = grid?.querySelectorAll(".scanner-card").length > 0;
    const stat = document.getElementById("scannerStatLabel")?.textContent || "";
    const ran = !stat.includes("click Run scan");
    const highlighted = !!document.querySelector(".scanner-card--story-highlight");
    return { hasCards, ran, highlighted };
  });

  checks.missionCopy = await page.evaluate(async () => {
    await new Promise((r) => setTimeout(r, 300));
    if (!window.MissionPathController) return { ok: false, reason: "no controller" };
    localStorage.removeItem("brieftick_mission_path_v1");
    window.MissionPathController.onAuthReady({ id: "discover_smoke", publicMetadata: {} });
    await new Promise((r) => setTimeout(r, 900));
    await document.querySelector("[data-mp-begin]")?.click();
    for (let i = 0; i < 3; i++) {
      await document.querySelector("[data-mp-verify]")?.click();
      await new Promise((r) => setTimeout(r, 350));
    }
    const lead = document.querySelector(".mp-prose--lead")?.textContent || "";
    const goto = document.querySelector("[data-mp-goto]")?.textContent || "";
    return {
      ok: lead.includes("market stories") && goto.includes("Discover"),
      lead: lead.slice(0, 80),
      goto,
    };
  });

  await page.close();
}

await browser.close();

const pass =
  errors.length === 0 &&
  checks.navDiscover &&
  checks.hero &&
  checks.sixCards &&
  checks.allCardsComplete &&
  checks.scanCollapsed &&
  checks.teaserStrip &&
  checks.freeGatingHint &&
  checks.explorePanel &&
  checks.moversOpensScan &&
  (checks.scanRanOrAttempted?.hasCards || checks.scanRanOrAttempted?.ran) &&
  checks.missionCopy?.ok;

console.log(JSON.stringify({ pass, errors, checks }, null, 2));
process.exit(pass ? 0 : 1);
