import assert from "node:assert/strict";
import {
  buildTickerDeskAnswer,
  GENERIC_TICKER_PHRASE_RE,
  isSymbolSpecificHeadline,
} from "../engines/tickerDeskCopy.js";
import { resetTickerVoiceSession } from "../engines/tickerVoiceVariation.js";

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

resetTickerVoiceSession();

const tsla = buildTickerDeskAnswer({ symbol: "TSLA", displayName: "Tesla" });
assert(/growth|beta|Tesla/i.test(tsla), tsla);
assertNoBanned(tsla);

const nvda = buildTickerDeskAnswer({ symbol: "NVDA", displayName: "Nvidia" });
assert(/semiconductor|AI|Nvidia/i.test(nvda), nvda);
assertNoBanned(nvda);

const aapl = buildTickerDeskAnswer({ symbol: "AAPL", displayName: "Apple" });
assert(/mega-cap|Apple/i.test(aapl), aapl);
assertNoBanned(aapl);

const msft = buildTickerDeskAnswer({ symbol: "MSFT", displayName: "Microsoft" });
assertNoBanned(msft);
assert(/Microsoft/i.test(msft), msft);

const withHeadline = buildTickerDeskAnswer({
  symbol: "NVDA",
  displayName: "Nvidia",
  headline: "Nvidia raises guidance on data-center demand",
});
assert(/data-center|guidance|Nvidia/i.test(withHeadline), withHeadline);
assert.equal(
  isSymbolSpecificHeadline("Nvidia raises guidance on data-center demand", "NVDA", "Nvidia"),
  true
);

console.log("tickerDeskCopy.test.mjs: ok");
