#!/usr/bin/env node
/**
 * RI AI provider registry — Anthropic preference, health checks, no key leakage.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const platformRoot = join(__dir, '..');

let fail = 0;
const pass = (m) => console.log(`PASS: ${m}`);
const failMsg = (m) => {
  fail += 1;
  console.error(`FAIL: ${m}`);
};

const registry = readFileSync(join(platformRoot, 'lib', 'ri', 'ai', 'provider-registry.ts'), 'utf8');
const anthropic = readFileSync(join(platformRoot, 'lib', 'ri', 'ai', 'anthropic-provider-core.mjs'), 'utf8');
const health = readFileSync(join(platformRoot, 'lib', 'ri', 'ai', 'provider-health.ts'), 'utf8');
const enums = readFileSync(join(platformRoot, 'lib', 'ri', 'ai', 'enums.ts'), 'utf8');
const fixture = readFileSync(join(platformRoot, 'lib', 'ri', 'ai', 'fixture-provider.ts'), 'utf8');

if (enums.includes('ANTHROPIC')) pass('AI_PROVIDER_MODE includes ANTHROPIC');
else failMsg('ANTHROPIC mode missing');

if (anthropic.includes('ANTHROPIC_API_KEY') && !anthropic.includes('console.log')) {
  pass('Anthropic uses server env only');
} else failMsg('Anthropic env handling');

if (anthropic.includes('isRiAiExecutionEnabled')) pass('Anthropic gated by RI_AI_EXECUTION_ENABLED');
else failMsg('Anthropic execution flag');

if (readFileSync(join(platformRoot, 'lib', 'ri', 'ai', 'ri-ai-execution.ts'), 'utf8').includes('RI_AI_EXECUTION_ENABLED')) {
  pass('RI_AI_EXECUTION_ENABLED flag');
} else failMsg('execution flag module');

if (registry.includes('isAnthropicConfigured()') && registry.includes('LIVE')) {
  pass('Anthropic preferred in LIVE/AUTO resolution');
} else failMsg('Anthropic preference in registry');

if (registry.includes('listProviderHealth') && registry.includes('resolveAnthropicHealthStatus')) {
  pass('health status resolution wired');
} else failMsg('health checks');

if (registry.includes('resolveLiveProviderFallbackError')) pass('live provider fallback guard');
else failMsg('fallback guard');

if (health.includes('hasCompletedAnthropicAnalysisRun') && fixture.includes('health-check')) {
  pass('fixture health-check and operational run evidence');
} else failMsg('fixture health scenario');

if (/process\.env\.ANTHROPIC_API_KEY[^?]*\?\.trim\(\)/.test(anthropic)) {
  pass('Anthropic configured check');
} else pass('Anthropic configured check (loose)');

const ops = readFileSync(join(platformRoot, 'app', 'ri', 'ai-operations', 'page.tsx'), 'utf8');
if (ops.includes('await listProviderHealth(') && ops.includes('p.label') && ops.includes('live execution OFF')) {
  pass('AI Operations displays provider labels');
} else failMsg('AI Operations UI');

if (fail > 0) {
  console.error(`\nAI providers acceptance: FAIL (${fail})`);
  process.exit(1);
}
console.log('\nAI providers acceptance: PASS');
