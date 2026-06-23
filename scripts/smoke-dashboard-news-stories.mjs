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
        XOM: { pctChange: 0.7 },
      },
      sectors: [
        { sym: "XLK", name: "Technology", pct: 1.8 },
        { sym: "XLE", name: "Energy", pct: 0.9 },
      ],
      rates: { dgs10: 4.32, dgs10Change: 0.06, dgs2: 4.1 },
      oil: { price: 78.5, change: 0.4 },
      calendarCards: [],
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
    const aiStory = snap.stories.find((s) => s.id === "ai") || snap.allStories.find((s) => s.id === "ai");
    return {
      registryStoryCount: STORY_REGISTRY.length,
      snapshotStoryCount: snap.stories.length,
      noHardcodedHeadlines: !STORY_REGISTRY.some((s) => s.headline),
      noPrimaryFlag: !STORY_REGISTRY.some((s) => s.primary),
      primaryIsStrongest: snap.primaryStoryId === snap.stories[0]?.id,
      aiEvidenceRows: aiStory?.live?.evidenceRows || [],
      aiHasNvdaEvidence: aiStory?.live?.evidenceRows?.some((r) => r.id === "NVDA" && r.value === 3.2),
      allStoriesHaveEvidence: snap.stories.every((s) => s.live?.evidenceRows?.length > 0),
      primaryHeadline: snap.stories[0]?.live?.headline,
    };
  });
  Object.assign(checks, engine);

  const ui = await page.evaluate(() => {
    const panel = document.querySelector("[data-news-live-panel]");
    const snap = window.dashboardNewsSnapshot;
    const activeId =
      document.querySelector(".news-narrative-hero")?.dataset.activeStory ||
      snap?.primaryStoryId;
    const story =
      snap?.stories?.find((s) => s.id === activeId) ||
      snap?.allStories?.find((s) => s.id === activeId);
    const evidenceRows = story?.live?.evidenceRows || [];

    const domRows = [...document.querySelectorAll("[data-evidence-row-id]")].map((el) => ({
      id: el.dataset.evidenceRowId,
      value: el.dataset.evidenceValue,
      display: el.dataset.evidenceDisplay,
      text: el.querySelector(".news-evidence-chart__value")?.textContent?.trim(),
    }));

    const evidenceMatchesSnapshot = evidenceRows.every((row) => {
      const dom = domRows.find((d) => d.id === row.id);
      if (!dom) return false;
      if (row.value == null) return dom.text === "—";
      return (
        dom.value === String(row.value) &&
        dom.display === row.displayValue &&
        dom.text === row.displayValue
      );
    });

    const footer = document.querySelector("[data-evidence-footer]")?.textContent || "";
    const hasGlobeCanvas = Boolean(document.querySelector(".news-globe-canvas"));
    const hasGlobeThree = Boolean(document.querySelector("[data-globe-bound]"));

    return {
      hasPanel: Boolean(panel),
      hasEvidenceChart: Boolean(document.querySelector("[data-news-evidence-chart]")),
      evidenceHeader: document.querySelector(".news-evidence-chart__header")?.textContent?.trim(),
      evidenceRowCount: domRows.length,
      evidenceMatchesSnapshot: evidenceMatchesSnapshot && domRows.length === evidenceRows.length,
      evidenceFooterHasSource: /Source:/i.test(footer),
      evidenceFooterHasUpdated: /Updated:/i.test(footer),
      noGlobeCanvas: !hasGlobeCanvas,
      noGlobeBound: document.querySelector(".news-narrative__visual")?.dataset.globeBound !== "true",
      snapshotOk: Boolean(snap?.stories?.length >= 1),
      strengthText: panel?.querySelector("[data-news-strength]")?.textContent || "",
      bulletCount: panel?.querySelectorAll("[data-news-changed-list] li").length || 0,
      activeStoryId: activeId,
      nvdaDomValue: domRows.find((r) => r.id === "NVDA")?.value,
    };
  });

  checks.uiLivePanel = ui.hasPanel;
  checks.uiEvidenceChart = ui.hasEvidenceChart;
  checks.uiEvidenceHeader = ui.evidenceHeader === "Story Evidence";
  checks.uiEvidenceRows = ui.evidenceRowCount >= 4;
  checks.uiEvidenceMatchesSnapshot = ui.evidenceMatchesSnapshot;
  checks.uiEvidenceFooter = ui.evidenceFooterHasSource && ui.evidenceFooterHasUpdated;
  checks.noGlobeInProduction = ui.noGlobeCanvas && ui.noGlobeBound;
  checks.uiSnapshot = ui.snapshotOk;
  checks.uiStrengthPopulated = /\d+\s*\/\s*100/.test(ui.strengthText);
  checks.uiBullets = ui.bulletCount >= 1;
  checks.nvdaDomMatchesQuote = ui.nvdaDomValue === "3.2";
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
  checks.primaryIsStrongest &&
  checks.aiHasNvdaEvidence &&
  checks.allStoriesHaveEvidence &&
  checks.uiEvidenceChart &&
  checks.uiEvidenceHeader &&
  checks.uiEvidenceRows &&
  checks.uiEvidenceMatchesSnapshot &&
  checks.uiEvidenceFooter &&
  checks.noGlobeInProduction &&
  checks.uiSnapshot &&
  checks.uiStrengthPopulated &&
  checks.uiBullets;

console.log(JSON.stringify({ pass, errors, checks }, null, 2));
process.exit(pass ? 0 : 1);
