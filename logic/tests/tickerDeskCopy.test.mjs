import assert from "node:assert/strict";
import {
  buildTickerDeskAnswer,
  GENERIC_TICKER_PHRASE_RE,
  isSymbolSpecificHeadline,
} from "../engines/tickerDeskCopy.js";

const banned = [
  "in focus on today's tape",
  "headline sensitivity",
  "sector beta remain the primary channels",
  "macro rates framing the move",
  "contextual read while live feeds connect",
];

function assertNoBanned(text) {
  for (const phrase of banned) {
    assert.equal(
      text.toLowerCase().includes(phrase),
      false,
      `should not contain: ${phrase}\nGot: ${text}`
    );
  }
  assert.equal(GENERIC_TICKER_PHRASE_RE.test(text), false, `generic pattern matched: ${text}`);
}

const tsla = buildTickerDeskAnswer({ symbol: "TSLA", displayName: "Tesla" });
assert(/high-beta growth sentiment/i.test(tsla), tsla);
assert(/no clear company-specific catalyst/i.test(tsla), tsla);
assertNoBanned(tsla);

const nvda = buildTickerDeskAnswer({ symbol: "NVDA", displayName: "Nvidia" });
assert(/AI and semiconductor sentiment/i.test(nvda), nvda);
assertNoBanned(nvda);

const aapl = buildTickerDeskAnswer({ symbol: "AAPL", displayName: "Apple" });
assert(/mega-cap technology sentiment/i.test(aapl), aapl);
assert(/stock-specific catalyst/i.test(aapl), aapl);
assertNoBanned(aapl);

const msft = buildTickerDeskAnswer({ symbol: "MSFT", displayName: "Microsoft" });
assertNoBanned(msft);
assert(/Microsoft/i.test(msft), msft);

const withHeadline = buildTickerDeskAnswer({
  symbol: "NVDA",
  displayName: "Nvidia",
  headline: "Nvidia raises guidance on data-center demand",
});
assert(/data-center|guidance/i.test(withHeadline), withHeadline);
assert.equal(
  isSymbolSpecificHeadline("Nvidia raises guidance on data-center demand", "NVDA", "Nvidia"),
  true
);

console.log("tickerDeskCopy.test.mjs: ok");
