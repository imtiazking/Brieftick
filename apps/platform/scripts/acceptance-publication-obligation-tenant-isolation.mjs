#!/usr/bin/env node
/**
 * Offline tenant isolation for publication→obligation (UC-RI-005) — no hosted DB, no Partner UAT mutations.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AI_DEVELOPMENT_ORG_ID,
  PARTNER_UAT_ORG_ID,
  ORG_A_OPERATIONAL_ID,
  isPublicationToObligationIntegrationEnabled,
  assertExperimentalAiTenant,
} from '../lib/ri/ai/experimental-ai-tenant-guard.mjs';

const platformRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
const ok = (m) => console.log(`OK: ${m}`);
const fail = (m) => {
  failures.push(m);
  console.error(`FAIL: ${m}`);
};

if (!isPublicationToObligationIntegrationEnabled(AI_DEVELOPMENT_ORG_ID)) {
  fail('AI Development org must be allowlisted');
} else ok('AI Development org allowlisted');

if (isPublicationToObligationIntegrationEnabled(PARTNER_UAT_ORG_ID)) {
  fail('Partner UAT must not be allowlisted');
} else ok('Partner UAT excluded');

if (isPublicationToObligationIntegrationEnabled(ORG_A_OPERATIONAL_ID)) {
  fail('Org A must not be allowlisted');
} else ok('Org A excluded');

if (isPublicationToObligationIntegrationEnabled('00000000-0000-4000-8000-000000009999')) {
  fail('unknown staging org must not be allowlisted');
} else ok('other staging orgs excluded');

const ISOLATION_B_ORG_ID = '22e46d56-1f6f-42c2-9424-b2e0a40df45a';
const prevOverride = process.env.STAGING_AI_TECH_ORG_ID;
process.env.STAGING_AI_TECH_ORG_ID = PARTNER_UAT_ORG_ID;
if (isPublicationToObligationIntegrationEnabled(AI_DEVELOPMENT_ORG_ID)) {
  fail('misconfigured STAGING_AI_TECH_ORG_ID=Partner UAT must fail closed');
} else ok('fail closed when STAGING_AI_TECH_ORG_ID points at Partner UAT');
process.env.STAGING_AI_TECH_ORG_ID = ISOLATION_B_ORG_ID;
if (isPublicationToObligationIntegrationEnabled(ISOLATION_B_ORG_ID)) {
  fail('STAGING_AI_TECH_ORG_ID must not enable unapproved org');
} else ok('STAGING_AI_TECH_ORG_ID cannot widen pilot allowlist');
process.env.STAGING_AI_TECH_ORG_ID = AI_DEVELOPMENT_ORG_ID;
if (!isPublicationToObligationIntegrationEnabled(AI_DEVELOPMENT_ORG_ID)) {
  fail('AI Dev must remain enabled when override matches allowlist');
} else ok('override allowed only when equal to AI Development org id');
process.env.STAGING_AI_TECH_ORG_ID = prevOverride;

const sessionPayload = readFileSync(join(platformRoot, 'lib/ri/lab-api/session-payload.ts'), 'utf8');
if (!sessionPayload.includes('buildLabWriteCapabilities(params.role, params.organisationId)')) {
  fail('session payload must pass organisationId into writeCapabilities');
} else ok('session writeCapabilities org-scoped');

const labWrites = readFileSync(join(platformRoot, 'lib/ri/lab-api/lab-connected-writes.ts'), 'utf8');
if (!labWrites.includes('isPublicationToObligationIntegrationEnabled')) {
  fail('lab-connected-writes missing publication integration flag');
} else ok('aiRequest capability gated by server feature flag');

const aiRuns = readFileSync(join(platformRoot, 'app/api/ri-lab/ai-analysis-runs/route.ts'), 'utf8');
if (!aiRuns.includes('getPublicationDetail(ctx.supabase, ctx.organisationId')) {
  fail('POST ai-analysis-runs missing tenant publication lookup');
} else ok('POST route tenant publication lookup');

const getRun = readFileSync(join(platformRoot, 'lib/ri/services/ai-analysis.ts'), 'utf8');
if (!getRun.includes(".eq('organisation_id', organisationId)")) {
  fail('getAnalysisRun missing organisation_id filter');
} else ok('analysis runs scoped by organisation_id');

try {
  assertExperimentalAiTenant({
    organisationId: PARTNER_UAT_ORG_ID,
    useCaseId: 'UC-RI-005',
    operation: 'request',
  });
  fail('Partner UAT POST must throw');
} catch (e) {
  if (!String(e.message).includes('partner_uat_forbidden')) fail(`Partner UAT wrong error: ${e.message}`);
  else ok('Partner UAT cannot start UC-RI-005');
}

const materialisation = readFileSync(join(platformRoot, 'lib/ri/services/ai-materialisation.ts'), 'utf8');
if (!materialisation.includes('assertNotAutonomousAiAction')) {
  fail('materialisation missing autonomy guard');
} else ok('no autonomous obligation materialisation');

console.log(JSON.stringify({ programmePass: failures.length === 0, failures }, null, 2));
process.exit(failures.length ? 1 : 0);