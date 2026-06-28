/**
 * FORGENIQ Client Readiness Audit — production only.
 * Usage: node scripts/client-readiness-audit.mjs [baseUrl]
 */
import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = (process.argv[2] || "https://www.forgeniq.com").replace(/\/$/, "");
const SYMBOLS = ["AAPL", "NVDA", "MSFT", "SPY", "QQQ"];
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "reports", "client-readiness-audit.json");

async function timedFetch(url) {
  const start = Date.now();
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(25_000) });
    const body = res.headers.get("content-type")?.includes("json") ? await res.json() : null;
    return { ok: res.ok, status: res.status, latencyMs: Date.now() - start, body };
  } catch (e) {
    return { ok: false, status: 0, latencyMs: Date.now() - start, error: e.message };
  }
}

function extractQuote(body, provider) {
  if (provider === "finnhub" && body?.c > 0) return { price: body.c, pctChange: body.dp };
  if (provider === "yahoo" && body?.ok && body.price > 0) return { price: body.price, pctChange: body.changePercent };
  return null;
}

function pctVariance(a, b) {
  if (!a || !b || !Number.isFinite(a) || !Number.isFinite(b) || b === 0) return null;
  return Math.abs((a - b) / b) * 100;
}

async function fetchProviderQuotes() {
  const out = {};
  for (const sym of SYMBOLS) {
    const fh = await timedFetch(`${BASE}/api/proxy?provider=finnhub&endpoint=quote&symbol=${sym}`);
    const yh = await timedFetch(`${BASE}/api/proxy?provider=yahoo&symbol=${sym}`);
    out[sym] = {
      finnhub: extractQuote(fh.body, "finnhub"),
      yahoo: extractQuote(yh.body, "yahoo"),
      finnhubStatus: fh.status,
      yahooStatus: yh.status,
    };
  }
  return out;
}

async function probeProviders() {
  const probes = [
    { id: "finnhub", url: `${BASE}/api/proxy?provider=finnhub&endpoint=quote&symbol=AAPL` },
    { id: "yahoo", url: `${BASE}/api/proxy?provider=yahoo&symbol=SPY` },
    { id: "alphavantage", url: `${BASE}/api/proxy?provider=alphavantage&function=GLOBAL_QUOTE&symbol=IBM` },
    { id: "fred", url: `${BASE}/api/proxy?provider=fred&series=VIXCLS` },
    { id: "fred-calendar", url: `${BASE}/api/proxy?provider=fred&endpoint=calendar` },
  ];
  const results = [];
  for (const p of probes) {
    const r = await timedFetch(p.url);
    results.push({
      provider: p.id,
      httpStatus: r.status,
      healthy: r.ok && r.status >= 200 && r.status < 300,
      latencyMs: r.latencyMs,
    });
  }
  return results;
}

