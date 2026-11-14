#!/usr/bin/env node
/**
 * FG22/5 PDF-grounded UC-RI-005 — technical testing (staging).
 *
 * - Default: offline PDF context + read-only DB guardrails (no tenant writes).
 * - Live tenant AI: FORGENIQ_AI_TECH_FG22_LIVE=1 only after STAGING_AI_TECH_ORG_ID or Org A approval.
 * - Partner UAT is never used for experimental AI (assertNotPartnerUatOrg).
 */
import pg from 'pg';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { loadPlatformEnv, resolvePlatformRoot } from './load-platform-env.mjs';
import {
  stagingPgClientOptions,
  validateStagingDatabaseUrl,
} from '../../lib/ri/ingestion/snapshot/staging-database-config.mjs';
import { buildPdfGroundedAnalysisContext } from '../../lib/ri/ai/build-pdf-grounded-analysis-context.mjs';
import { PARTNER_UAT_ORG_ID, ORG_A_ID } from './partner-uat-seed-constants.mjs';
import {
  FG22_PDF_TECH,
  resolveAiTechnicalTestOrgId,
  assertLiveAiTechnicalOrgOnly,
  AI_DEV_ORG_ID,
} from './staging-ai-technical-test-config.mjs';

const platformRoot = resolvePlatformRoot(import.meta.url);
loadPlatformEnv(platformRoot);
const OUT = join(platformRoot, 'docs', 'STAGING-FG22-OBLIGATION-PDF-TECHNICAL-E2E.json');

async function main() {
  const technicalOrgId = resolveAiTechnicalTestOrgId();
  try {
    assertLiveAiTechnicalOrgOnly(technicalOrgId);
  } catch (e) {
    finish({
      pass: false,
      error: e.message,
      technicalOrgId,
      expectedOrgId: AI_DEV_ORG_ID,
    });
    return;
  }

  const report = {
    capturedAt: new Date().toISOString(),
    technicalOrgId,
    publicationId: FG22_PDF_TECH.publicationId,
    plannedChangeId: FG22_PDF_TECH.changeId,
    plannedExternalKey: FG22_PDF_TECH.externalKey,
    phases: {},
    pass: false,
    writePolicy: 'no_tenant_writes_in_this_script',
  };

  const url = process.env.STAGING_DATABASE_URL || process.env.FORGENIQ_LOCAL_PG_URL;
  if (!url) {
    report.phases.db = { pass: false, error: 'database_url_missing' };
    finish(report);
    return;
  }
  validateStagingDatabaseUrl(url);
  const client = new pg.Client(stagingPgClientOptions(url));
  await client.connect();

  report.partnerUatIsolation = {
    partnerOrgId: PARTNER_UAT_ORG_ID,
    note: 'Partner rows are audited separately; this script does not INSERT into Partner UAT',
    forbiddenExperimentalAi: true,
  };

  report.baselineOrgAAssistObligations = (
    await client.query(
      `select count(*)::int as n from regulatory_obligations where organisation_id = $1::uuid and origin = 'AI_ASSISTED'`,
      [ORG_A_ID],
    )
  ).rows[0].n;

  const adminUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const adminKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const pdfCtx = await buildPdfGroundedAnalysisContext({
    publicationId: FG22_PDF_TECH.publicationId,
    adminSupabase: adminUrl && adminKey ? createClient(adminUrl, adminKey) : undefined,
  });
  report.phases.pdfContext = {
    pass: pdfCtx.ok === true && pdfCtx.sourceSections?.length >= 6,
    sectionCount: pdfCtx.sourceSections?.length ?? 0,
    obligationGradeSuitable: pdfCtx.grounding?.obligationGradeSuitable ?? null,
    publicationClass: pdfCtx.grounding?.regulatoryAnalysis?.publicationClassification ?? null,
  };

  const live = process.env.FORGENIQ_AI_TECH_FG22_LIVE === '1';
  report.phases.liveAi = {
    pass: false,
    skipped: !live,
    detail: live
      ? 'requires approved STAGING_AI_TECH_ORG_ID, hosted session for technical org, and deployed POST /api/ri-lab/ai-analysis-runs'
      : 'set FORGENIQ_AI_TECH_FG22_LIVE=1 after technical-test org approval (not Partner UAT)',
  };

  if (live) {
    const versionRes = await client.query(
      `select id from regulatory_publication_versions where publication_id = $1::uuid order by version_number desc limit 1`,
      [FG22_PDF_TECH.publicationId],
    );
    const versionId = versionRes.rows[0]?.id;
    const idempotency = `UC-RI-005:${versionId}:${technicalOrgId}:${FG22_PDF_TECH.idempotencySuffix}`;
    const existingRun = await client.query(
      `select id, review_status, execution_status from ai_analysis_runs where organisation_id = $1 and idempotency_key = $2`,
      [technicalOrgId, idempotency],
    );
    report.existingRun = existingRun.rows[0] || null;
    report.plannedIdempotencyKey = idempotency;
  }

  const orgAAfter = (
    await client.query(
      `select count(*)::int as n from regulatory_obligations where organisation_id = $1::uuid and origin = 'AI_ASSISTED'`,
      [ORG_A_ID],
    )
  ).rows[0].n;
  report.tenantIsolation = {
    orgAUnchanged: orgAAfter === report.baselineOrgAAssistObligations,
    partnerNotTargeted: technicalOrgId !== PARTNER_UAT_ORG_ID,
  };

  await client.end();

  report.pass =
    report.phases.pdfContext.pass === true &&
    report.tenantIsolation.orgAUnchanged === true &&
    report.tenantIsolation.partnerNotTargeted === true &&
    (report.phases.liveAi.skipped || report.phases.liveAi.pass);

  finish(report);
}

function finish(report) {
  writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ pass: report.pass, out: OUT, phases: report.phases }, null, 2));
  process.exit(report.pass ? 0 : 1);
}

await main();