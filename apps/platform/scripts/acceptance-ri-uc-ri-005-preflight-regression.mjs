#!/usr/bin/env node
/**
 * Deterministic regression: UC-RI-005 batch preflight vs live PS22/9 failure (7380 output tokens).
 */
import {
  assertExtractionOutputBudget,
  estimateStructuredOutputTokens,
  maxProvisionsWithinOutputPreflight,
} from '../lib/ri/ai/extraction-output-preflight.mjs';
import { classifyMaxTokensTruncation, parseAnthropicJsonText } from '../lib/ri/ai/anthropic-messages-core.mjs';

let failed = 0;
const check = (label, ok, detail) => {
  if (!ok) {
    failed += 1;
    console.error(`FAIL: ${label}`, detail ? JSON.stringify(detail) : '');
  } else console.log(`PASS: ${label}`);
};

const MAX_OUT = 8192;
const SECTIONS = 4;
const cap = maxProvisionsWithinOutputPreflight({ sectionCount: SECTIONS, maxOutputTokens: MAX_OUT });
check('retuned cap for 4 sections below historical PS22 batch (69)', cap > 0 && cap < 69, { cap });

const ps22FailedBatch = 69;
const est69 = estimateStructuredOutputTokens({ provisionCount: ps22FailedBatch, sectionCount: SECTIONS });
const block69 = assertExtractionOutputBudget({ estimateTokens: est69, maxOutputTokens: MAX_OUT });
check('PS22 historical 69 provisions @ 4 sections fails preflight', block69.ok === false, block69);

const estCap = estimateStructuredOutputTokens({ provisionCount: cap, sectionCount: SECTIONS });
const passCap = assertExtractionOutputBudget({ estimateTokens: estCap, maxOutputTokens: MAX_OUT });
check('capped provision count passes preflight', passCap.ok === true, passCap);

const partial = '{"version":"1","claims":[{"provisionCore":"2A.3.6R"';
const trunc = classifyMaxTokensTruncation({
  stopReason: 'max_tokens',
  text: partial,
  contentBlockTypes: ['text'],
});
check(
  '7380-token class: partial JSON at max_tokens → truncation not generic schema',
  trunc?.code === 'AI_OUTPUT_TRUNCATED' && !parseAnthropicJsonText(partial),
  trunc,
);

const emptyBlocks = classifyMaxTokensTruncation({
  stopReason: 'max_tokens',
  text: '',
  contentBlockTypes: ['thinking'],
});
check(
  'thinking-only max_tokens classified',
  emptyBlocks?.code === 'AI_OUTPUT_TRUNCATED' && emptyBlocks?.truncationKind != null,
  emptyBlocks,
);

check(
  'retuned cap blocks PS22-class batch that caused 7380-token invalid JSON',
  cap < ps22FailedBatch && block69.code === 'extraction_output_preflight_exceeded',
  { cap, ps22FailedBatch },
);

console.log(failed ? 'FAIL acceptance-ri-uc-ri-005-preflight-regression' : 'PASS acceptance-ri-uc-ri-005-preflight-regression');
process.exit(failed ? 1 : 0);