/**
 * Ticker resolver sequential identity tests.
 * Run: node logic/tests/tickerResolver.test.mjs
 */

import assert from "node:assert/strict";
import { resolvePrimaryEntity } from "../entityResolver.js";
import { resolveTickerFromPrompt, isTickerLikeQuery } from "../engines/tickerResolver.js";
import { resetTickerQueryContext } from "../engines/tickerQueryContext.js";
import { resetTickerVoiceSession } from "../engines/tickerVoiceVariation.js";
import { validateTickerAnswerIdentity } from "../engines/tickerAnswerIdentity.js";
import { buildTickerDeskAnswer } from "../engines/tickerDeskCopy.js";

const CASES = [
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
  ok(r.ok && r.symbol === sym, `${prompt} → ${sym} (resolver)`);

  const entity = resolvePrimaryEntity(prompt);
  ok(entity.symbol === sym, `${prompt} → ${sym} (primaryEntity)`);
  ok(
    (entity.companyName || "").toLowerCase().includes(name.toLowerCase().split(" ")[0]) ||
      entity.companyName === name,
    `${prompt} name ~ ${name}`
  );

  const answer = buildTickerDeskAnswer({ symbol: sym, displayName: name });
  ok(validateTickerAnswerIdentity(answer, { symbol: sym, companyName: name }), `${prompt} answer identity`);
  ok(!/\bnvidia\b/i.test(answer) || sym === "NVDA", `${prompt} no wrong NVDA mention`);
  ok(isTickerLikeQuery(prompt), `${prompt} is ticker-like`);
}

resetTickerQueryContext();
const intel = buildTickerDeskAnswer({ symbol: "INTC", displayName: "Intel" });
ok(!/\bnvidia\b/i.test(intel), "INTC desk copy must not mention Nvidia");

const unknown = resolvePrimaryEntity("Why is xyznotick moving?");
ok(unknown.unresolved === true, "unknown ticker → unresolved");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
