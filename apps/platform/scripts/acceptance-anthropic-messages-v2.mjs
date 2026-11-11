#!/usr/bin/env node
/**
 * Anthropic Messages API — response parsing regression (mocked HTTP only).
 */
import { pathToFileURL } from 'node:url';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const aiDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'lib', 'ri', 'ai');
const core = await import(pathToFileURL(join(aiDir, 'anthropic-messages-core.mjs')).href);

const failures = [];
const ok = (m) => console.log(`OK: ${m}`);
const fail = (m) => {
  failures.push(m);
  console.error(`FAIL: ${m}`);
};

const apiKey = 'sk-ant-api03-test-key-abcdefghijklmnopqrstuvwxyz';

const jsonPayload = JSON.stringify({
  schemaVersion: 'forgeniq.ask-ri.reasoner-output.v1',
  responseState: 'ANSWERED',
});

async function mockCall(body, status = 200) {
  return core.callAnthropicMessages(
    apiKey,
    { model: 'claude-haiku-5-5', system: 'sys', user: 'user', maxTokens: 20 },
    {
      fetchFn: async () => ({
        ok: status >= 200 && status < 300,
        status,
        text: async () => JSON.stringify(body),
      }),
    },
  );
}

const plain = await mockCall({
  id: 'msg_plain',
  content: [{ type: 'text', text: jsonPayload }],
  usage: { input_tokens: 10, output_tokens: 5 },
});
if (plain.ok && plain.text === jsonPayload && plain.requestReachedProvider === true) ok('plain text block');
else fail('plain text block');

const thinkingFirst = await mockCall({
  id: 'msg_think',
  content: [
    { type: 'thinking', thinking: 'internal reasoning only' },
    { type: 'text', text: jsonPayload },
  ],
  stop_reason: 'end_turn',
  usage: { input_tokens: 100, output_tokens: 50 },
});
if (thinkingFirst.ok && thinkingFirst.text === jsonPayload && thinkingFirst.contentBlockTypes?.includes('thinking')) {
  ok('thinking block then text block');
} else fail('thinking block then text block');

const thinkingOnly = await mockCall({
  id: 'msg_empty',
  content: [{ type: 'thinking', thinking: 'only thinking' }],
  stop_reason: 'max_tokens',
  usage: { input_tokens: 12, output_tokens: 2048 },
});
if (
  !thinkingOnly.ok &&
  thinkingOnly.code === core.AI_ERROR_CODES.AI_OUTPUT_TRUNCATED &&
  thinkingOnly.truncationKind === core.TRUNCATION_KIND.THINKING_EXHAUSTED &&
  thinkingOnly.requestReachedProvider === true &&
  thinkingOnly.httpStatus === 200 &&
  thinkingOnly.inputTokens === 12
) {
  ok('thinking-only max_tokens → AI_OUTPUT_TRUNCATED');
} else fail('thinking-only max_tokens truncation');

const thinkingOnlyNoStop = await mockCall({
  id: 'msg_empty2',
  content: [{ type: 'thinking', thinking: 'only thinking' }],
  usage: { input_tokens: 12, output_tokens: 8 },
});
if (
  !thinkingOnlyNoStop.ok &&
  thinkingOnlyNoStop.code === core.AI_ERROR_CODES.AI_EMPTY_RESPONSE_CONTENT
) {
  ok('thinking-only without max_tokens stays AI_EMPTY_RESPONSE_CONTENT');
} else fail('thinking-only empty content diagnostics');

let capturedBody = null;
await core.callAnthropicMessages(
  apiKey,
  {
    model: 'claude-haiku-5-5',
    system: 'sys',
    user: 'user',
    maxTokens: 8192,
    thinking: { type: 'adaptive' },
    outputConfig: { effort: 'medium' },
  },
  {
    fetchFn: async (_url, init) => {
      capturedBody = JSON.parse(init.body);
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            content: [{ type: 'text', text: jsonPayload }],
            usage: { input_tokens: 1, output_tokens: 1 },
          }),
      };
    },
  },
);
if (
  capturedBody?.max_tokens === 8192 &&
  capturedBody?.thinking?.type === 'adaptive' &&
  capturedBody?.output_config?.effort === 'medium'
) {
  ok('request includes max_tokens, adaptive thinking, output_config.effort');
} else fail('eval reasoner request shape');

const notFound = await mockCall({ error: { type: 'not_found_error', message: 'model: claude-x' } }, 404);
if (notFound.code === core.AI_ERROR_CODES.AI_PROVIDER_UNAVAILABLE && notFound.requestReachedProvider === true) {
  ok('404 maps with requestReachedProvider');
} else fail('404 mapping');

if (failures.length) {
  console.error(JSON.stringify({ ok: false, failures }));
  process.exit(1);
}
console.log(JSON.stringify({ ok: true, passed: 6 }));
