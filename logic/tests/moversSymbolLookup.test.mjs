import assert from "node:assert/strict";
import {
  lookupMoversSymbol,
  resolveMoversSymbolFromPrompt,
  resolveMoversSymbolInput,
  extractTickerCandidate,
} from "../../lib/moversSymbolLookup.js";

assert.equal(resolveMoversSymbolInput("nvdia"), "NVDA");
assert.equal(resolveMoversSymbolInput("LRCX"), "LRCX");

const lrcx = resolveMoversSymbolFromPrompt("Why is LRCX moving?");
assert.equal(lrcx.ok, true);
assert.equal(lrcx.symbol, "LRCX");
assert.match(lrcx.name, /Lam Research/i);

const iren = lookupMoversSymbol("Iris Energy");
assert.equal(iren.ok, true);
assert.equal(iren.symbol, "IREN");

/** Reversed phrasing must not resolve pronoun "it" to UnitedHealth. */
assert.equal(extractTickerCandidate("sandisk why is it moving?"), "sandisk");
const sandiskReversed = resolveMoversSymbolFromPrompt("sandisk why is it moving?");
assert.equal(sandiskReversed.ok, true);
assert.equal(sandiskReversed.symbol, "SNDK");
assert.match(sandiskReversed.name, /SanDisk/i);

const sandiskStandard = resolveMoversSymbolFromPrompt("why is sandisk moving?");
assert.equal(sandiskStandard.symbol, "SNDK");

const microship = resolveMoversSymbolFromPrompt("microship technology why is it moving?");
assert.equal(microship.ok, true);
assert.equal(microship.symbol, "MCHP");

const microchip = resolveMoversSymbolFromPrompt("microchip technology why is it moving?");
assert.equal(microchip.ok, true);
assert.equal(microchip.symbol, "MCHP");

assert.equal(lookupMoversSymbol("it").ok, false);

const parityCases = [
  ["google", "GOOGL"],
  ["nvdia", "NVDA"],
  ["snow", "SNOW"],
  ["intel", "INTC"],
  ["nokia", "NOK"],
];
for (const [input, sym] of parityCases) {
  const r = lookupMoversSymbol(input);
  assert.equal(r.ok, true, input);
  assert.equal(r.symbol, sym, input);
  assert.ok(r.name, input);
}

console.log("moversSymbolLookup.test.mjs: ok");
