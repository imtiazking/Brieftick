import assert from "node:assert/strict";
import {
  lookupMoversSymbol,
  resolveMoversSymbolFromPrompt,
  resolveMoversSymbolInput,
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

console.log("moversSymbolLookup.test.mjs: ok");
