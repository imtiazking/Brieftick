/**
 * Ticker resolver + Movers lookup tests.
 * Run: node logic/tests/tickerResolver.test.mjs
 */

import assert from "node:assert/strict";
import { resolvePrimaryEntity } from "../entityResolver.js";
import { resolveTickerFromPrompt, isTickerLikeQuery } from "../engines/tickerResolver.js";
import { resetTickerQueryContext } from "../engines/tickerQueryContext.js";
import { resetTickerVoiceSession } from "../engines/tickerVoiceVariation.js";
import { validateTickerAnswerIdentity } from "../engines/tickerAnswerIdentity.js";
import { buildTickerDeskAnswer } from "../engines/tickerDeskCopy.js";
import { applyTickerVoiceVariation } from "../engines/tickerVoiceVariation.js";

const CASES = [
  ["sandisk why is it moving?", "SNDK", "SanDisk"],
  ["Why is sandisk moving?", "SNDK", "SanDisk"],
  ["microship technology why is it moving?", "MCHP", "Microchip"],
  ["microchip technology why is it moving?", "MCHP", "Microchip"],
  ["Why is LRCX moving?", "LRCX", "Lam Research"],
  ["Why is IREN moving?", "IREN", "Iris Energy"],
  ["Why is nvdia moving?", "NVDA", "Nvidia"],
  ["Why is nvda moving?", "NVDA", "Nvidia"],
  ["Why is Nvidia moving?", "NVDA", "Nvidia"],
  ["Why is google moving?", "GOOGL", "Alphabet"],
  ["Why is googl moving?", "GOOGL", "Alphabet"],
  ["Why is snow moving?", "SNOW", "Snowflake"],
  ["Why is Snowflake moving?", "SNOW", "Snowflake"],
  ["Why is micron moving?", "MU", "Micron"],
  ["Why is intel moving?", "INTC", "Intel"],
  ["Why is nok moving?", "NOK", "Nokia"],
  ["Why is nokia moving?", "NOK", "Nokia"],
];

let passed = 0;
let failed = 0;

function ok(cond, msg) {
  if (cond) {
    passed += 1;
    console.log("✓", msg);
  } else {
    failed += 1;
    console.error("✗", msg);
  }
}

for (const [prompt, sym, name] of CASES) {
  resetTickerQueryContext();
  resetTickerVoiceSession();

  const r = resolveTickerFromPrompt(prompt);
  ok(r.ok && r.symbol === sym, `${prompt} → ${sym} (${r.source})`);
  ok(
    r.source?.includes("movers") || r.source === "moversSymbolLookup",
    `${prompt} uses movers lookup`
  );

  const entity = resolvePrimaryEntity(prompt);
  ok(entity.symbol === sym, `${prompt} primaryEntity ${sym}`);
  ok(
    (entity.companyName || "").toLowerCase().includes(name.toLowerCase().split(" ")[0]),
    `${prompt} name ~ ${name}`
  );

  const answer = applyTickerVoiceVariation({
    symbol: sym,
    displayName: name,
    resetSession: true,
  });
  ok(validateTickerAnswerIdentity(answer, { symbol: sym, companyName: name }), `${prompt} identity`);
  if (sym !== "NVDA") {
    ok(!/\bnvidia\b/i.test(answer), `${prompt} must not mention Nvidia`);
  }
}

resetTickerQueryContext();
resetTickerVoiceSession();

const seq = [
  ["Why is Nvidia moving?", "NVDA"],
  ["Why is Snowflake moving?", "SNOW"],
  ["Why is Intel moving?", "INTC"],
  ["Why is Nokia moving?", "NOK"],
];

for (const [prompt, sym] of seq) {
  resetTickerQueryContext();
  resetTickerVoiceSession();
  const r = resolveTickerFromPrompt(prompt);
  ok(r.symbol === sym, `sequential ${prompt} → ${sym}`);
  const ans = buildTickerDeskAnswer({ symbol: sym, displayName: r.name });
  if (sym !== "NVDA") ok(!/\bnvidia\b/i.test(ans), `sequential ${sym} no NVDA bleed`);
}

const unknown = resolvePrimaryEntity("Why is xyznotick moving?");
ok(unknown.unresolved === true, "unknown → unresolved");
ok(isTickerLikeQuery("Why is LRCX moving?"), "LRCX query is ticker-like");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
