/**
 * Regression: Command Centre / chip / manual submit share routing + access gate.
 * Run: node logic/tests/commandCentreRegression.test.mjs
 */

global.window = { __LOGIC_DEBUG: false, _isTerminal: true };
global.location = { search: "?preview=logic" };
global.localStorage = {
  _d: {},
  getItem(k) {
    return this._d[k] ?? null;
  },
  setItem(k, v) {
    this._d[k] = v;
  },
};

import { checkLogicAccess } from "../freeAccess.js";
import { detectIntent } from "../intentDetect.js";
import { isWatchlistPerformanceQuery } from "../engines/userContext.js";
import { classifyQuestion } from "../questionIntent.js";
import { planLogicRoute } from "../engines/planLogicRoute.js";
import { resolveUserContext } from "../engines/userContext.js";
import { resolvePrimaryEntity } from "../entityResolver.js";

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

const CHIP_PROMPT = "Explain today's market";
const WATCHLIST_PROMPT = "What stock is best performing out of my watchlist?";
const SCENARIO_PROMPT = "What happens if rates rise?";

assert(checkLogicAccess(undefined).ok, "undefined mode must not block as premium (regression PR #23)");
assert(checkLogicAccess("watchlist").ok, "watchlist mode allowed on free tier");

localStorage.setItem(
  "brieftick_watchlist_v1",
  JSON.stringify(["NVDA", "MSFT", "AAPL", "META", "AMD", "AVGO"])
);

const uc = resolveUserContext(WATCHLIST_PROMPT);
assert(uc.hasWatchlist && uc.watchlistSymbols.includes("NVDA"), "saved watchlist in userContext");

for (const prompt of [CHIP_PROMPT, WATCHLIST_PROMPT, SCENARIO_PROMPT]) {
  const entity = resolvePrimaryEntity(prompt);
  const intent = detectIntent(prompt, entity);
  assert(intent.mode, `detectIntent returns mode for: ${prompt.slice(0, 40)}`);
  const access = checkLogicAccess(intent.mode);
  if (intent.mode === "portfolio" || intent.mode === "scenario" || intent.mode === "sector-rotation") {
    assert(!access.ok, `premium mode blocked on free: ${intent.mode}`);
  } else {
    assert(access.ok, `free mode allowed: ${intent.mode} for ${prompt.slice(0, 30)}`);
  }
}

assert(isWatchlistPerformanceQuery(WATCHLIST_PROMPT), "watchlist performance query detected");
const classified = classifyQuestion(WATCHLIST_PROMPT, resolvePrimaryEntity(WATCHLIST_PROMPT), {
  userContext: uc,
});
const route = planLogicRoute(WATCHLIST_PROMPT, uc, classified);
assert(route.mode === "watchlist", "planLogicRoute → watchlist for performance question");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
