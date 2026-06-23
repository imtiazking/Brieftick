/**
 * Independent production verification — https://www.forgeniq.com
 * Usage: node scripts/independent-prod-verification.mjs
 */
import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = (process.argv[2] || "https://www.forgeniq.com").replace(/\/$/, "");
const SYMBOLS = ["AAPL", "NVDA", "MSFT", "SPY", "QQQ"];
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "reports", "independent-prod-verification.json");

async function timedFetch(url, init = {}) {
  const start = Date.now();
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(25_000) });
    const latencyMs = Date.now() - start;
    const cache = res.headers.get("x-brieftick-cache");
    let body = null;
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("json")) {
      try {
        body = await res.json();
      } catch {
        body = null;
      }
    } else {
      const text = await res.text();
      body = { _raw: text.slice(0, 500) };
    }
    return { ok: res.ok, status: res.status, latencyMs, cache, body, url };
  } catch (e) {
    return { ok: false, status: 0, latencyMs: Date.now() - start, error: e.message, url };
  }
}

function classifyProvider(r) {
  if (r.ok && r.status >= 200 && r.status < 300) {
    if (r.body?.code === 429 || r.status === 429) return "degraded";
    return "healthy";
  }
  if (r.status === 429 || r.body?.code === 429) return "degraded";
  return "offline";
}

function extractQuote(body, provider) {
  if (provider === "finnhub" && body?.c > 0) {
    return { price: body.c, pctChange: body.dp, ts: body.t ? new Date(body.t * 1000).toISOString() : null };
  }
  if (provider === "yahoo" && body?.ok && body.price > 0) {
    return { price: body.price, pctChange: body.changePercent, ts: body.updatedAt || null };
  }
  if (provider === "alphavantage" && body?.["Global Quote"]?.["05. price"]) {
    const g = body["Global Quote"];
    const pct = parseFloat(String(g["10. change percent"] || "").replace("%", ""));
    return { price: parseFloat(g["05. price"]), pctChange: pct, ts: null };
  }
  if (provider === "fred" && body?.value != null) {
    return { price: body.value, pctChange: null, ts: body.date || null };
  }
  if (provider === "polygon" && body?.results?.length) {
    return { price: body.results[0]?.last_quote?.mid || body.results[0]?.day?.close, ts: null };
  }
  if (provider === "twelvedata" && body?.close) {
    return { price: parseFloat(body.close), pctChange: parseFloat(body.percent_change), ts: null };
  }
  return null;
}

async function probeProviders() {
  const today = new Date();
  const from = new Date(today.getTime() - 2 * 86400000).toISOString().slice(0, 10);
  const to = new Date(today.getTime() + 14 * 86400000).toISOString().slice(0, 10);

  const probes = [
    {
      id: "finnhub",
      endpoint: `/api/proxy?provider=finnhub&endpoint=quote&symbol=AAPL`,
      evidence: (b) => (b?.c > 0 ? `AAPL close=${b.c}` : JSON.stringify(b).slice(0, 120)),
    },
    {
      id: "yahoo",
      endpoint: `/api/proxy?provider=yahoo&symbol=SPY`,
      evidence: (b) => (b?.price ? `SPY price=${b.price}` : JSON.stringify(b).slice(0, 120)),
    },
    {
      id: "alphavantage",
      endpoint: `/api/proxy?provider=alphavantage&function=GLOBAL_QUOTE&symbol=IBM`,
      evidence: (b) =>
        b?.["Global Quote"]?.["05. price"]
          ? `IBM=${b["Global Quote"]["05. price"]}`
          : JSON.stringify(b).slice(0, 120),
    },
    {
      id: "fred",
      endpoint: `/api/proxy?provider=fred&series=VIXCLS`,
      evidence: (b) => (b?.value != null ? `VIXCLS=${b.value} @ ${b.date}` : JSON.stringify(b).slice(0, 120)),
    },
    {
      id: "fred-calendar",
      endpoint: `/api/proxy?provider=fred&endpoint=calendar`,
      evidence: (b) =>
        b?.events?.length
          ? `${b.events.length} events`
          : JSON.stringify(b).slice(0, 120),
    },
    {
      id: "twelvedata",
      endpoint: `/api/proxy?provider=twelvedata&endpoint=quote&symbol=AAPL`,
      evidence: (b) =>
        b?.close
          ? `AAPL close=${b.close}`
          : JSON.stringify(b).slice(0, 120),
    },
    {
      id: "finnhub-earnings",
      endpoint: `/api/proxy?provider=finnhub&endpoint=calendar/earnings&from=${from}&to=${to}`,
      evidence: (b) =>
        b?.earningsCalendar?.length
          ? `${b.earningsCalendar.length} events`
          : JSON.stringify(b).slice(0, 120),
    },
  ];

  const results = [];
  for (const p of probes) {
    const r = await timedFetch(`${BASE}${p.endpoint}`);
    const status = classifyProvider(r);
    results.push({
      provider: p.id,
      endpoint: `${BASE}${p.endpoint}`,
      httpStatus: r.status,
      latencyMs: r.latencyMs,
      cache: r.cache || null,
      status,
      timestamp: new Date().toISOString(),
      evidence: p.evidence(r.body || { error: r.error }),
      rawError: r.error || r.body?.error || r.body?.message || null,
    });
  }
  return results;
}

