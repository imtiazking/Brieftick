/**
 * Ticker catalog + entity resolution for commodities/FX ETFs.
 * Run: node logic/tests/tickerCatalog.test.mjs
 */

import { resolvePrimaryEntity, resolveTickerTargets } from "../entityResolver.js";
import { extractSymbolsFromPrompt } from "../engines/tickerCatalog.js";
import { resolveSymbolForPrompt } from "../shared.js";

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

const gld = resolvePrimaryEntity("Why is GLD moving?");
assert(gld.symbol === "GLD", "GLD resolved from why-moving prompt");

const both = extractSymbolsFromPrompt("Compare GLD and USD today");
assert(both.includes("GLD") && both.includes("USD"), "extracts GLD and USD");

const targets = resolveTickerTargets("Why are GLD and USD moving?", { watchlistSymbols: ["GLD", "USD"] });
assert(targets.length >= 2, "multi-ticker targets");

const sym = resolveSymbolForPrompt("Why is GLD moving?", gld);
assert(sym === "GLD", "resolveSymbolForPrompt returns GLD not SPY");

const spyDefault = resolveSymbolForPrompt("explain the market", { entityType: "market", symbol: null });
assert(spyDefault === "SPY", "market-wide query may still use SPY");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
