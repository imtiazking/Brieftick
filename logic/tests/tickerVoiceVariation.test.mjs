import assert from "node:assert/strict";
import {
  applyTickerVoiceVariation,
  classifyTickerVoiceType,
  resetTickerVoiceSession,
  tickerAnswerStructureKey,
} from "../engines/tickerVoiceVariation.js";

resetTickerVoiceSession();

const tsla = applyTickerVoiceVariation({ symbol: "TSLA", displayName: "Tesla" });
assert(/growth|beta|rates/i.test(tsla), tsla);
assert(!/is moving with broader sentiment today/i.test(tsla), tsla);

const nvda = applyTickerVoiceVariation({ symbol: "NVDA", displayName: "Nvidia" });
assert(/semiconductor|AI/i.test(nvda), nvda);
assert.notEqual(
  tickerAnswerStructureKey(tsla, "TSLA", "Tesla"),
  tickerAnswerStructureKey(nvda, "NVDA", "Nvidia")
);

const aapl = applyTickerVoiceVariation({ symbol: "AAPL", displayName: "Apple" });
assert(/mega-cap|positioning/i.test(aapl), aapl);

const jpm = applyTickerVoiceVariation({ symbol: "JPM", displayName: "JPMorgan" });
assert(/yields|financial|bank/i.test(jpm), jpm);

const gld = applyTickerVoiceVariation({ symbol: "GLD", displayName: "Gold ETF" });
assert(/gold|yield|dollar|FX|metal/i.test(gld), gld);

assert.equal(classifyTickerVoiceType("NVDA"), "semi_ai");
assert.equal(classifyTickerVoiceType("TSLA"), "ev_high_beta");
assert.equal(classifyTickerVoiceType("JPM"), "bank_financial");
assert.equal(classifyTickerVoiceType("GLD"), "gold_hedge");
assert.equal(classifyTickerVoiceType("XOM"), "energy");
assert.equal(classifyTickerVoiceType("SPY"), "index_etf");

resetTickerVoiceSession();
const first = applyTickerVoiceVariation({ symbol: "MSFT", displayName: "Microsoft" });
const second = applyTickerVoiceVariation({ symbol: "META", displayName: "Meta" });
assert.notEqual(
  tickerAnswerStructureKey(first, "MSFT", "Microsoft"),
  tickerAnswerStructureKey(second, "META", "Meta"),
  "session should vary structure across tickers"
);

const sentences = applyTickerVoiceVariation({ symbol: "AMD", displayName: "AMD" }).split(
  /(?<=[.!?])\s+/
);
assert(sentences.length <= 2, `expected <=2 sentences, got ${sentences.length}`);

console.log("tickerVoiceVariation.test.mjs: ok");
