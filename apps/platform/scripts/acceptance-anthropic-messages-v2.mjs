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
        json: async () => body,
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
  usage: { input_tokens: 12, output_tokens: 8 },
});
if (
  !thinkingOnly.ok &&
  thinkingOnly.code === core.AI_ERROR_CODES.AI_EMPTY_RESPONSE_CONTENT &&
  thinkingOnly.requestReachedProvider === true &&
  thinkingOnly.httpStatus === 200 &&
  thinkingOnly.inputTokens === 12
) {
  ok('thinking-only empty content diagnostics');
} else fail('thinking-only empty content diagnostics');

const notFound = await mockCall({ error: { type: 'not_found_error', message: 'model: claude-x' } }, 404);
if (notFound.code === core.AI_ERROR_CODES.AI_PROVIDER_UNAVAILABLE && notFound.requestReachedProvider === true) {
  ok('404 maps with requestReachedProvider');
} else fail('404 mapping');

if (failures.length) {
  console.error(JSON.stringify({ ok: false, failures }));
  process.exit(1);
}
console.log(JSON.stringify({ ok: true, passed: 4 }));
