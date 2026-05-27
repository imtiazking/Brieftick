/**
 * Conversational voice — strip markdown and report labels.
 * Run: node logic/tests/conversationalVoice.test.mjs
 */

global.window = { __LOGIC_PREVIEW: true };
global.location = { search: "" };

import {
  humanizeLogicAnswer,
  stripMarkdownFormatting,
  stripReportLabels,
  limitSentences,
} from "../engines/conversationalVoice.js";

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

const md = "# NVDA Market Analysis\n\n**Headline Reason:** Profit-taking after rally.\n\nLogic Summary: Extended run.";
const clean = humanizeLogicAnswer(md, { depth: "brief", maxChars: 400 });
assert(!/#|\*\*/.test(clean), "removes markdown headers and bold");
assert(!/headline reason|logic summary/i.test(clean), "removes report labels");
assert(limitSentences("One. Two. Three. Four.", 3).split(/(?<=[.!?])\s+/).length <= 3, "limits sentences");

const robotic =
  "Microsoft is down 0.91% with no major company-specific news driving the decline.";
const soft = humanizeLogicAnswer(robotic, { depth: "brief" });
assert(/catalyst|broader|sector/i.test(soft), "softens robotic no-news template");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
