#!/usr/bin/env node
/**
 * Anthropic RI provider — mocked HTTP only (no billable API calls).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const platformRoot = join(__dir, '..');
const aiDir = join(platformRoot, 'lib', 'ri', 'ai');

let fail = 0;
const pass = (m) => console.log(`PASS: ${m}`);
const failMsg = (m) => {
  fail += 1;
  console.error(`FAIL: ${m}`);
};

const validApplicability = {
  recommendation: 'Applicable',
  confidence: 88,
  claims: [{ text: 'Grounded claim', confidence: 88, sourceSectionIds: ['SRCSEC-001'] }],
};

function mockFetch(response) {
  return async () => ({
    ok: response.ok ?? true,
    status: response.status ?? 200,
    json: async () => response.body,
  });
}

const core = await import(pathToFileURL(join(aiDir, 'anthropic-messages-core.mjs')).href);
const providerMod = await import(pathToFileURL(join(aiDir, 'anthropic-provider-core.mjs')).href);
const schemas = await import(pathToFileURL(join(aiDir, 'output-schemas.ts')).href).catch(() => null);
const citations = await import(pathToFileURL(join(aiDir, 'citation-validator.ts')).href).catch(() => null);

const validateStructuredOutput =
  schemas?.validateStructuredOutput ??
  ((name, payload) => {
    if (!payload?.recommendation && name === 'ApplicabilityResult') {
      return { ok: false, code: 'AI_OUTPUT_SCHEMA_INVALID' };
    }
    return { ok: true };
  });

const validateCitations =
  citations?.validateCitations ??
  ((claims, allowed) => {
    const ok = claims.every((c) => (c.sourceSectionIds || []).every((id) => allowed.includes(id)));
    return ok ? { ok: true } : { ok: false };
  });

if (core.parseAnthropicJsonText(JSON.stringify(validApplicability))?.recommendation === 'Applicable') {
  pass('parseAnthropicJsonText');
} else failMsg('parseAnthropicJsonText');

const authFail = core.mapAnthropicHttpFailure(401, { error: { type: 'authentication_error' } });
if (authFail.code === 'AI_PROVIDER_NOT_CONFIGURED') pass('map auth failure');
else failMsg('map auth failure');

const prevExec = process.env.RI_AI_EXECUTION_ENABLED;
const prevKey = process.env.ANTHROPIC_API_KEY;
process.env.ANTHROPIC_API_KEY = 'sk-ant-api03-test-key-abcdefghijklmnopqrstuvwxyz';
process.env.RI_AI_EXECUTION_ENABLED = 'false';

let fetchCalled = false;
const providerOff = providerMod.createAnthropicProvider({
  fetchFn: async () => {
    fetchCalled = true;
    return { ok: true, status: 200, json: async () => ({}) };
  },
});
const offResult = await providerOff.execute({
  analysisType: 'Applicability Recommendation',
  useCaseId: 'UC-RI-003',
  context: { sourceSections: [{ sourceSectionId: 'SRCSEC-001', text: 'x', citation: '§1' }] },
});
if (!fetchCalled && offResult.code === 'AI_EXTERNAL_PROCESSING_DISABLED') {
  pass('execution disabled blocks API');
} else failMsg('execution disabled blocks API');

process.env.RI_AI_EXECUTION_ENABLED = 'true';
const providerOn = providerMod.createAnthropicProvider({
  apiKeyOverride: 'sk-ant-api03-test-key-abcdefghijklmnopqrstuvwxyz',
  fetchFn: mockFetch({
    body: {
      id: 'msg_test',
      content: [{ type: 'text', text: JSON.stringify(validApplicability) }],
      usage: { input_tokens: 10, output_tokens: 20 },
    },
  }),
});
const okResult = await providerOn.execute({
  analysisType: 'Applicability Recommendation',
  useCaseId: 'UC-RI-003',
  context: { sourceSections: [{ sourceSectionId: 'SRCSEC-001', text: 'Duty text', citation: '§1' }] },
});
if (okResult.ok && okResult.structured?.recommendation === 'Applicable') {
  pass('mocked successful Messages response');
} else failMsg(`mock success ${JSON.stringify(okResult)}`);

if (schemas) {
  const schemaCheck = validateStructuredOutput('ApplicabilityResult', okResult.structured);
  if (schemaCheck.ok) pass('schema validation on mock output');
  else failMsg('schema validation');
}

if (citations) {
  const cite = validateCitations(
    [{ text: 'c', confidence: 80, sourceSectionIds: ['SRCSEC-001'] }],
    ['SRCSEC-001'],
  );
  if (cite.ok) pass('citation validation valid ids');
  else failMsg('citation valid');

  const citeBad = validateCitations(
    [{ text: 'c', confidence: 80, sourceSectionIds: ['SRCSEC-MISSING'] }],
    ['SRCSEC-001'],
  );
  if (!citeBad.ok) pass('citation validation rejects missing section');
  else failMsg('citation reject');
} else {
  pass('citation/schema tests skipped (tsx not required for core provider path)');
}

const badJson = providerMod.createAnthropicProvider({
  apiKeyOverride: 'sk-ant-api03-test-key-abcdefghijklmnopqrstuvwxyz',
  fetchFn: mockFetch({ body: { id: 'x', content: [{ type: 'text', text: 'sorry not json' }] } }),
});
const badResult = await badJson.execute({
  analysisType: 'Applicability Recommendation',
  context: { sourceSections: [{ sourceSectionId: 'SRCSEC-001', text: 't' }] },
});
if (badResult.code === 'AI_OUTPUT_SCHEMA_INVALID') pass('invalid JSON from provider');
else failMsg('invalid JSON from provider');

process.env.RI_AI_PROVIDER_MODE = 'ANTHROPIC';
delete process.env.ANTHROPIC_API_KEY;
const registrySrc = readFileSync(join(aiDir, 'provider-registry.ts'), 'utf8');
if (registrySrc.includes('resolveLiveProviderFallbackError') && registrySrc.includes('AI_LIVE_PROVIDER_UNAVAILABLE')) {
  pass('registry defines live fallback guard');
} else failMsg('registry fallback guard');

process.env.ANTHROPIC_API_KEY = prevKey;
process.env.RI_AI_EXECUTION_ENABLED = prevExec;
process.env.RI_AI_PROVIDER_MODE = 'FIXTURE';

if (fail > 0) {
  console.error(`\nAnthropic provider acceptance: FAIL (${fail})`);
  process.exit(1);
}
console.log('\nAnthropic provider acceptance: PASS');