async function probeProviderHealth() {
  return timedFetch(`${BASE}/api/provider-health`);
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

function pctVariance(a, b) {
  if (!a || !b || !Number.isFinite(a) || !Number.isFinite(b) || b === 0) return null;
  return Math.abs((a - b) / b) * 100;
}

async function browserAudit(providerQuotes) {
  const network = { requests: [], errors: [], counts: { total: 0, e429: 0, e5xx: 0, failed: 0, apiFailed: 0 } };
  const modules = {};
  const mockFindings = [];

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

  page.on("response", (res) => {
    const url = res.url();
    if (!url.includes("forgeniq.com") && !url.includes("/api/")) return;
    const status = res.status();
    network.counts.total++;
    if (status === 429) network.counts.e429++;
    if (status >= 500) network.counts.e5xx++;
    if (status >= 400) {
      network.errors.push({ url: url.slice(0, 150), status });
    }
  });
  page.on("requestfailed", (req) => {
    network.counts.failed++;
    const u = req.url();
    if (u.includes("/api/")) network.counts.apiFailed++;
    network.errors.push({ url: u.slice(0, 150), failed: req.failure()?.errorText });
  });

  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text().slice(0, 180));
  });

  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForTimeout(4000);

  const routePlan = [
    { key: "dashboard", route: "dashboard", wait: 14000 },
    { key: "whats-moving", route: "why", wait: 10000 },
    { key: "watchlists", route: "dashboard", wait: 3000 },
    { key: "earnings", route: "earnings", wait: 5000 },
    { key: "market-risk", route: "dashboard", wait: 3000 },
    { key: "discover", route: "scanner", wait: 5000 },
    { key: "correlation", route: "dashboard", wait: 3000 },
    { key: "smart-money", route: "insiders", wait: 6000 },
    { key: "macro", route: "dashboard", wait: 3000 },
  ];

  const displayedQuotes = {};

  for (const step of routePlan) {
    const errsBefore = network.errors.length;
    const cBefore = consoleErrors.length;
    await page.evaluate((r) => window.route(r), step.route);
    await page.waitForTimeout(step.wait);

    const snap = await page.evaluate(() => {
      const text = document.body.innerText || "";
      const badges = [...document.querySelectorAll(".bt-live-badge, #dashLiveBadge, #whmBriefingBadge, #optionsLiveBadge, #earnDataBadge, #corrMeta, #macroEventsMeta")]
        .map((el) => ({ id: el.id || el.className?.slice?.(0, 40), text: el.textContent?.trim()?.slice(0, 80) }));
      const prices = {};
      document.querySelectorAll("#moversList .mover, .scanner-card").forEach((el) => {
        const sym = el.querySelector(".sym, .scanner-card-sym")?.textContent?.trim();
        const priceEl = el.querySelector(".price, .scanner-card-price, .val");
        const priceTxt = priceEl?.textContent?.trim();
        const isLiveMover = el.classList.contains("mover") && el.dataset.liveQuote === "1";
        const isLiveScanner = el.classList.contains("scanner-card") && el.querySelector(".scanner-card-price")?.textContent?.includes("$");
        if (!sym || !priceTxt || /loading|unavailable|—/i.test(priceTxt)) return;
        if (el.classList.contains("mover") && !isLiveMover) return;
        if (/[\d.]/.test(priceTxt)) {
          const num = parseFloat(priceTxt.replace(/[^0-9.]/g, ""));
          if (num > 0) prices[sym] = num;
        }
      });
      const patterns = {
        comingSoon: /coming soon/i.test(text),
        illustrative: /illustrative|preview data|sample data|estimated data|heuristic/i.test(text),
        unavailable: /temporarily unavailable|unavailable/i.test(text),
        mockDemo: /generateDemo|CORR_FALLBACK|mock data/i.test(text),
        nancyPelosi: /Nancy Pelosi/i.test(text),
        demoStrikes: /\$4\.2M.*NVDA.*900/i.test(text),
      };
      const macroHtml = document.getElementById("macroEvents")?.innerText?.slice(0, 300) || "";
      const corrHtml = document.getElementById("corrMatrix")?.innerText?.slice(0, 200) || "";
      const optionsGrid = document.getElementById("optUnusualGrid")?.innerText?.slice(0, 200) || "";
      return { badges, prices, patterns, macroHtml, corrHtml, optionsGrid, excerpt: text.slice(0, 500) };
    });

    Object.assign(displayedQuotes, snap.prices);

    const newNetErrs = network.errors.length - errsBefore;
    const newConsErrs = consoleErrors.length - cBefore;

    let classification = "unknown";
    if (snap.patterns.mockDemo || snap.patterns.illustrative) {
      classification = "mock";
    } else if (snap.patterns.comingSoon) {
      classification = "coming-soon";
    } else if (snap.patterns.unavailable) {
      classification = "broken";
    } else if (/live/i.test(snap.badges.map((b) => b.text).join(" "))) {
      classification = "live";
    } else if (/delayed|mixed|cached|stale/i.test(snap.badges.map((b) => b.text).join(" "))) {
      classification = "delayed";
    } else if (step.key === "discover" && /run scan/i.test(snap.excerpt)) {
      classification = "cached";
    } else {
      classification = "delayed";
    }

    modules[step.key] = {
      route: step.route,
      classification,
      badges: snap.badges,
      evidence: {
        patterns: snap.patterns,
        macroSnippet: snap.macroHtml,
        corrSnippet: snap.corrHtml,
        optionsSnippet: snap.optionsGrid,
        newNetworkErrors: newNetErrs,
        newConsoleErrors: newConsErrs,
      },
    };

    for (const [k, v] of Object.entries(snap.patterns)) {
      if (v) mockFindings.push({ module: step.key, pattern: k, route: step.route });
    }
    if (snap.patterns.nancyPelosi) mockFindings.push({ module: step.key, pattern: "demo-politics", route: step.route });
    if (snap.patterns.demoStrikes) mockFindings.push({ module: step.key, pattern: "demo-options-strikes", route: step.route });
  }

  const title = await page.title();
  const metaDesc = await page.locator('meta[name="description"]').getAttribute("content").catch(() => null);

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
      variancePct: variance,
      pass: variance != null ? variance < 1 : null,
    };
  });

  return { network, modules, mockFindings, consoleErrors: consoleErrors.slice(0, 50), quoteComparison, displayedQuotes, title, metaDesc };
}

