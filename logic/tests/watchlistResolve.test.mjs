/**
 * Watchlist resolution — saved, dashboard, and prompt tickers.
 * Run: node logic/tests/watchlistResolve.test.mjs
 */

global.window = { __LOGIC_DEBUG: false };
global.location = { search: "" };
global.localStorage = {
  _d: {},
  getItem(k) {
    return this._d[k] ?? null;
  },
  setItem(k, v) {
    this._d[k] = v;
  },
};

import { resolveWatchlistForQuery } from "../engines/watchlistSymbols.js";
import { isWatchlistPerformanceQuery } from "../engines/userContext.js";

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    passed += 1;
    console.log("✓", msg);
  } else {
    failed += 1;
    console.error("✗", msg);
  }
}

localStorage.setItem("brieftick_watchlist_v1", JSON.stringify(["NVDA", "MSFT"]));
const saved = resolveWatchlistForQuery("best watchlist performer", ["NVDA", "MSFT"]);
assert(saved.source === "saved" && saved.symbols.length === 2, "uses saved watchlist first");

localStorage.setItem("brieftick_watchlist_v1", JSON.stringify([]));
window.watchlistSymbols = ["AAPL", "META"];
const dash = resolveWatchlistForQuery("best watchlist performer");
assert(dash.source === "dashboard" && dash.symbols.includes("AAPL"), "falls back to dashboard memory");

window.watchlistSymbols = [];
const prompt = resolveWatchlistForQuery("NVDA and MSFT — whats the best watchlist performer today?");
assert(
  prompt.source === "prompt" && prompt.symbols.includes("NVDA") && prompt.symbols.includes("MSFT"),
  "extracts tickers from performance question"
);

assert(
  isWatchlistPerformanceQuery("whats the best watchlist performer today"),
  "detects watchlist performer phrasing"
);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
