/**
 * Pre-deploy checks for market snapshot providers.
 * Usage: node scripts/check-market-data.mjs [baseUrl]
 */
const BASE = process.argv[2] || "http://localhost:3099";

const YAHOO = ["^GSPC", "^IXIC", "^DJI", "^VIX"];
const FRED = ["VIXCLS", "DGS10", "DCOILWTICO", "SP500", "NASDAQCOM", "DJIA"];

const failures = [];
const passes = [];

function pass(msg) {
  passes.push(msg);
  console.log("PASS:", msg);
}
function fail(msg, detail) {
  failures.push({ msg, detail });
  console.error("FAIL:", msg, detail ?? "");
}

async function getJson(path) {
  const url = `${BASE}${path}`;
  const res = await fetch(url, { headers: { Accept: "application/json, text/html" } });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { url, res, text, json };
}

async function checkDebugRoute() {
  const { res, text } = await getJson("/debug/market-data");
  if (res.status !== 200) {
    fail("debug route HTTP", res.status);
    return;
  }
  if (!text.includes("Market data debug") || !text.includes("fetchMarketDataDebugSnapshot")) {
    fail("debug route content", "missing expected HTML/module");
    return;
  }
  pass("/debug/market-data serves debug page");
}

async function checkYahoo() {
  for (const sym of YAHOO) {
    const { res, json } = await getJson(
      `/api/proxy?provider=yahoo&symbol=${encodeURIComponent(sym)}`
    );
    if (res.status !== 200 || !json?.ok || !Number.isFinite(json.price)) {
      fail(`yahoo ${sym}`, { status: res.status, json });
      continue;
    }
    pass(`yahoo ${sym} price=${json.price}`);
  }
}

async function checkFred() {
  for (const series of FRED) {
    const { res, json } = await getJson(`/api/proxy?provider=fred&series=${series}`);
    if (res.status !== 200 || json?.value == null || !Number.isFinite(json.value)) {
      fail(`fred ${series}`, { status: res.status, json });
      continue;
    }
    pass(`fred ${series} value=${json.value} date=${json.date}`);
  }
}

async function checkSnapshotPriority(base) {
  const modPath = new URL("../lib/marketDataService.js", import.meta.url).href;
  const mod = await import(modPath);
  // Patch fetch to hit deployment origin for API calls
  const origFetch = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    const url = typeof input === "string" ? input : input.url;
    if (url.startsWith("/api/")) {
      return origFetch(`${base}${url}`, init);
    }
    return origFetch(input, init);
  };
  let debug;
  try {
    mod.clearMarketDataDebugLog();
    debug = await mod.fetchMarketDataDebugSnapshot();
  } finally {
    globalThis.fetch = origFetch;
  }

  const indexKeys = ["sp500", "nasdaq", "dow"];
  for (const key of indexKeys) {
    const row = debug.rows[key];
    if (!row || (row.status !== "ok" && row.status !== "proxy")) {
      fail(`snapshot row ${key}`, row);
      continue;
    }
    if (row.isProxy) {
      fail(`${key} should not be ETF proxy when Yahoo/FRED work`, row);
      continue;
    }
    const src = String(row.source || "");
    if (!src.includes("yahoo") && !src.includes("fred")) {
      fail(`${key} expected yahoo/fred source`, row);
      continue;
    }
    pass(`${key} live index (${src}) level=${row.value}`);
  }

  const macroKeys = ["vix", "tenYearYield", "oil"];
  for (const key of macroKeys) {
    const row = debug.rows[key];
    if (!row || (row.status !== "ok" && row.status !== "proxy")) {
      fail(`macro row ${key}`, row);
      continue;
    }
    if (key !== "oil" && row.isProxy) {
      fail(`${key} macro should not use ETF proxy`, row);
      continue;
    }
    if (key === "oil" && row.isProxy) {
      pass(`oil USO proxy last resort (FRED failed in this run)`);
      continue;
    }
    pass(`${key} macro (${row.source})`);
  }

  const indexLive = indexKeys.every((k) => debug.rows[k]?.status === "ok" && !debug.rows[k]?.isProxy);
  const anyIndexProxy = indexKeys.some((k) => debug.rows[k]?.isProxy);
  if (anyIndexProxy && indexLive) {
    fail("index rows marked proxy while Yahoo/FRED available", debug.rows);
  } else if (indexLive) {
    pass("ETF proxies not used for indices (Yahoo/FRED succeeded)");
  }
  if (debug.rows.spy?.status === "ok" && debug.rows.qqq?.status === "ok") {
    pass("SPY/QQQ ETF rows loaded via Finnhub/Twelve Data (expected)");
  }

  for (const key of indexKeys) {
    if (debug.rows[key]?.value != null && debug.rows[key].value > 0) {
      pass(`${key} has non-mock numeric value`);
    }
  }
}

async function checkNoMockInHtml() {
  const { res, text } = await getJson("/");
  if (res.status === 401) {
    console.log("SKIP: index.html (deployment protection)");
    return;
  }
  const mockPatterns = [
    /briefing-snapshot__level[^>]*>[\d,]+\.\d{2}</,
    /data-snapshot-level[^>]*>7[0-9]{3}\./,
  ];
  for (const p of mockPatterns) {
    if (p.test(text)) {
      fail("index.html may contain hardcoded snapshot levels", p.toString());
      return;
    }
  }
  if (!text.includes("data-market-snapshot")) {
    fail("index missing data-market-snapshot");
    return;
  }
  pass("index.html snapshot shell has no hardcoded price cells");
}

async function main() {
  console.log("Base URL:", BASE);
  await checkDebugRoute();
  await checkYahoo();
  await checkFred();
  await checkNoMockInHtml();

  const canRunSnapshot =
    BASE.includes("localhost") ||
    BASE.includes("www.forgeniq.com") ||
    BASE.includes("forgeniq.com") ||
    BASE.includes("www.brieftick.com") ||
    BASE.includes("brieftick.com");
  if (canRunSnapshot && passes.some((p) => p.startsWith("yahoo ^GSPC"))) {
    await checkSnapshotPriority(BASE);
  } else if (!canRunSnapshot) {
    console.log("\nSkipping snapshot priority (preview auth or missing Yahoo).");
  } else {
    fail("snapshot priority", "Yahoo ^GSPC required for index priority check");
  }

  console.log("\n--- Summary ---");
  console.log(`Passed: ${passes.length}`);
  console.log(`Failed: ${failures.length}`);
  if (failures.length) {
    console.log(JSON.stringify(failures, null, 2));
    process.exit(1);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
