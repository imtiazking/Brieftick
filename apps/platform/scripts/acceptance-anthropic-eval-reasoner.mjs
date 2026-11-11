#!/usr/bin/env node
/**
 * V2 eval reasoner — truncated output retry (mocked HTTP, no API key spend).
 */
import { pathToFileURL } from 'node:url';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const platformRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const aiDir = join(platformRoot, 'lib', 'ri', 'ai');
const reasonerDir = join(platformRoot, 'lib', 'ri', 'reasoner');

const core = await import(pathToFileURL(join(aiDir, 'anthropic-messages-core.mjs')).href);
const { invokeAnthropicReasoner } = await import(
  pathToFileURL(join(reasonerDir, 'invoke-anthropic-reasoner.mjs')).href
);
const { EvalSpendTracker } = await import(
  pathToFileURL(join(reasonerDir, 'anthropic-eval-budget.mjs')).href
);
const { V2_EVAL_DEFAULT_MAX_OUTPUT_TOKENS, V2_EVAL_DEFAULT_MAX_OUTPUT_TOKENS_RETRY } = await import(
  pathToFileURL(join(reasonerDir, 'anthropic-eval-reasoner-config.mjs')).href
);
const { buildEmptyReasonerOutput } = await import(
  pathToFileURL(join(reasonerDir, 'reasoner-output-schema.mjs')).href
);

const failures = [];
const ok = (m) => console.log(`OK: ${m}`);
const fail = (m) => {
  failures.push(m);
  console.error(`FAIL: ${m}`);
};

const apiKey = 'sk-ant-api03-test-key-abcdefghijklmnopqrstuvwxyz';
const jsonPayload = JSON.stringify(
  buildEmptyReasonerOutput({
    responseState: 'ANSWERED',
    sufficiencyAssessment: {
      overall: 'DIRECT_SUPPORT',
      explanation: 'Mock',
      publicationsConsidered: [],
      publicationsAnswering: [],
    },
    verificationStatus: 'PASSED',
    humanReviewRequired: false,
  }),
);

process.env.RI_AI_EXECUTION_ENABLED = 'true';
process.env.ANTHROPIC_API_KEY = apiKey;

const bundle = {
  evidenceChunks: [{ evidenceChunkId: 'EV-1', publicationCode: 'CP26', excerptText: 'Sample excerpt.' }],
  publicationsRepresented: ['CP26'],
  excludedChunks: [],
  charsUsed: 100,
  warnings: [],
};

let callIndex = 0;
const fetchFn = async () => {
  callIndex += 1;
  if (callIndex === 1) {
    return {
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          id: 'msg_t1',
          stop_reason: 'max_tokens',
          content: [{ type: 'thinking', thinking: 'long think' }],
          usage: { input_tokens: 4000, output_tokens: 2048 },
        }),
    };
  }
  return {
    ok: true,
    status: 200,
    text: async () =>
      JSON.stringify({
        id: 'msg_t2',
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: jsonPayload }],
        usage: { input_tokens: 4000, output_tokens: 900 },
      }),
  };
};

const spend = new EvalSpendTracker({ budgetUsd: 0.25, model: 'claude-haiku-5-5' });
spend.reserveEstimate(0.2);

const result = await invokeAnthropicReasoner('What does CP26 require?', bundle, {
  fetchFn,
  spendTracker: spend,
  skipExecutionGuard: true,
  maxTokens: 2048,
  maxTokensRetry: 8192,
});

if (result.ok && result.providerAttempts === 2) ok('retry after thinking exhaustion succeeds');
else fail('retry after thinking exhaustion');

if (spend.requestCount === 2 && spend.outputTokens === 2048 + 900) ok('retry usage counted toward spend');
else fail(`spend accounting (requests=${spend.requestCount} out=${spend.outputTokens})`);

if (V2_EVAL_DEFAULT_MAX_OUTPUT_TOKENS === 8192 && V2_EVAL_DEFAULT_MAX_OUTPUT_TOKENS_RETRY === 16384) {
  ok('default eval token ceilings');
} else fail('default eval token ceilings');

const truncated = core.classifyMaxTokensTruncation({
  stopReason: 'max_tokens',
  text: '{"schemaVersion":"forgeniq',
  contentBlockTypes: ['thinking', 'text'],
});
if (truncated?.truncationKind === core.TRUNCATION_KIND.JSON_INCOMPLETE) ok('partial json truncation kind');
else fail('partial json truncation kind');

if (failures.length) {
  console.error(JSON.stringify({ ok: false, failures }));
  process.exit(1);
}
console.log(JSON.stringify({ ok: true, passed: 4 }));