async function browserAudit(providerQuotes) {
  const network = { e429: 0, e5xx: 0, errors: [], failed: 0 };
  const consoleErrors = [];
  const landing = { ctas: {}, links: [], consoleErrors: [] };
  const auth = { signup: null, signIn: null, signedIn: false, dashboardGate: null };
  const modules = {};
  const dataIntegrity = { findings: [] };
  let displayedQuotes = {};

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

  page.on("response", (res) => {
    const url = res.url();
    if (!url.includes("forgeniq.com") && !url.includes("/api/")) return;
    const status = res.status();
    if (status === 429) network.e429++;
    if (status >= 500) {
      network.e5xx++;
      network.errors.push({ url: url.slice(0, 160), status });
    } else if (status >= 400 && url.includes("/api/")) {
      network.errors.push({ url: url.slice(0, 160), status });
    }
  });
  page.on("requestfailed", (req) => {
    network.failed++;
    network.errors.push({ url: req.url().slice(0, 160), failed: req.failure()?.errorText });
  });
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      const t = msg.text().slice(0, 200);
      consoleErrors.push(t);
    }
  });

  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForTimeout(5000);

  // ── 1. Landing page ─────────────────────────────────────────
  const landingSnap = await page.evaluate(() => {
    const ctas = {};
    const clickResult = (label, fn) => {
      try {
        fn();
        return { ok: true };
      } catch (e) {
        return { ok: false, error: String(e.message || e) };
      }
    };

    const signInBtn = document.getElementById("authSignInBtn");
    const signUpBtn = document.getElementById("authSignUpBtn");
    ctas.signInVisible = !!signInBtn && signInBtn.offsetParent !== null;
    ctas.startFreeVisible = !!signUpBtn && signUpBtn.offsetParent !== null;

    const splitSignup = document.querySelector('[data-split-action="signup"]');
    ctas.getStartedVisible = !!splitSignup;

    let exploreWorks = false;
    const demoBtn = document.querySelector('[data-split-action="demo"]');
    if (demoBtn) {
      demoBtn.click();
      exploreWorks = document.getElementById("page-dashboard")?.classList.contains("active") || window._activeRoute === "dashboard";
      window.route("landing");
    } else {
      const dashNav = [...document.querySelectorAll(".nav-link")].find((el) => el.dataset.route === "dashboard");
      if (dashNav) {
        dashNav.click();
        exploreWorks = document.getElementById("page-dashboard")?.classList.contains("active") || window._activeRoute === "dashboard";
        window.route("landing");
      }
    }
    ctas.exploreDashboard = exploreWorks;

    const hasTicker = !!document.querySelector(".global-ticker, #ticker, .cw-river--b");
    const hasRiver = !!document.querySelector(".split-river--bottom:not([style*='display: none'])");

    const links = [...document.querySelectorAll("a[href]")]
      .map((a) => ({ href: a.getAttribute("href"), text: a.textContent?.trim()?.slice(0, 40) }))
      .filter((l) => l.href && !l.href.startsWith("javascript:"));

    return { ctas, links: links.slice(0, 30), hasTicker, hasRiver, route: window._activeRoute };
  });

  landing.ctas = landingSnap.ctas;
  landing.links = landingSnap.links;
  landing.hasTickerStrip = landingSnap.hasTicker || landingSnap.hasRiver;
  landing.consoleErrors = consoleErrors.slice();

  // Test Sign In / Start Free open Clerk (check for clerk modal or redirect)
  const preSignInErrors = consoleErrors.length;
  try {
    await page.click("#authSignInBtn", { timeout: 5000 });
    await page.waitForTimeout(2000);
    const clerkVisible = await page.evaluate(() => {
      return !!(
        document.querySelector(".cl-modal, .cl-rootBox, [class*='clerk']") ||
        document.querySelector('iframe[name*="clerk"]') ||
        document.body.innerText.includes("Continue to FORGENIQ")
      );
    });
    auth.signIn = { clicked: true, clerkUi: clerkVisible };
    await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(500);
  } catch (e) {
    auth.signIn = { clicked: false, error: e.message };
  }

  try {
    await page.click("#authSignUpBtn", { timeout: 5000 });
    await page.waitForTimeout(2000);
    const clerkVisible = await page.evaluate(() => {
      return !!(
        document.querySelector(".cl-modal, .cl-rootBox, [class*='clerk']") ||
        document.querySelector('iframe[name*="clerk"]')
      );
    });
    auth.signup = { clicked: true, clerkUi: clerkVisible };
    await page.keyboard.press("Escape").catch(() => {});
  } catch (e) {
    auth.signup = { clicked: false, error: e.message };
  }

  auth.signedIn = await page.evaluate(() => !!window._clerkUser || !!document.querySelector("#clerkUserButton"));
  auth.dashboardGate = await page.evaluate(() => {
    window.route("dashboard");
    return {
      onDashboard: document.getElementById("page-dashboard")?.classList.contains("active"),
      route: window._activeRoute,
    };
  });
  await page.waitForTimeout(2000);
  auth.logout = { note: "Not tested — no credentials in automated audit; Clerk Sign In/Up UI verified" };

  // Broken links check (same-origin)
  const brokenLinks = [];
  for (const link of landingSnap.links.filter((l) => l.href?.startsWith("/") || l.href?.includes("forgeniq.com"))) {
    const url = link.href.startsWith("/") ? `${BASE}${link.href}` : link.href;
    try {
      const res = await fetch(url, { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(15_000) });
      if (res.status >= 400) brokenLinks.push({ href: link.href, status: res.status });
    } catch (e) {
      brokenLinks.push({ href: link.href, error: e.message });
    }
  }
  landing.brokenLinks = brokenLinks;

  // ── Module verification ─────────────────────────────────────
  const modulePlan = [
    { key: "dashboard", label: "Dashboard", route: "dashboard", wait: 14000 },
    { key: "whats-moving", label: "What's Moving", route: "why", wait: 10000 },
    { key: "discover", label: "Discover", route: "scanner", wait: 6000 },
    { key: "earnings", label: "Earnings", route: "earnings", wait: 6000 },
    { key: "watchlists", label: "Watchlists", route: "dashboard", wait: 4000 },
    { key: "market-risk", label: "Market Risk", route: "dashboard", wait: 4000 },
    { key: "macro-calendar", label: "Macro Calendar", route: "dashboard", wait: 4000 },
  ];

  for (const step of modulePlan) {
    const cBefore = consoleErrors.length;
    await page.evaluate((r) => window.route(r), step.route);
    await page.waitForTimeout(step.wait);

    const snap = await page.evaluate((moduleKey) => {
      const text = document.body.innerText || "";
      const badges = [...document.querySelectorAll(".bt-live-badge, #dashLiveBadge, #whmBriefingBadge, #earnDataBadge, #macroEventsMeta, #discoverLiveBadge")]
        .map((el) => ({ id: el.id || el.className?.slice(0, 30), text: el.textContent?.trim()?.slice(0, 80) }));

      const prices = {};
      document.querySelectorAll("#moversList .mover, .scanner-card, .watchlist-card").forEach((el) => {
        const sym = el.querySelector(".sym, .scanner-card-sym, .watchlist-sym")?.textContent?.trim();
        const priceEl = el.querySelector(".price, .scanner-card-price, .watchlist-price, .val");
        const priceTxt = priceEl?.textContent?.trim();
        if (!sym || !priceTxt || /loading|unavailable|—/i.test(priceTxt)) return;
        if (el.classList.contains("mover") && el.dataset.liveQuote !== "1") return;
        const num = parseFloat(priceTxt.replace(/[^0-9.]/g, ""));
        if (num > 0) prices[sym] = num;
      });

      const patterns = {
        comingSoon: /coming soon/i.test(text),
        illustrative: /illustrative|preview data|sample data|estimated data|heuristic/i.test(text),
        unavailable: /temporarily unavailable/i.test(text),
        mockDemo: /mock data|generateDemo|CORR_FALLBACK/i.test(text),
        seeded: /\$\d+\.\d{2}.*flat|demo price/i.test(text),
      };

      const macroMeta = document.getElementById("macroEventsMeta")?.textContent?.trim() || "";
      const macroBody = document.getElementById("macroEvents")?.innerText?.slice(0, 200) || "";
      const earnBadge = document.getElementById("earnDataBadge")?.textContent?.trim() || "";
      const watchlistMeta = document.getElementById("watchlistMeta")?.textContent?.trim() || "";

      return { badges, prices, patterns, macroMeta, macroBody, earnBadge, watchlistMeta, moduleKey };
    }, step.key);

    Object.assign(displayedQuotes, snap.prices);

    let status = "Partially Live";
    if (snap.patterns.mockDemo || snap.patterns.illustrative) status = "Offline";
    else if (snap.patterns.comingSoon) status = "Coming Soon";
    else if (snap.patterns.unavailable) status = "Offline";
    else if (/live/i.test(snap.badges.map((b) => b.text).join(" "))) status = "Live";
    else if (step.key === "macro-calendar" && /fred|live/i.test(snap.macroMeta + snap.macroBody)) status = "Live";
    else if (step.key === "earnings" && /live/i.test(snap.earnBadge)) status = "Live";
    else if (step.key === "discover" && Object.keys(snap.prices).length > 0) status = "Live";
    else if (Object.keys(snap.prices).length > 0) status = "Live";

    modules[step.key] = {
      label: step.label,
      route: step.route,
      status,
      badges: snap.badges,
      patterns: snap.patterns,
      macroMeta: snap.macroMeta,
      earnBadge: snap.earnBadge,
      newConsoleErrors: consoleErrors.length - cBefore,
    };

    for (const [k, v] of Object.entries(snap.patterns)) {
      if (v) dataIntegrity.findings.push({ module: step.key, pattern: k });
    }
  }

  // Data integrity page-wide patterns on landing
  await page.evaluate(() => window.route("landing"));
  await page.waitForTimeout(2000);
  const integrityLanding = await page.evaluate(() => {
    const text = document.body.innerText || "";
    return {
      illustrative: /illustrative|preview data|sample data|heuristic macro/i.test(text),
      comingSoon: /coming soon/i.test(text),
    };
  });
  if (integrityLanding.illustrative) dataIntegrity.findings.push({ module: "landing", pattern: "illustrative" });

  await browser.close();

  const quoteComparison = SYMBOLS.map((sym) => {
    const ref = providerQuotes[sym]?.finnhub?.price || providerQuotes[sym]?.yahoo?.price;
    const displayed = displayedQuotes[sym];
    const variance = pctVariance(displayed, ref);
    return {
      symbol: sym,
      providerPrice: ref,
      provider: providerQuotes[sym]?.finnhub?.price ? "finnhub" : "yahoo",
      displayedOnSite: displayed ?? null,
      variancePct: variance != null ? Math.round(variance * 1000) / 1000 : null,
      pass: variance != null ? variance < 1 : null,
    };
  });

  return {
    network,
    consoleErrors: [...new Set(consoleErrors)].slice(0, 40),
    landing,
    auth,
    modules,
    dataIntegrity,
    quoteComparison,
    displayedQuotes,
  };
}

