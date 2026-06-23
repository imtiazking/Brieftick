import { chromium } from "playwright";

const BASE = process.env.SMOKE_BASE || "http://127.0.0.1:3458";
const checks = {};
const errors = [];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
page.on("pageerror", (e) => errors.push(e.message));

try {
  await page.goto(BASE + "/?qa=1", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2000);
  await page.evaluate(() => window.route("dashboard"));
  await page.waitForTimeout(2500);
  await page.evaluate(async () => {
    window.fetchLiveQuotes = async (symbols) => {
      const out = {};
      for (const s of symbols) {
        out[s] = { price: 100, pctChange: s === "NVDA" ? 3.2 : 0.8 };
      }
      return out;
    };
    window.getBrieftickSectorSnapshot = () => [
      { sym: "XLK", name: "Technology", pct: 1.8 },
      { sym: "XLE", name: "Energy", pct: 0.9 },
    ];
    window.riskState = {
      quotes: { SPY: { pctChange: 0.6 }, QQQ: { pctChange: 1.2 }, NVDA: { pctChange: 3.2 } },
      rates: { dgs10: 4.32, dgs10Change: 0.06, dgs2: 4.1 },
      vix: 14.2,
    };
    window._briefTickImpactData = [];
    try {
      const mod = await import("/preview/dashboard-wheel-core.js");
      mod.selectWheelModule("news");
    } catch {
      const chips = document.querySelectorAll("#page-dashboard .intel-wheel__chip");
      for (const chip of chips) {
        if (/news/i.test(chip.textContent || "")) chip.click();
      }
    }
  });
  await page.waitForTimeout(3000);
  await page.evaluate(async () => {
    if (window.refreshNewsStoryState) {
      await window.refreshNewsStoryState({ refreshImpact: false, fetchOil: false });
    }
  });
  await page.waitForTimeout(500);

  const engine = await page.evaluate(async () => {
    const { STORY_REGISTRY } = await import("/lib/dashboard-news-story-registry.js");
    const { computeDashboardNewsSnapshot } = await import(
      "/lib/dashboard-news-story-engine.js"
    );
    const snap = computeDashboardNewsSnapshot({
      quotes: {
        NVDA: { pctChange: 3.2 },
        AMD: { pctChange: 2.1 },
        AVGO: { pctChange: 1.4 },
        XLK: { pctChange: 1.8 },
        QQQ: { pctChange: 1.2 },
        SOXX: { pctChange: 2.5 },
        XLF: { pctChange: 1.1 },
        SPY: { pctChange: 0.6 },
        EWG: { pctChange: -0.3 },
        UUP: { pctChange: 0.4 },
        XLE: { pctChange: 0.9 },
      },
      sectors: [
        { sym: "XLK", name: "Technology", pct: 1.8 },
        { sym: "XLE", name: "Energy", pct: 0.9 },
      ],
      rates: { dgs10: 4.32, dgs10Change: 0.06, dgs2: 4.1 },
      oil: { price: 78.5, change: 0.4 },
      calendarCards: [
        {
          id: "earn:BAC:2026-07-14",
          dateIso: "2026-07-14",
          event: "BAC earnings",
          type: "Earnings",
          source: "Finnhub",
        },
        {
          id: "fred:2026-06-25:53",
          dateIso: "2026-06-25",
          event: "Gross Domestic Product",
          type: "Growth",
          source: "FRED",
        },
      ],
      priorSnapshot: {
        savedAt: Date.now() - 86400000,
        stories: {
          inflation: { strength: 70, status: "stable" },
          ai: { strength: 60, status: "stable" },
          europe: { strength: 55, status: "stable" },
          energy: { strength: 50, status: "stable" },
        },
      },
    });
    const hasHardcodedHeadline = STORY_REGISTRY.some((s) => s.headline);
    const hasPrimaryFlag = STORY_REGISTRY.some((s) => s.primary);
    const ranked = snap.stories.map((s) => s.id);
    const strengths = snap.allStories.map((s) => s.live.strength);
    const sortedStrengths = [...strengths].sort((a, b) => b - a);
    const strengthRanked =
      JSON.stringify(snap.stories.map((s) => s.live.strength)) ===
      JSON.stringify(sortedStrengths.slice(0, snap.stories.length));
    const aiStory = snap.allStories.find((s) => s.id === "ai");
    const energyHidden =
      snap.hiddenStoryIds?.includes("energy") ||
      !snap.stories.some((s) => s.id === "energy");
    return {
      registryStoryCount: STORY_REGISTRY.length,
      snapshotStoryCount: snap.stories.length,
      noHardcodedHeadlines: !hasHardcodedHeadline,
      noPrimaryFlag: !hasPrimaryFlag,
      strengthRanked,
      primaryIsStrongest: snap.primaryStoryId === ranked[0],
      aiHeadlineGenerated: Boolean(aiStory?.live?.headline?.length),
      aiHasNvdaBullet: snap.stories
        .find((s) => s.id === "ai")
        ?.live.whatChangedToday.some((b) => b.includes("NVDA")),
      aiWatchingLive: snap.stories
        .find((s) => s.id === "ai")
        ?.live.whatCouldChangeIt.some((b) => /earnings on/i.test(b)),
      weakEnergyHidden: energyHidden,
      allStoriesHaveGeneratedHeadline: snap.stories.every((s) => s.live.headline?.length > 5),
      allHaveSourceLabel: snap.stories.every((s) => s.live.sourceLabel?.includes("Source:")),
      sinceLastVisitPopulated: snap.sinceLastVisit.length === 4,
      primaryHeadline: snap.stories[0]?.live?.headline,
    };
  });
  Object.assign(checks, engine);

  const ui = await page.evaluate(() => {
    const panel = document.querySelector("[data-news-live-panel]");
    const visual = document.querySelector(".news-narrative__visual");
    const snap = window.dashboardNewsSnapshot;
    const headline = document.querySelector("[data-news-headline]")?.textContent?.trim();
    const source = panel?.querySelector("[data-news-source]")?.textContent?.trim();
    return {
      hasPanel: Boolean(panel),
      hasStatus: Boolean(panel?.querySelector("[data-news-status]")),
      hasStrength: Boolean(panel?.querySelector("[data-news-strength]")),
      hasChangedList: Boolean(panel?.querySelector("[data-news-changed-list]")),
      hasSince: Boolean(panel?.querySelector("[data-news-since]")),
      hasSource: Boolean(panel?.querySelector("[data-news-source]")),
      globeBound: visual?.dataset.globeBound === "true",
      snapshotOk: Boolean(snap?.stories?.length >= 1),
      strengthText: panel?.querySelector("[data-news-strength]")?.textContent || "",
      bulletCount: panel?.querySelectorAll("[data-news-changed-list] li").length || 0,
      headline,
      source,
      registryHeadlineGone: !headline?.includes("Inflation Is Driving Markets"),
    };
  });

  checks.uiLivePanel = ui.hasPanel;
  checks.uiStatus = ui.hasStatus;
  checks.uiStrength = ui.hasStrength;
  checks.uiChangedList = ui.hasChangedList;
  checks.uiSinceBlock = ui.hasSince;
  checks.uiSourceLine = ui.hasSource;
  checks.uiSnapshot = ui.snapshotOk;
  checks.uiStrengthPopulated = /\d+\s*\/\s*100/.test(ui.strengthText);
  checks.uiBullets = ui.bulletCount >= 1;
  checks.uiDynamicHeadline = Boolean(ui.headline && ui.headline.length > 5);
  checks.uiNoStaticHeadline = ui.registryHeadlineGone;
  checks.globeStillBound = ui.globeBound;
} catch (e) {
  errors.push(String(e.message || e));
}

await browser.close();

const pass =
  errors.length === 0 &&
  checks.registryStoryCount === 4 &&
  checks.snapshotStoryCount >= 1 &&
  checks.noHardcodedHeadlines &&
  checks.noPrimaryFlag &&
  checks.strengthRanked &&
  checks.primaryIsStrongest &&
  checks.allStoriesHaveGeneratedHeadline &&
  checks.allHaveSourceLabel &&
  checks.aiHeadlineGenerated &&
  checks.uiLivePanel &&
  checks.uiSnapshot &&
  checks.uiStrengthPopulated &&
  checks.uiBullets &&
  checks.uiDynamicHeadline;

console.log(JSON.stringify({ pass, errors, checks }, null, 2));
process.exit(pass ? 0 : 1);
