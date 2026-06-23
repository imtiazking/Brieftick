#!/usr/bin/env node
/**
 * News Intelligence before/after audit — strength, ranking, headlines, inputs.
 * Usage: node scripts/audit-news-intelligence.mjs [baseUrl]
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const BASE = process.argv[2] || process.env.SMOKE_BASE || "https://www.forgeniq.com/";
const OUT = join(ROOT, "reports", "news-intelligence-audit.json");

/** @param {import('playwright').Page} page */
async function probeNewsSnapshot(page) {
  return page.evaluate(async () => {
    const { STORY_REGISTRY } = await import("/lib/dashboard-news-story-registry.js");
    const { computeDashboardNewsSnapshot } = await import(
      "/lib/dashboard-news-story-engine.js"
    );

    const rs = window.riskState || {};
    let quotes = { ...(rs.quotes || {}) };
    if (window.fetchLiveQuotes) {
      const syms = ["EWG", "UUP", "XLE", "XOM", "AMD", "AVGO", "SOXX", "CVX", "XLF", "XLK"];
      const live = await window.fetchLiveQuotes(syms);
      quotes = { ...quotes, ...live };
    }

    let oil = { price: null, change: null };
    try {
      const res = await fetch("/api/proxy?provider=fred&series=DCOILWTICO");
      const d = await res.json();
      oil = {
        price: parseFloat(d?.value),
        change: d?.change != null ? parseFloat(d.change) : null,
      };
    } catch {
      /* ignore */
    }

    let calendarCards = [];
    try {
      const { fetchWhatMattersFeed } = await import("/lib/what-matters-feed.js");
      const feed = await fetchWhatMattersFeed({ limit: 12 });
      calendarCards = feed.cards || [];
    } catch {
      /* ignore */
    }

    const prior = (() => {
      try {
        return JSON.parse(localStorage.getItem("bt_news_story_snapshot_v1") || "null");
      } catch {
        return null;
      }
    })();

    const input = {
      quotes,
      rates: rs.rates || {},
      vix: rs.vix,
      oil,
      calendarCards,
      impactItems: window._briefTickImpactData || [],
      sectors: window.getBrieftickSectorSnapshot?.() || [],
      priorSnapshot: prior,
    };

    const snap = computeDashboardNewsSnapshot(input);

    const quoteInputs = Object.fromEntries(
      Object.entries(quotes).map(([k, v]) => [k, v?.pctChange])
    );

    return {
      registryHasHeadlines: STORY_REGISTRY.some((s) => "headline" in s && s.headline),
      registryHasPrimary: STORY_REGISTRY.some((s) => s.primary),
      primaryStoryId: snap.primaryStoryId,
      hiddenStoryIds: snap.hiddenStoryIds || [],
      visibleStories: snap.stories.map((s, rank) => ({
        rank: rank + 1,
        id: s.id,
        headline: s.live.headline,
        strength: s.live.strength,
        confidence: s.live.confidence,
        confidencePct: s.live.confidencePct,
        dataCoverage: s.live.dataCoverage,
        status: s.live.status,
        inputsUsed: s.live.inputsUsed,
        sourceLabel: s.live.sourceLabel,
        updatedAtUtc: s.live.updatedAtUtc,
        whatChangedToday: s.live.whatChangedToday,
        whatCouldChangeIt: s.live.whatCouldChangeIt,
      })),
      allStoriesRanked: snap.allStories.map((s, rank) => ({
        rank: rank + 1,
        id: s.id,
        headline: s.live.headline,
        strength: s.live.strength,
        confidence: s.live.confidence,
        hidden:
          snap.hiddenStoryIds?.includes(s.id) ||
          !snap.stories.some((v) => v.id === s.id),
      })),
      liveInputs: {
        quotes: quoteInputs,
        rates: rs.rates,
        oil,
        calendarEventCount: calendarCards.length,
        impactItemCount: (window._briefTickImpactData || []).length,
      },
      checks: {
        noHardcodedHeadlines: !STORY_REGISTRY.some((s) => s.headline),
        noPrimaryOverride: !STORY_REGISTRY.some((s) => s.primary),
        strengthBasedRanking:
          snap.stories.length <= 1 ||
          snap.stories.every((s, i, arr) => !arr[i + 1] || s.live.strength >= arr[i + 1].live.strength),
        primaryIsTopVisible: snap.stories[0]?.id === snap.primaryStoryId,
        allVisibleHaveLiveHeadlines: snap.stories.every(
          (s) => s.live.headline && s.live.headline.length > 8
        ),
        weakStoriesHidden: (snap.hiddenStoryIds || []).every((id) => {
          const row = snap.allStories.find((s) => s.id === id);
          return row && row.live.strength < 25 && row.live.confidence === "low";
        }),
      },
    };
  });
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto(BASE.replace(/\/$/, "") + "/", {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });
  await page.waitForTimeout(2000);
  await page.evaluate(() => window.route("dashboard"));
  await page.waitForTimeout(4000);
  await page.evaluate(async () => {
    if (window.refreshMarketRiskState) {
      await window.refreshMarketRiskState({
        fetchQuotes: true,
        fetchMacro: true,
        refreshImpact: true,
      });
    }
  });
  await page.waitForTimeout(3000);

  const chips = page.locator("#page-dashboard .intel-wheel__chip");
  const n = await chips.count();
  for (let i = 0; i < n; i++) {
    const t = await chips.nth(i).textContent();
    if (/news/i.test(t || "")) {
      await chips.nth(i).click();
      break;
    }
  }
  await page.waitForTimeout(2000);
  if (await page.evaluate(() => typeof window.refreshNewsStoryState === "function")) {
    await page.evaluate(() =>
      window.refreshNewsStoryState({ refreshImpact: true, fetchOil: true })
    );
  }
  await page.waitForTimeout(3000);

  const after = await probeNewsSnapshot(page);

  const ui = await page.evaluate(() => {
    const snap = window.dashboardNewsSnapshot;
    return {
      headline: document.querySelector("[data-news-headline]")?.textContent?.trim(),
      sourceLine: document.querySelector("[data-news-source]")?.textContent?.trim(),
      timelineNodeCount: document.querySelectorAll(".news-story-node[data-story-id]").length,
      visibleStoryIds: snap?.stories?.map((s) => s.id),
    };
  });

  await browser.close();

  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl: BASE,
    phase: "after",
    before: {
      note: "Prior audit — editorial primary (inflation), hardcoded headlines, registry order, weak stories always shown",
      exampleHeadlines: [
        "Inflation Is Driving Markets",
        "US Markets Are Outpacing Europe",
        "Steady Oil Prices Are Helping Energy Stocks",
      ],
      ranking: "Registry order with primary: true on inflation",
    },
    after,
    ui,
    errors,
    pass:
      errors.length === 0 &&
      after.checks.noHardcodedHeadlines &&
      after.checks.noPrimaryOverride &&
      after.checks.strengthBasedRanking &&
      after.checks.primaryIsTopVisible &&
      after.checks.allVisibleHaveLiveHeadlines &&
      after.checks.weakStoriesHidden,
  };

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ pass: report.pass, out: OUT, checks: after.checks, visible: after.visibleStories }, null, 2));
  process.exit(report.pass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
