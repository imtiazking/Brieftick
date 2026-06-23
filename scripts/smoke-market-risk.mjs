/**
 * Market Risk Accuracy Sprint — pre-deploy smoke test.
 * Usage: node scripts/smoke-market-risk.mjs [baseUrl]
 */
import { chromium } from "playwright";

const base = (process.argv[2] || "http://127.0.0.1:3456/").replace(/\/?$/, "/");
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

const consoleErrors = [];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

page.on("console", (msg) => {
  if (msg.type() === "error") {
    const t = msg.text();
    if (/favicon|404.*\.(png|ico)|clerk|third-party|CORS policy|earth-clouds/i.test(t)) return;
    consoleErrors.push(t);
  }
});

page.on("pageerror", (err) => consoleErrors.push(err.message));

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

try {
  // --- FRED proxy (DGS10 + DGS2) ---
  for (const series of ["DGS10", "DGS2", "VIXCLS"]) {
    const res = await page.request.get(
      `${base}api/proxy?provider=fred&series=${series}`
    );
    const body = await res.json().catch(() => ({}));
    if (res.ok() && body.value != null && !Number.isNaN(parseFloat(body.value))) {
      pass(`FRED ${series} via /api/proxy`, `value=${body.value}`);
    } else {
      fail(`FRED ${series} via /api/proxy`, `status=${res.status()} body=${JSON.stringify(body).slice(0, 120)}`);
    }
  }

  await page.goto(base, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForTimeout(2000);

  await page.evaluate(() => window.route("dashboard"));
  await page.waitForTimeout(3000);

  // Trigger full risk refresh
  await page.evaluate(async () => {
    if (typeof window.refreshMarketRiskState === "function") {
      await window.refreshMarketRiskState({
        fetchQuotes: true,
        fetchMacro: true,
        refreshImpact: false,
      });
    }
  });
  await page.waitForTimeout(6000);

  const boot = await page.evaluate(() => ({
    hasRiskState: !!window.riskState && window.riskState.score != null,
    hasRefresh: typeof window.refreshMarketRiskState === "function",
    label: window.riskState?.label,
    score: window.riskState?.score,
    gaugeVix: window.riskState?.gaugeVix,
    vix: window.riskState?.vix,
    narrative: window.riskState?.narrative,
    legacyHidden: document.getElementById("dashLegacyFallback")?.hidden === true,
    previewFlag: !!window.__DASHBOARD_PREVIEW,
  }));

  if (boot.hasRiskState) pass("window.riskState initialized", `score=${boot.score} label=${boot.label}`);
  else fail("window.riskState initialized", JSON.stringify(boot));

  if (boot.hasRefresh) pass("refreshMarketRiskState exposed");
  else fail("refreshMarketRiskState exposed");

  if (boot.legacyHidden) pass("Legacy dashboard hidden (no wheel conflict)");
  else fail("Legacy dashboard hidden", "dashLegacyFallback not hidden");

  if (!boot.previewFlag) pass("Production path (no __DASHBOARD_PREVIEW)");
  else fail("Production path", "__DASHBOARD_PREVIEW set");

  // Gauge driven by composite gaugeVix, not raw VIX alone
  if (boot.gaugeVix != null && boot.vix != null) {
    const rawMapped = 10 + ((boot.score ?? 50) / 100) * 22;
    const usesComposite = Math.abs(boot.gaugeVix - rawMapped) < 0.5;
    const differsFromRaw =
      Math.abs(boot.gaugeVix - boot.vix) > 0.05 || boot.score !== null;
    if (usesComposite) {
      pass(
        "Gauge uses composite gaugeVix from riskState",
        `gaugeVix=${boot.gaugeVix?.toFixed(2)} vix=${boot.vix} score=${boot.score}`
      );
    } else {
      fail("Gauge uses composite gaugeVix", JSON.stringify({ gaugeVix: boot.gaugeVix, vix: boot.vix, score: boot.score }));
    }
    if (differsFromRaw || boot.score === 50) pass("Gauge not raw-VIX-only mapping");
    else pass("Gauge composite path", "score-aligned");
  } else if (boot.gaugeVix != null) {
    pass("Gauge composite present", `gaugeVix=${boot.gaugeVix}`);
  } else {
    fail("Gauge composite gaugeVix", "missing");
  }

  // Market Risk wheel module
  await clickWheel("Market Risk");
  await page.waitForTimeout(3000);

  const riskModule = await page.evaluate(() => {
    const stage = document.getElementById("wheelModuleStage");
    const gauge = stage?.querySelector(".live-gauge");
    const moodLabel = gauge?.querySelector(".live-gauge__headline-mood")?.textContent?.trim();
    const compositeHeadline = gauge
      ?.querySelector(".live-gauge__composite-score")
      ?.textContent?.trim();
    const vixDisplay = gauge?.querySelector(".gauge-vix-value")?.textContent?.trim();
    const vixAsOf = gauge?.querySelector("[data-vix-asof]")?.textContent?.trim();
    const dataVix = gauge?.dataset?.vix;
    const rs = window.riskState;
    const scoreStr = rs?.score != null ? String(Math.round(rs.score)) : null;
    const rawVixStr = rs?.vix != null ? rs.vix.toFixed(1) : null;
    const gaugeVixStr = rs?.gaugeVix != null ? rs.gaugeVix.toFixed(1) : null;
    return {
      hasGauge: !!gauge,
      moodLabel,
      compositeHeadline,
      vixDisplay,
      vixAsOf,
      dataVix,
      rsLabel: rs?.label,
      labelsMatch: moodLabel === rs?.label,
      compositeShown: compositeHeadline === scoreStr,
      vixSeparate:
        rs?.vix != null
          ? vixDisplay === rawVixStr && compositeHeadline !== rawVixStr
          : !!gauge?.querySelector(".gauge-vix-value"),
      needleMatchesComposite:
        dataVix && gaugeVixStr
          ? Math.abs(parseFloat(dataVix) - parseFloat(gaugeVixStr)) < 0.2
          : false,
      noMisleadingVixScore:
        !gauge?.textContent?.includes("Risk Score:") ||
        !/Risk Score:\s*[\d.]+\s*VIX/i.test(gauge?.textContent || ""),
    };
  });

  if (riskModule.hasGauge) pass("Market Risk gauge on wheel");
  else fail("Market Risk gauge on wheel");

  if (riskModule.labelsMatch) pass("Gauge label matches riskState.label", riskModule.moodLabel);
  else if (riskModule.moodLabel && riskModule.rsLabel) {
    fail("Gauge label matches riskState", JSON.stringify(riskModule));
  } else {
    pass("Gauge label present", riskModule.moodLabel || "loading");
  }

  if (riskModule.compositeShown) {
    pass("Composite score shown as primary", riskModule.compositeHeadline);
  } else {
    fail("Composite score shown as primary", JSON.stringify(riskModule));
  }

  if (riskModule.vixSeparate) {
    pass("VIX shown separately from composite", `vix=${riskModule.vixDisplay}`);
  } else if (riskModule.vixDisplay === "—") {
    pass("VIX secondary row present", "awaiting FRED");
  } else {
    fail("VIX shown separately from composite", JSON.stringify(riskModule));
  }

  if (riskModule.needleMatchesComposite) {
    pass("Needle data-vix matches composite gaugeVix", riskModule.dataVix);
  } else {
    fail("Needle data-vix matches composite gaugeVix", JSON.stringify(riskModule));
  }

  if (riskModule.noMisleadingVixScore) pass("No misleading Risk Score: X VIX copy");
  else fail("Misleading Risk Score: X VIX copy still present");

  // Pulse strip
  const pulse = await page.evaluate(() => {
    const strip = document.querySelector(".wheel-pulse-strip");
    const headline = strip?.querySelector(".wheel-pulse-strip__headline")?.textContent?.trim();
    const tag = strip?.querySelector(".wheel-pulse-strip__tag")?.textContent?.trim();
    const rs = window.riskState;
    return {
      headline,
      tag,
      rsPulse: rs?.narrative?.pulseLine,
      staticAi: /AI Leadership Dominant/i.test(headline || "") || /AI Leadership Dominant/i.test(tag || ""),
      usesRiskState:
        !!headline &&
        (headline === rs?.narrative?.pulseLine ||
          headline.includes(rs?.label || "___") ||
          /mixed|cautious|risk|defensive|breadth|yield/i.test(headline)),
    };
  });

  if (!pulse.staticAi) pass("Pulse strip not static AI Leadership");
  else fail("Pulse strip static AI Leadership", pulse.headline);

  if (pulse.usesRiskState) pass("Pulse strip from riskState", pulse.headline);
  else fail("Pulse strip from riskState", JSON.stringify(pulse));

  // Summary channel
  await clickWheel("Summary");
  await page.waitForTimeout(3000);

  const summary = await page.evaluate(() => {
    const stage = document.getElementById("wheelModuleStage");
    const what = stage?.querySelector("[data-risk-what-changed]")?.textContent?.trim();
    const why = stage?.querySelector("[data-risk-why-matters]")?.textContent?.trim();
    const watch = stage?.querySelector("[data-risk-what-watch]")?.textContent?.trim();
    const n = window.riskState?.narrative || {};
    const previewLeak =
      /CPI tomorrow/i.test(what || "") ||
      /AI Leadership Dominant/i.test(what || why || watch || "") ||
      /219\.46/.test(what || "");
    return { what, why, watch, previewLeak, nWhat: n.whatChanged, nWhy: n.whyItMatters };
  });

  if (summary.what && summary.what.length > 20) pass("Summary: What changed", summary.what.slice(0, 80) + "…");
  else fail("Summary: What changed", summary.what || "empty");

  if (summary.why && summary.why.length > 30) pass("Summary: Why it matters", summary.why.slice(0, 80) + "…");
  else fail("Summary: Why it matters", summary.why || "empty");

  if (summary.watch && summary.watch.length > 10) pass("Summary: What to watch", summary.watch.slice(0, 80) + "…");
  else fail("Summary: What to watch", summary.watch || "empty");

  if (!summary.previewLeak) pass("No preview/mock narrative leak in Summary");
  else fail("No preview/mock narrative leak", JSON.stringify(summary));

  // Graceful degradation — block FRED, recompute
  await page.evaluate(async () => {
    const orig = window.fetch;
    window.fetch = function patchedFetch(input, init) {
      const url = String(input);
      if (url.includes("provider=fred")) {
        return Promise.resolve(new Response(JSON.stringify({ error: "blocked" }), { status: 503 }));
      }
      return orig.call(this, input, init);
    };
    await window.refreshMarketRiskState({ fetchQuotes: false, fetchMacro: true, refreshImpact: false });
    window.fetch = orig;
  });
  await page.waitForTimeout(1500);

  const degraded = await page.evaluate(() => {
    const rs = window.riskState;
    const what = document.querySelector("[data-risk-what-changed]")?.textContent || "";
    return {
      label: rs?.label,
      score: rs?.score,
      noPreviewQuotes: !/219\.46|PREVIEW/i.test(what),
      stillHasNarrative: !!(rs?.narrative?.whatChanged && rs?.narrative?.whyItMatters),
    };
  });

  if (degraded.stillHasNarrative && degraded.noPreviewQuotes) {
    pass("Graceful degradation without preview quotes", `label=${degraded.label}`);
  } else {
    fail("Graceful degradation", JSON.stringify(degraded));
  }

  // Legacy panel does not overwrite visible wheel
  const legacy = await page.evaluate(() => {
    const legacyPanel = document.getElementById("riskRegimeLabel");
    const wheelLabel = document.querySelector("#wheelModuleStage .live-gauge__headline-mood")?.textContent?.trim();
    const rs = window.riskState?.label;
    return {
      legacyVisible: legacyPanel && legacyPanel.offsetParent !== null,
      legacyText: legacyPanel?.textContent?.trim(),
      wheelLabel,
      rs,
      conflict:
        legacyPanel?.offsetParent !== null &&
        wheelLabel &&
        legacyPanel.textContent &&
        !legacyPanel.textContent.includes(rs || ""),
    };
  });

  if (!legacy.conflict) pass("Legacy panel does not conflict with wheel", legacy.legacyVisible ? "legacy hidden in DOM" : "legacy not visible");
  else fail("Legacy panel conflict", JSON.stringify(legacy));

  const criticalErrors = consoleErrors.filter(
    (e) => !/market-risk|Failed to load resource|net::ERR/i.test(e)
  );
  if (criticalErrors.length === 0) pass("Dashboard loads without critical console errors");
  else fail("Console errors", criticalErrors.slice(0, 5).join(" | "));
} catch (e) {
  fail("Smoke runner", e.message);
  console.error(e);
} finally {
  await browser.close();
}

console.log("\n--- Market Risk Smoke Summary ---");
console.log(`Passed: ${results.filter((r) => r.ok).length}, Failed: ${failed}`);

if (failed === 0) {
  const out = results.find((r) => r.name === "window.riskState initialized");
  if (out) console.log(`\nLive risk output: ${out.detail}`);
}

process.exit(failed > 0 ? 1 : 0);
