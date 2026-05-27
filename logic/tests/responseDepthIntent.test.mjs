import assert from "node:assert/strict";
import {
  classifyResponseDepthIntent,
  isQuickMoveQuery,
  isLatestContextQuery,
} from "../engines/responseDepthIntent.js";
import { humanizeLogicAnswer } from "../engines/conversationalVoice.js";

assert.equal(isQuickMoveQuery("Why is Nvidia moving?"), true);
assert.equal(isQuickMoveQuery("Why is Tesla down today?"), true);
assert.equal(isLatestContextQuery("latest in WTW?"), true);
assert.equal(isLatestContextQuery("what's happening with JPM?"), true);
assert.equal(isLatestContextQuery("what's the story with AMD?"), true);
assert.equal(isQuickMoveQuery("latest on Google?"), false);

const quick = classifyResponseDepthIntent("Why is Nvidia moving?");
assert.equal(quick.intent, "quick_move");
assert.equal(quick.maxSentences, 2);

const latest = classifyResponseDepthIntent("What's happening with JPM?");
assert.equal(latest.intent, "latest_context");
assert.equal(latest.maxSentences, 4);

const portfolio = classifyResponseDepthIntent("What risks dominate this portfolio?", {
  classified: { mode: "portfolio", kind: "portfolio" },
});
assert.equal(portfolio.intent, "portfolio_reasoning");
assert.equal(portfolio.depth, "deep");

const longText =
  "One sentence here. Two sentence here. Three sentence here. Four sentence here. Five sentence here.";
const brief = humanizeLogicAnswer(longText, {
  depthProfile: quick,
});
const contextual = humanizeLogicAnswer(longText, {
  depthProfile: latest,
});
assert.ok((brief.match(/[.!?]/g) || []).length <= 2, "quick_move caps sentences");
assert.ok((contextual.match(/[.!?]/g) || []).length <= 4, "latest_context caps sentences");

console.log("responseDepthIntent.test.mjs: ok");
