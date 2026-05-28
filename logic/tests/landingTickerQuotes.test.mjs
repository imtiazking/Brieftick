import test from "node:test";
import assert from "node:assert/strict";
import {
  mapSymbolForProvider,
  landingEquitySymbolsFromTickerData,
  LANDING_MACRO_SYMBOLS,
} from "../../lib/landingTickerQuotes.js";

test("mapSymbolForProvider maps BRK.B for Finnhub", () => {
  assert.equal(mapSymbolForProvider("BRK.B", "finnhub"), "BRK-B");
  assert.equal(mapSymbolForProvider("BRK-B", "display"), "BRK.B");
});

test("landingEquitySymbolsFromTickerData excludes macro rows", () => {
  const rows = [
    ["SPY", "…", "…", "flat"],
    ["VIX", "…", "…", "flat"],
    ["NVDA", "…", "…", "flat"],
    ["BTC", "…", "…", "flat"],
  ];
  const syms = landingEquitySymbolsFromTickerData(rows);
  assert.deepEqual(syms, ["SPY", "NVDA"]);
  assert.ok(LANDING_MACRO_SYMBOLS.has("VIX"));
});
