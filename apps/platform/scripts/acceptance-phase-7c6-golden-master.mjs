#!/usr/bin/env node
/**
 * Phase 7C.6 — AI golden-master production parity (fixture provider; no live OpenAI).
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const platformRoot = join(__dir, '..');
const repoRoot = join(platformRoot, '..', '..');
const labRoot = join(repoRoot, 'design-lab', 'regulatory-intelligence');
const compatDir = join(platformRoot, 'lib', 'ri', 'lab-compat');

let fail = 0;
const pass = (m) => console.log(`PASS: ${m}`);
const failMsg = (m) => {
  fail += 1;
  console.error(`FAIL: ${m}`);
};

const doc = join(platformRoot, 'docs', 'RI-AI-GOLDEN-MASTER-PRODUCTIONISATION.md');
if (existsSync(doc)) pass('RI-AI-GOLDEN-MASTER-PRODUCTIONISATION.md');
else failMsg('AI productionisation map missing');

for (const f of [
  'lib/ri/ai/enums.ts',
  'lib/ri/ai/fixture-provider.ts',
  'lib/ri/ai/openai-provider.ts',
  'lib/ri/ai/provider-registry.ts',
  'lib/ri/services/ai-analysis.ts',
  'lib/ri/ai/autonomy.ts',
  'supabase/migrations/20260325120000_ri_ai.sql',
]) {
  if (!existsSync(join(platformRoot, f))) failMsg(`missing ${f}`);
  else pass(f);
}

function walkRi(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walkRi(p, acc);
    else if (/\.(tsx?|jsx?)$/.test(name)) acc.push(p);
  }
  return acc;
}

for (const f of walkRi(join(platformRoot, 'app', 'ri'))) {
  if (readFileSync(f, 'utf8').includes('design-lab/regulatory-intelligence')) {
    failMsg(`design lab import in ${f}`);
  }
}
pass('production /ri has no design-lab runtime imports');

const autonomy = readFileSync(join(platformRoot, 'lib', 'ri', 'ai', 'autonomy.ts'), 'utf8');
if (autonomy.includes('AI_AUTONOMOUS_ACTION_BLOCKED')) pass('autonomous action guard');

const openai = readFileSync(join(platformRoot, 'lib', 'ri', 'ai', 'openai-provider.ts'), 'utf8');
if (openai.includes('AI_PROVIDER_NOT_CONFIGURED')) pass('OpenAI not-configured path');

const {
  compareFixtureProviderParity,
  compareHallucinatedCitationBlocked,
} = await import(pathToFileURL(join(compatDir, 'ai-parity.mjs')).href);

const fp = await compareFixtureProviderParity();
if (fp.match) pass(`fixture provider parity ${fp.lab}`);
else failMsg(`fixture parity lab=${fp.lab} prod=${fp.prod}`);

const cite = await compareHallucinatedCitationBlocked();
if (cite.blocked) pass('invalid citation blocked');
else failMsg('citation validation');

const { AI_USE_CASE_CATALOG } = await import(
  pathToFileURL(join(platformRoot, 'lib', 'ri', 'ai', 'use-case-catalog.ts')).href,
).catch(() => ({ AI_USE_CASE_CATALOG: [] }));
if (AI_USE_CASE_CATALOG.length >= 5) pass('use case catalog');
else {
  const catalog = readFileSync(join(platformRoot, 'lib', 'ri', 'ai', 'use-case-catalog.ts'), 'utf8');
  if (catalog.includes('UC-RI-005')) pass('use case catalog (static)');
  else failMsg('use case catalog');
}

const pkg = readFileSync(join(platformRoot, 'package.json'), 'utf8');
if (pkg.includes('test:acceptance:phase7c6')) pass('npm script phase7c6');
else failMsg('npm script phase7c6');

const visual = join(platformRoot, 'docs', 'visual-review', 'phase-7c6-ai-parity.md');
if (existsSync(visual)) pass('phase 7C.6 visual doc');
else failMsg('phase-7c6-ai-parity.md');

if (fail) {
  console.error(`\nPhase 7C.6 golden master acceptance: FAIL (${fail})`);
  process.exit(1);
}
console.log('\nPhase 7C.6 golden master acceptance: PASS');
