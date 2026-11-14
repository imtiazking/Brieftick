#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AI_DEVELOPMENT_ORG_ID,
  PARTNER_UAT_ORG_ID,
  ORG_A_OPERATIONAL_ID,
  assertExperimentalAiTenant,
} from '../lib/ri/ai/experimental-ai-tenant-guard.mjs';

const platformRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
const ok = (m) => console.log(`OK: ${m}`);
const fail = (m) => {
  failures.push(m);
  console.error(`FAIL: ${m}`);
};

function expectThrow(fn, code) {
  try {
    fn();
    fail(`expected throw ${code}`);
  } catch (e) {
    if (!String(e.message).includes(code)) fail(`wrong error: ${e.message}`);
    else ok(`throws ${code}`);
  }
}

expectThrow(
  () => assertExperimentalAiTenant({ organisationId: PARTNER_UAT_ORG_ID, useCaseId: 'UC-RI-005', operation: 'request' }),
  'partner_uat_forbidden',
);
expectThrow(
  () => assertExperimentalAiTenant({ organisationId: ORG_A_OPERATIONAL_ID, useCaseId: 'UC-RI-005', operation: 'request' }),
  'org_a_forbidden',
);
expectThrow(
  () => assertExperimentalAiTenant({ organisationId: '00000000-0000-4000-8000-000000009999', useCaseId: 'UC-RI-005', operation: 'request' }),
  'experimental_ai_wrong_organisation',
);

try {
  assertExperimentalAiTenant({ organisationId: AI_DEVELOPMENT_ORG_ID, useCaseId: 'UC-RI-005', operation: 'request' });
  ok('AI Development org allowed for UC-RI-005');
} catch (e) {
  fail(`AI dev should be allowed: ${e.message}`);
}

const aiAnalysis = readFileSync(join(platformRoot, 'lib', 'ri', 'services', 'ai-analysis.ts'), 'utf8');
const materialisation = readFileSync(join(platformRoot, 'lib', 'ri', 'services', 'ai-materialisation.ts'), 'utf8');
if (!aiAnalysis.includes('assertExperimentalAiTenant')) fail('ai-analysis.ts missing server guard');
else ok('ai-analysis imports experimental tenant guard');
if (!materialisation.includes('assertExperimentalAiTenant')) fail('ai-materialisation.ts missing server guard');
else ok('ai-materialisation imports experimental tenant guard');

console.log(JSON.stringify({ ok: failures.length === 0 }, null, 2));
process.exit(failures.length ? 1 : 0);