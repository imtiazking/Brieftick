#!/usr/bin/env node
/**
 * Pre-live gate — AI Development tenant only (read-only + env contract).
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadPlatformEnv, resolvePlatformRoot } from './load-platform-env.mjs';
import {
  AI_DEV_ORG_ID,
  assertLiveAiTechnicalOrgOnly,
  resolveAiTechnicalTestOrgId,
} from './staging-ai-technical-test-config.mjs';
import { ORG_A_ID, PARTNER_UAT_ORG_ID } from './partner-uat-seed-constants.mjs';

const platformRoot = resolvePlatformRoot(import.meta.url);
loadPlatformEnv(platformRoot);
const OUT = join(platformRoot, 'docs', 'STAGING-AI-DEV-PRE-LIVE-GATE.json');

const checks = [];
function record(id, pass, detail) {
  checks.push({ id, pass, detail });
}

try {
  assertLiveAiTechnicalOrgOnly(AI_DEV_ORG_ID);
  record('ai_dev_allowed', true, AI_DEV_ORG_ID);
} catch (e) {
  record('ai_dev_allowed', false, e.message);
}

for (const [id, label] of [
  [PARTNER_UAT_ORG_ID, 'partner'],
  [ORG_A_ID, 'org_a'],
]) {
  try {
    assertLiveAiTechnicalOrgOnly(id);
    record(`${label}_blocked`, false, 'should have thrown');
  } catch {
    record(`${label}_blocked`, true, 'rejected');
  }
}

const envOrg = process.env.STAGING_AI_TECH_ORG_ID?.trim();
record('env_staging_ai_tech_org', envOrg === AI_DEV_ORG_ID, envOrg || 'unset — set before hosted live AI');

const overrideMisconfig = process.env.STAGING_AI_TECH_ORG_ID === PARTNER_UAT_ORG_ID;
record('env_cannot_target_partner', !overrideMisconfig, overrideMisconfig ? 'BLOCKED' : 'ok');

const riAi = process.env.RI_AI_EXECUTION_ENABLED === 'true';
const labWrites = process.env.RI_LAB_CONNECTED_WRITES_ENABLED === 'true';
record('feature_flags_default_off_in_report', !riAi && !labWrites, `RI_AI=${riAi} LAB_WRITES=${labWrites}`);

const report = {
  capturedAt: new Date().toISOString(),
  resolvedOrgId: resolveAiTechnicalTestOrgId(),
  checks,
  pass: checks.every((c) => c.pass) && envOrg === AI_DEV_ORG_ID,
  liveAiAllowed: false,
  note: 'pass=true and env set still require deployment approval before live execution',
};

writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exit(report.pass ? 0 : 1);