async function main() {
  console.log("[verify] Independent production audit:", BASE);
  const providerProbes = await probeProviders();
  const health = await probeProviderHealth();
  const providerQuotes = await fetchProviderQuotes();
  const browser = await browserAudit(providerQuotes);

  const providerSummary = {};
  for (const id of ["finnhub", "yahoo", "alphavantage", "fred", "twelvedata"]) {
    const rows = providerProbes.filter((p) => p.provider === id || p.provider.startsWith(id));
    const healthy = rows.some((r) => r.status === "healthy");
    const degraded = rows.some((r) => r.status === "degraded");
    providerSummary[id] = healthy ? "healthy" : degraded ? "degraded" : "offline";
  }

  const liveModules = Object.values(browser.modules).filter((m) => m.classification === "live").length;
  const mockModules = Object.values(browser.modules).filter((m) => m.classification === "mock").length;
  const quotePasses = browser.quoteComparison.filter((q) => q.pass === true).length;
  const quoteTested = browser.quoteComparison.filter((q) => q.pass != null).length;

  let honesty = 0;
  honesty += Math.min(30, liveModules * 3);
  honesty += quoteTested ? (quotePasses / quoteTested) * 25 : 0;
  honesty += Object.values(providerSummary).filter((s) => s === "healthy").length * 5;
  honesty += mockModules === 0 ? 15 : Math.max(0, 15 - mockModules * 5);
  honesty += browser.network.counts.e429 === 0 ? 10 : 0;
  honesty += browser.mockFindings.filter((f) => f.pattern === "mockDemo").length === 0 ? 10 : 0;
  honesty = Math.round(Math.min(100, honesty));

  let verdict = "C";
  if (honesty >= 75 && mockModules === 0 && browser.network.counts.e429 < 5) verdict = "A";
  else if (honesty >= 55) verdict = "B";

  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl: BASE,
    section1_providers: providerProbes,
    section1_summary: providerSummary,
    section2_quoteComparison: browser.quoteComparison,
    section2_providerQuotes: providerQuotes,
    section2_displayedQuotes: browser.displayedQuotes,
    section3_modules: browser.modules,
    section4_mockFindings: browser.mockFindings,
    section5_network: browser.network,
    section5_consoleErrors: browser.consoleErrors,
    section6_providerHealth: {
      endpoint: `${BASE}/api/provider-health`,
      httpStatus: health.status,
      latencyMs: health.latencyMs,
      body: health.body,
      functional: health.ok,
    },
    section7_dataHonestyScore: honesty,
    section8_verdict: verdict,
    pageMeta: { title: browser.title, description: browser.metaDesc },
  };

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log("[verify] Wrote", OUT);
  console.log("[verify] Honesty score:", honesty, "Verdict:", verdict);
  console.log("[verify] Network 429:", browser.network.counts.e429, "5xx:", browser.network.counts.e5xx);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
