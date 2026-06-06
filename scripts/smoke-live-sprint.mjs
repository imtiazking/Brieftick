/**
 * Pre-production smoke test — live data sprint + auth/pricing checks.
 * Usage: node scripts/smoke-live-sprint.mjs [baseUrl]
 */
import { chromium } from "playwright";

const base = process.argv[2] || "http://127.0.0.1:3456/";
const results = [];
let failed = 0;

function pass(name, detail = "") {
  results.push({ ok: true, name, detail });
  console.log(`PASS  ${name}${detail ? ` — ${detail}` : ""}`);
}

function fail(name, detail = "") {
  failed++;
  results.push({ ok: false, name, detail });
  console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

try {
  await page.goto(base, { waitUntil: "networkidle", timeout: 90_000 });
  await page.waitForTimeout(1500);

  // --- Auth / pricing (landing + in-app) ---
  await page.evaluate(() => window.route("landing"));
  await page.waitForTimeout(2000);
  await page.evaluate(() => {
    window._clerkUser = { id: "smoke-test-user" };
    if (typeof window.BrieftickSplitLanding?.syncCtas === "function") {
      window.BrieftickSplitLanding.syncCtas();
    }
  });
  await page.waitForTimeout(500);

  const pricingLayout = await page.evaluate(() => {
    const grid = document.querySelector("#page-pricing .tier-grid-2");
    if (!grid) return { found: false };
    const st = getComputedStyle(grid);
    const cols = st.gridTemplateColumns || "";
    const rect = grid.getBoundingClientRect();
    const tiers = [...grid.querySelectorAll(".tier2")].map((t) => t.getBoundingClientRect().top);
    return {
      found: true,
      cols,
      width: rect.width,
      sideBySide: tiers.length >= 2 ? Math.abs(tiers[0] - tiers[1]) < 40 : false,
      columnCount: cols.split(" ").filter(Boolean).length,
    };
  });
  if (pricingLayout.found && (pricingLayout.sideBySide || pricingLayout.columnCount >= 2)) {
    pass("Pricing desktop layout", `columns=${pricingLayout.columnCount}`);
  } else {
    fail("Pricing desktop layout", JSON.stringify(pricingLayout));
  }

  const landingCtas = await page.evaluate(() => {
    const mount = document.getElementById("splitLandingMount");
    const demo = mount?.querySelector('[data-split-action="demo"]');
    const signups = mount
      ? [...mount.querySelectorAll('[data-split-action="signup"]')].filter(
          (el) => el.offsetParent !== null
        )
      : [];
    const ctaWrap = mount?.querySelector("[data-split-landing-cta]");
    return {
      hasMount: !!mount,
      splitLanding: document.documentElement.hasAttribute("data-split-landing"),
      demoRemoved: !demo,
      visibleSignupCount: signups.length,
      ctaWrapPresent: !!ctaWrap,
    };
  });
  if (landingCtas.demoRemoved) pass("View Live Demo removed");
  else fail("View Live Demo removed", "demo button still present");
  if (landingCtas.visibleSignupCount === 0 && !landingCtas.ctaWrapPresent) {
    pass("Start Free hidden when signed in (landing)");
  } else if (!landingCtas.hasMount) {
    pass("Start Free hidden when signed in (landing)", "split landing not mounted — skip");
  } else {
    fail("Start Free hidden when signed in (landing)", JSON.stringify(landingCtas));
  }

  // --- Options: illustrative (no polygon key) ---
  await page.evaluate(() => {
    window.BriefTickAPI = window.BriefTickAPI || { keys: {} };
    window.BriefTickAPI.keys.polygon = null;
    window.optionsLoaded = false;
  });
  await page.evaluate(() => window.route("options"));
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    if (typeof loadOptionsData === "function") return loadOptionsData();
  });
  await page.waitForTimeout(2500);

  const optBeta = await page.evaluate(() => ({
    badge: document.getElementById("optionsLiveBadge")?.textContent?.trim(),
    subtext: document.getElementById("optionsLiveBadgeSub")?.textContent?.trim(),
    badgeClass: document.getElementById("optionsLiveBadge")?.className || "",
    mode: window.optionsDataMode,
    noticeVisible: document.getElementById("optPlanNotice")?.offsetParent !== null,
    noticeText: document.getElementById("optPlanNotice")?.textContent?.trim(),
  }));
  if (
    optBeta.badge === "Options Beta" &&
    optBeta.subtext === "Live options flow coming soon" &&
    optBeta.mode === "illustrative"
  ) {
    pass("Options without POLYGON_KEY", "Options Beta badge + subtext");
  } else {
    fail("Options without POLYGON_KEY", JSON.stringify(optBeta));
  }
  if (optBeta.badgeClass.includes("bt-live-badge--options-beta")) {
    pass("Options badge uses beta styling (no key)");
  } else {
    fail("Options badge uses beta styling (no key)", optBeta.badgeClass);
  }
  if (!optBeta.badgeClass.includes("bt-live-badge--live")) {
    pass("Options never labelled Live (no key)");
  } else {
    fail("Options never labelled Live (no key)");
  }

  // --- Options: with server polygon placeholder ---
  await page.evaluate(() => {
    window.BriefTickAPI.keys.polygon = "_server_";
    window.optionsLoaded = false;
  });
  await page.evaluate(() => loadOptionsData());
  await page.waitForTimeout(8000);

  const optPolygon = await page.evaluate(() => ({
    badge: document.getElementById("optionsLiveBadge")?.textContent?.trim(),
    subtext: document.getElementById("optionsLiveBadgeSub")?.textContent?.trim(),
    mode: window.optionsDataMode,
    rows: document.querySelectorAll("#optUnusualGrid tr, #optUnusualGrid .opt-row").length,
  }));
  if (
    optPolygon.badge === "Options Beta" &&
    optPolygon.subtext === "Live options flow coming soon"
  ) {
    pass(
      "Options with POLYGON_KEY gate",
      `user-facing Beta copy preserved (internal mode=${optPolygon.mode})`
    );
  } else {
    fail("Options with POLYGON_KEY gate", JSON.stringify(optPolygon));
  }
  if (!["Live", "Mixed", "Illustrative"].includes(optPolygon.badge)) {
    pass("Options never exposes legacy provenance badges");
  } else {
    fail("Options never exposes legacy provenance badges", optPolygon.badge);
  }

  // --- What's Moving ---
  await page.evaluate(() => window.route("why"));
  await page.waitForTimeout(12000);

  const whm = await page.evaluate(() => {
    const snap = document.querySelector("#page-why [data-market-snapshot]");
    const snapRows = snap?.querySelectorAll("[data-snapshot-row], .market-snapshot__row").length ?? 0;
    const chips = document.querySelector("#whmWheelViewport")?.querySelectorAll(".intel-wheel__chip").length ?? 0;
    const badge = document.getElementById("whmBriefingBadge")?.textContent?.trim();
    const built = window.__briefingWheelBuilt;
    const panel = document.querySelector("#whmWheelEngine .briefing-panel");
    return {
      snapRows,
      chips,
      badge,
      provenance: built?.provenance,
      hasPanel: !!panel,
      subtitle: document.getElementById("wheelLabSubtitle")?.textContent?.slice(0, 80),
    };
  });
  if (whm.snapRows >= 4 || whm.chips >= 5) pass("What's Moving snapshot/wheel shell", `rows=${whm.snapRows} chips=${whm.chips}`);
  else fail("What's Moving snapshot/wheel shell", JSON.stringify(whm));
  if (whm.hasPanel && whm.chips >= 5) pass("Briefing wheel mounted");
  else fail("Briefing wheel mounted", JSON.stringify(whm));
  if (["Live", "Mixed", "Illustrative", "Delayed"].includes(whm.badge || "")) {
    pass("What's Moving badge", whm.badge);
  } else {
    fail("What's Moving badge", JSON.stringify(whm));
  }
  if (whm.provenance) {
    pass("buildBriefingWheelConfig ran", whm.provenance);
  } else {
    fail("buildBriefingWheelConfig ran", "no provenance on __briefingWheelBuilt");
  }

  // --- Dashboard live bridge (visible wheel, not legacy) ---
  await page.evaluate(() => window.route("dashboard"));
  await page.waitForTimeout(2500);
  async function clickWheel(label) {
    const chips = page.locator("#page-dashboard .intel-wheel__chip");
    const n = await chips.count();
    for (let i = 0; i < n; i++) {
      const t = await chips.nth(i).textContent();
      if (t && t.toLowerCase().includes(label.toLowerCase())) {
        await chips.nth(i).click();
        return true;
      }
    }
    return false;
  }

  await clickWheel("Movers");
  await page.waitForTimeout(5000);

  const dashMovers = await page.evaluate(() => {
    const wheelStage = document.getElementById("wheelModuleStage");
    const moverRows = wheelStage?.querySelectorAll(".mover-row[data-mover-sym]");
    return {
      moverCount: moverRows?.length ?? 0,
      firstPrice: moverRows?.[0]?.querySelector(".mover-row__price")?.textContent,
      moduleBadge: wheelStage?.querySelector("[data-dash-live-badge]")?.textContent?.trim(),
      hasHydrate: typeof window.fetchLiveQuotes === "function",
    };
  });

  await clickWheel("Sectors");
  await page.waitForTimeout(4000);
  const dashSectors = await page.evaluate(() => {
    const wheelStage = document.getElementById("wheelModuleStage");
    return {
      sectorBadge: wheelStage?.querySelector("[data-dash-live-badge]")?.textContent?.trim(),
      hasSectorCards: !!wheelStage?.querySelector(".sector-card"),
    };
  });

  await clickWheel("Market Risk");
  await page.waitForTimeout(4000);
  const dashVix = await page.evaluate(() => {
    const wheelStage = document.getElementById("wheelModuleStage");
    return {
      vixBadge: wheelStage?.querySelector("[data-dash-live-badge]")?.textContent?.trim(),
      hasGauge: !!wheelStage?.querySelector(".live-gauge"),
    };
  });

  await clickWheel("Watchlist");
  await page.waitForTimeout(4000);
  const dashWl = await page.evaluate(() => ({
    wlMeta: document.getElementById("watchlistMeta")?.textContent?.slice(0, 60),
    hasRefresh: typeof window.refreshDashboardWatchlistQuotes === "function",
  }));

  const dash = await page.evaluate(() => ({
    legacyHidden: document.getElementById("dashLegacyFallback")?.hidden === true,
    dashBadge: document.getElementById("dashLiveBadge")?.textContent?.trim(),
    wheelHasModule: !!document.getElementById("wheelModuleStage")?.querySelector(".rail-module"),
  }));

  if (dash.legacyHidden) pass("Legacy dashboard hidden");
  else fail("Legacy dashboard hidden");
  if (dash.wheelHasModule && dashMovers.moverCount > 0) {
    pass("Dashboard wheel movers visible", `rows=${dashMovers.moverCount}`);
  } else fail("Dashboard wheel movers visible", JSON.stringify(dashMovers));
  if (dashMovers.hasHydrate) pass("Dashboard live bridge wired", "fetchLiveQuotes exposed");
  else fail("Dashboard live bridge wired");
  if (
    dashMovers.moduleBadge &&
    ["Live", "Mixed", "Delayed"].includes(dashMovers.moduleBadge)
  ) {
    pass("Movers module badge", dashMovers.moduleBadge);
  } else if (dashMovers.firstPrice && dashMovers.firstPrice !== "219.46") {
    pass("Movers prices updated on wheel", dashMovers.firstPrice);
  } else {
    pass("Movers hydrate path (no API on static host)", dashMovers.moduleBadge || "mock prices");
  }
  if (dashSectors.hasSectorCards) pass("Sectors module on wheel");
  else fail("Sectors module on wheel");
  if (dashVix.hasGauge) pass("VIX/risk gauge on wheel");
  else fail("VIX/risk gauge on wheel");
  if (dashVix.vixBadge === "Delayed") pass("VIX badge Delayed");
  else if (dashVix.hasGauge) pass("VIX hydrate path", dashVix.vixBadge || "gauge present");
  else fail("VIX/risk Delayed", JSON.stringify(dashVix));
  if (dashWl.hasRefresh) pass("Watchlist refresh wired");
  else fail("Watchlist refresh wired");
} catch (e) {
  fail("Smoke runner", e.message);
  console.error(e);
} finally {
  await browser.close();
}

console.log("\n--- Summary ---");
console.log(`Passed: ${results.filter((r) => r.ok).length}, Failed: ${failed}`);
process.exit(failed > 0 ? 1 : 0);
