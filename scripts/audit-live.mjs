#!/usr/bin/env node
/**
 * Production live-data audit — npm run audit:live
 * Writes reports/live-audit.json
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const BASE = process.argv[2] || process.env.AUDIT_BASE_URL || "http://localhost:3000";
const OUT = join(ROOT, "reports", "live-audit.json");

const MODULES = [
  { id: "dashboard", path: "/", probes: ["finnhub-quote", "yahoo-chart"] },
  { id: "whats-moving", path: "/", route: "whats-moving", probes: ["finnhub-quote"] },
  { id: "watchlists", path: "/", probes: ["finnhub-quote"] },
  { id: "earnings", path: "/", probes: ["finnhub-earnings"] },
  { id: "market-risk", path: "/", probes: ["fred-vix", "yahoo-chart"] },
  { id: "discover", path: "/", route: "scanner", probes: ["finnhub-quote"] },
  { id: "options", path: "/", route: "options", probes: ["polygon-options"] },
  { id: "correlation", path: "/", probes: ["yahoo-series"] },
  { id: "smart-money", path: "/", route: "insiders", probes: ["sec-form4", "politicaltrades"] },
];

async function timedFetch(url, init) {
  const start = Date.now();
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(20_000) });
    const latencyMs = Date.now() - start;
    let body = null;
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("json")) {
      try {
        body = await res.json();
      } catch {
        body = null;
      }
    } else {
      await res.text();
    }
    return { ok: res.ok, status: res.status, latencyMs, body, cache: res.headers.get("x-brieftick-cache") };
  } catch (e) {
    return { ok: false, status: 0, latencyMs: Date.now() - start, error: e.message, body: null };
  }
}

async function probeFinnhubQuote(base) {
  return timedFetch(`${base}/api/proxy?provider=finnhub&endpoint=quote&symbol=AAPL`);
}

async function probeYahooChart(base) {
  return timedFetch(`${base}/api/proxy?provider=yahoo&symbol=SPY`);
}

async function probeYahooSeries(base) {
  return timedFetch(`${base}/api/proxy?provider=yahoo&symbol=NVDA&range=1mo&closes=1`);
}

async function probeFinnhubEarnings(base) {
  const from = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);
  const to = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
  return timedFetch(
    `${base}/api/proxy?provider=finnhub&endpoint=calendar/earnings&from=${from}&to=${to}`
  );
}

async function probeFredVix(base) {
  return timedFetch(`${base}/api/proxy?provider=fred&series=VIXCLS`);
}

async function probeFredCalendar(base) {
  return timedFetch(`${base}/api/proxy?provider=fred&endpoint=calendar`);
}

async function probePolygonOptions(base) {
  return timedFetch(`${base}/api/proxy?provider=polygon&endpoint=v3/snapshot/options/SPY&limit=2`);
}

async function probeSecForm4(base) {
  return timedFetch(`${base}/api/proxy?provider=sec&endpoint=form4`);
}

async function probePoliticalTrades(base) {
  return timedFetch(`${base}/api/proxy?provider=politicaltrades`);
}

async function probeProviderHealth(base) {
  return timedFetch(`${base}/api/provider-health`);
}

const PROBE_FNS = {
  "finnhub-quote": probeFinnhubQuote,
  "yahoo-chart": probeYahooChart,
  "yahoo-series": probeYahooSeries,
  "finnhub-earnings": probeFinnhubEarnings,
  "fred-vix": probeFredVix,
  "fred-calendar": probeFredCalendar,
  "polygon-options": probePolygonOptions,
  "sec-form4": probeSecForm4,
  politicaltrades: probePoliticalTrades,
};

function classifyModule(probes, moduleId) {
  const errors = probes.filter((p) => !p.ok).map((p) => p.probe + ": HTTP " + (p.status || p.error));
  const live = probes.filter((p) => p.ok).length;
  if (moduleId === "options") {
    const poly = probes.find((p) => p.probe === "polygon-options");
    if (!poly?.ok) return { status: "coming_soon", provider: "polygon", errors };
    return { status: "live", provider: "polygon", errors };
  }
  if (live === probes.length && probes.length) return { status: "live", provider: probes.map((p) => p.probe).join("+"), errors };
  if (live > 0) return { status: "partial", provider: probes.filter((p) => p.ok).map((p) => p.probe).join("+"), errors };
  return { status: "mock", provider: null, errors };
}

async function main() {
  console.log("[audit:live] base URL:", BASE);
  const health = await probeProviderHealth(BASE);

  const moduleResults = [];
  for (const mod of MODULES) {
    const probeResults = [];
    for (const probe of mod.probes) {
      const fn = PROBE_FNS[probe];
      if (!fn) continue;
      const r = await fn(BASE);
      probeResults.push({
        probe,
        ok: r.ok,
        status: r.status,
        latencyMs: r.latencyMs,
        cache: r.cache || null,
        error: r.error || null,
      });
    }
    const classified = classifyModule(probeResults, mod.id);
    const maxLatency = Math.max(...probeResults.map((p) => p.latencyMs || 0), 0);
    moduleResults.push({
      id: mod.id,
      status: classified.status,
      provider: classified.provider,
      latencyMs: maxLatency,
      lastUpdate: new Date().toISOString(),
      errors: classified.errors,
      probes: probeResults,
    });
  }

  const summary = {
    live: moduleResults.filter((m) => m.status === "live").length,
    partial: moduleResults.filter((m) => m.status === "partial").length,
    coming_soon: moduleResults.filter((m) => m.status === "coming_soon").length,
    mock: moduleResults.filter((m) => m.status === "mock").length,
  };

  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl: BASE,
    providerHealth: health.ok ? health.body : { error: health.error || health.status, latencyMs: health.latencyMs },
    modules: moduleResults,
    summary,
  };

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log("[audit:live] wrote", OUT);
  console.log("[audit:live] summary:", summary);
  process.exit(summary.mock > 2 ? 1 : 0);
}

main().catch((e) => {
  console.error("[audit:live] fatal:", e);
  process.exit(1);
});