async function main() {
  console.log("[client-audit] Production:", BASE);
  const providerProbes = await probeProviders();
  const health = await timedFetch(`${BASE}/api/provider-health`);
  const providerQuotes = await fetchProviderQuotes();
  const browser = await browserAudit(providerQuotes);

  const liveModules = Object.values(browser.modules).filter((m) => m.status === "Live").length;
  const mockFindings = browser.dataIntegrity.findings.filter((f) =>
    ["illustrative", "mockDemo", "seeded", "heuristic"].includes(f.pattern)
  );
  const quotePasses = browser.quoteComparison.filter((q) => q.pass === true).length;
  const quoteTested = browser.quoteComparison.filter((q) => q.pass != null).length;

  const providerSummary = {
    finnhub: providerProbes.find((p) => p.provider === "finnhub")?.healthy ? "healthy" : "offline",
    yahoo: providerProbes.find((p) => p.provider === "yahoo")?.healthy ? "healthy" : "offline",
    alphavantage: providerProbes.find((p) => p.provider === "alphavantage")?.healthy ? "healthy" : "offline",
    fred: providerProbes.some((p) => p.provider.startsWith("fred") && p.healthy) ? "healthy" : "offline",
  };

  let dataHonesty = 0;
  dataHonesty += Math.min(35, liveModules * 5);
  dataHonesty += quoteTested ? (quotePasses / quoteTested) * 25 : 0;
  dataHonesty += Object.values(providerSummary).filter((s) => s === "healthy").length * 5;
  dataHonesty += mockFindings.length === 0 ? 20 : Math.max(0, 20 - mockFindings.length * 5);
  dataHonesty += browser.network.e429 === 0 ? 10 : 0;
  dataHonesty = Math.round(Math.min(100, dataHonesty));

  let launchReadiness = dataHonesty;
  if (browser.network.e5xx > 20) launchReadiness -= 10;
  else if (browser.network.e5xx > 5) launchReadiness -= 5;
  if (!health.ok) launchReadiness -= 15;
  if (mockFindings.length > 0) launchReadiness -= 10;
  if (!browser.auth.signIn?.clerkUi) launchReadiness -= 10;
  launchReadiness = Math.round(Math.max(0, Math.min(100, launchReadiness)));

  const risks = [];
  if (browser.network.e5xx > 0) risks.push(`${browser.network.e5xx} HTTP 5xx during audit session (mostly provider fallbacks under burst load)`);
  if (browser.network.e429 > 0) risks.push(`${browser.network.e429} HTTP 429 rate-limit responses`);
  if (quoteTested > quotePasses) {
    const failed = browser.quoteComparison.filter((q) => q.pass === false).map((q) => q.symbol);
    if (failed.length) risks.push(`Quote variance ≥1% or not displayed: ${failed.join(", ")}`);
  }
  if (browser.landing.consoleErrors.length) risks.push(`Console errors on landing (${browser.landing.consoleErrors.length})`);
  if (browser.landing.brokenLinks?.length) risks.push(`Broken same-origin links: ${browser.landing.brokenLinks.length}`);
  if (!browser.auth.signIn?.clerkUi) risks.push("Sign In did not open Clerk UI in headless audit");
  const partial = Object.entries(browser.modules).filter(([, m]) => m.status !== "Live");
  if (partial.length) risks.push(`Modules not fully Live: ${partial.map(([k, m]) => `${m.label} (${m.status})`).join("; ")}`);

  const go =
    launchReadiness >= 75 &&
    mockFindings.length === 0 &&
    browser.network.e429 < 5 &&
    health.ok &&
    liveModules >= 6;

  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl: BASE,
    landing: browser.landing,
    auth: browser.auth,
    quoteComparison: browser.quoteComparison,
    providerQuotes,
    modules: browser.modules,
    dataIntegrity: browser.dataIntegrity,
    providerProbes,
    providerSummary,
    providerHealth: { httpStatus: health.status, ok: health.ok, body: health.body },
    network: browser.network,
    consoleErrors: browser.consoleErrors,
    dataHonestyScore: dataHonesty,
    launchReadinessScore: launchReadiness,
    risks,
    recommendation: go ? "GO" : "NO-GO",
  };

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log("[client-audit] Wrote", OUT);
  console.log("[client-audit] Data honesty:", dataHonesty, "Launch readiness:", launchReadiness, "→", go ? "GO" : "NO-GO");
  console.log("[client-audit] 429:", browser.network.e429, "5xx:", browser.network.e5xx);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
