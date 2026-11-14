#!/usr/bin/env node
/**
 * Provider diagnostics — ensure persisted shapes cannot carry secrets or payloads.
 */
import { pathToFileURL } from 'node:url';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const reasonerDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'lib', 'ri', 'reasoner');
const diag = await import(pathToFileURL(join(reasonerDir, 'anthropic-provider-diagnostics.mjs')).href);

const failures = [];
const ok = (m) => console.log(`OK: ${m}`);
const fail = (m) => {
  failures.push(m);
  console.error(`FAIL: ${m}`);
};

const leaky = diag.buildSanitisedProviderDiagnostics({
  ok: false,
  code: 'AI_PROVIDER_UNAVAILABLE',
  message: 'Failed with sk-ant-api03-secret-key-abcdefghijklmnop',
  requestId: 'msg_test',
  httpStatus: 500,
  rawTextSanitized: '{"secret":"data"}',
});
if (!leaky.safeMessage.includes('sk-ant')) ok('api key redacted in safeMessage');
else fail('api key leaked in safeMessage');
const v1 = diag.assertSanitisedDiagnosticsPayload(leaky);
if (!v1.length) ok('sanitised failure diag passes assert');
else fail(`violations ${v1.join(',')}`);

const withAttempts = diag.buildSanitisedProviderDiagnostics(
  {
    ok: false,
    code: 'AI_OUTPUT_TRUNCATED',
    message: 'max_tokens',
    providerAttempts: 2,
    providerAttemptSummaries: [
      { attempt: 1, maxTokens: 8192, stopReason: 'max_tokens', inputTokens: 10, outputTokens: 8192 },
      { attempt: 2, maxTokens: 16384, stopReason: 'end_turn', inputTokens: 10, outputTokens: 900 },
    ],
  },
  { text: 'must not persist', apiKey: 'sk-ant-should-strip' },
);
if (withAttempts.providerAttemptSummaries?.length === 2) ok('per-attempt summaries retained');
else fail('attempt summaries');
if (!withAttempts.text && !withAttempts.apiKey) ok('forbidden extra keys stripped');
else fail('extra keys not stripped');
const v2 = diag.assertSanitisedDiagnosticsPayload(withAttempts);
if (!v2.length) ok('attempt diag passes assert');
else fail(`attempt violations ${v2.join(',')}`);

const noFakeId = diag.buildSanitisedProviderDiagnostics({ ok: false, code: 'X', message: 'x', requestId: '  ' });
if (noFakeId.requestId === null) ok('blank requestId omitted');
else fail('blank requestId');

if (failures.length) {
  console.error(JSON.stringify({ ok: false, failures }));
  process.exit(1);
}
console.log(JSON.stringify({ ok: true, passed: 5 }));
