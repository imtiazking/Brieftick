/**
 * Conversational presentation — brief answers, dormant chips only.
 * Run: node logic/tests/conversationalPresentation.test.mjs
 */

global.window = { __LOGIC_DEBUG: false };
global.location = { search: "" };

import {
  buildConversationalPresentation,
  resolveAnswerDepth,
} from "../engines/conversationalPresentation.js";

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

assert(resolveAnswerDepth("Why is Nvidia moving?", "ticker") === "brief", "simple move question → brief");

const res = {
  mode: "ticker",
  directAnswer: "NVIDIA is down 2.29% today amid profit-taking after its extended rally.",
  summary: "Long summary that should not duplicate if directAnswer exists.",
  cards: {
    snapshot: "NVDA session",
    catalyst: "Earnings expectations and AI demand commentary",
    macroContext: "Rates path frames mega-cap tech",
    sectorImpact: "Semiconductor sympathy",
    volatility: "Elevated single-name vol",
    aiSummary: "duplicate thesis",
  },
  optionalCards: {
    riskSignal: "Crowded long positioning",
    crossAssetSignal: "Yields firm; USD bid",
  },
  keyDrivers: ["Headline flow"],
  signals: ["Vol active"],
};

const conv = buildConversationalPresentation(res, {
  prompt: "Why is Nvidia moving?",
  responsePlan: { intentId: "ticker" },
  primaryEntity: { symbol: "NVDA" },
});

assert(conv.primaryAnswer.includes("2.29%"), "primary uses direct answer");
assert(conv.primaryAnswer.length < 280, "brief depth caps primary length");
assert(!conv.followUpChips.some((c) => c.label === "Summary"), "no summary chip");
assert(conv.followUpChips.some((c) => c.id === "catalyst"), "catalyst chip available");
assert(conv.followUpChips.some((c) => c.label === "Price Action"), "price action chip available");
assert(conv.followUpChips.length <= 5, "ticker mode caps at five chips");
assert(conv.followUpChips.every((c) => c.text && c.text.length > 8), "chips carry dormant text");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
