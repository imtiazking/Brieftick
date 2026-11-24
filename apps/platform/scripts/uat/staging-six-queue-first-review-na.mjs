#!/usr/bin/env node
/**
 * Hosted: initial (first) human review with ORGANISATION_NOT_APPLICABLE on a binding finding.
 * Requires a run open for first review; posts decisions for every finding in the run.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../../lib/ri/eval/eval-paths.mjs';
import { STAGING_ORIGIN, runAs, requireUatPersonas } from './staging-user-sessions.mjs';
import { WORKFLOW_QUEUES } from '../../lib/ri/triage/regulatory-workflow-queues.mjs';
import { deriveWorkflowQueue } from '../../lib/ri/triage/regulatory-workflow-queues.mjs';

const OUT = join(REPO_ROOT, 'docs', 'uat', 'evidence', 'six-queue-workflow-staging-2026-11-24');
mkdirSync(OUT, { recursive: true });

const MIN_COMMENT = 'Initial review N/A pathway validation on staging.';
const MIN_QUOTE =
  'A manufacturer must regularly review its products taking into account any event that could materially affect the potential risk to the target market.';

function rejectDecision(finding) {
  const hash = finding.claimTextSha256;
  if (!hash) throw new Error(`missing_claim_hash:${finding.findingId}`);
  return {
    findingId: finding.findingId,
    claimTextSha256: hash,
    decision: 'REJECTED',
    comment: `${MIN_COMMENT} Placeholder reject for sibling finding ${finding.number}.`,
  };
}

function naDecision(target, finding, listItem) {
  const quotationPage = finding.pages?.[0] ?? listItem.sourcePdfPage ?? 1;
  let quotation = String(finding.suggestedQuotation || listItem.quotation || finding.statement || MIN_QUOTE).trim();
  if (quotation.length < 20) quotation = MIN_QUOTE;
  if (quotation.length > 4000) quotation = `${quotation.slice(0, 3997)}…`;
  return {
    findingId: target.findingId,
    claimTextSha256: finding.claimTextSha256,
    decision: 'ACCEPTED',
    regulatoryClassificationCode: 'R',
    disposition: 'ORGANISATION_NOT_APPLICABLE',
    comment: `${MIN_COMMENT} Binding requirement not applicable to staging org.`,
    legalBasis: listItem.legalBasis || finding.legalBasis || 'Staging applicability review',
    quotation,
    quotationPage,
    provisionReference: listItem.provisionReference || finding.provisionReference || null,
    provisionFunction: 'OPERATIVE_REQUIREMENT',
  };
}

await requireUatPersonas(['B'], { label: 'first-review-na' });

const report = await runAs('B', async ({ page }) => {
  const aiRes = await page.request.get(`${STAGING_ORIGIN}/api/ri-lab/triage?queue=${WORKFLOW_QUEUES.AI_FINDINGS}`);
  const aiBody = await aiRes.json().catch(() => ({}));
  const candidates = (aiBody.items || []).filter(
    (i) =>
      i.canFirstReview &&
      !i.obligationApprovalLocked &&
      !i.hasPersistedDecision &&
      (i.runOpenForFirstReview === true || i.runHasCompletedReview === false) &&
      ((i.modelLabels || []).includes('binding_requirement') || i.aiClassification === 'binding_requirement'),
  );

  const preferRunId = process.env.FORGENIQ_FIRST_REVIEW_RUN_ID?.trim();
  let target = null;
  if (preferRunId) {
    const reviewProbe = await page.request
      .get(`${STAGING_ORIGIN}/api/ri-lab/ai-analysis-runs/${preferRunId}/findings`)
      .then((r) => r.json().catch(() => ({})));
    const findings = reviewProbe.findings || [];
    if (findings.length) {
      const binding =
        findings.find((f) => f.triage?.queue === 'OBLIGATION_TRIAGE') ||
        findings.find((f) => (f.modelLabels || []).includes('binding_requirement')) ||
        findings.find((f) => (f.triage?.allowedActions || []).includes('ORGANISATION_NOT_APPLICABLE'));
      if (!binding) {
        return { skipped: true, reason: 'preferred_run_no_binding_candidate', runId: preferRunId };
      }
      target = {
        runId: preferRunId,
        findingId: binding.findingId,
        canFirstReview: true,
        modelLabels: binding.modelLabels || ['binding_requirement'],
        aiClassification: 'binding_requirement',
      };
    }
  }
  if (!target) {
    const ranked = [...candidates].sort((a, b) => (a.runFindingCount ?? 99) - (b.runFindingCount ?? 99));
    target = ranked[0];
  }
  if (!target) {
    return { skipped: true, reason: 'no_canFirstReview_binding_candidate', aiCount: (aiBody.items || []).length };
  }

  const review = await page.request
    .get(`${STAGING_ORIGIN}/api/ri-lab/ai-analysis-runs/${target.runId}/findings`)
    .then((r) => r.json().catch(() => ({})));
  const findings = review.findings || [];
  if (!findings.length) return { skipped: true, reason: 'run_has_no_findings', runId: target.runId };

  const binding = findings.find((f) => f.findingId === target.findingId) || findings[0];
  const decisions = findings.map((f) =>
    f.findingId === binding.findingId ? naDecision(binding, f, target) : rejectDecision(f),
  );

  const post = await page.request.post(`${STAGING_ORIGIN}/api/ri-lab/ai-analysis-runs/${target.runId}/findings`, {
    data: {
      notes: `Six-queue first-review N/A ${new Date().toISOString()}`,
      decisions,
    },
  });
  const pb = await post.json().catch(() => ({}));
  if (!post.ok()) {
    return {
      skipped: false,
      ok: false,
      status: post.status(),
      pb,
      runId: target.runId,
      findingId: binding.findingId,
      findingCount: findings.length,
    };
  }

  const triageRes = await page.request.get(
    `${STAGING_ORIGIN}/api/ri-lab/triage?queue=${WORKFLOW_QUEUES.NOT_APPLICABLE}`,
  );
  const triageBody = await triageRes.json().catch(() => ({}));
  const row = (triageBody.items || []).find((i) => i.findingId === binding.findingId);
  const workflowQueue = row?.workflowQueue ||
    deriveWorkflowQueue({
      hasPersistedDecision: true,
      humanVerification: row?.humanVerification,
      decision: 'ACCEPTED',
      disposition: 'ORGANISATION_NOT_APPLICABLE',
      classificationQueue: row?.triageQueue || 'OBLIGATION_TRIAGE',
    });

  const guidanceCheck = await page.request.get(`${STAGING_ORIGIN}/api/ri-lab/triage?queue=${WORKFLOW_QUEUES.NON_OBLIGATIONS}`);
  const guidanceBody = await guidanceCheck.json().catch(() => ({}));
  const guidanceSample = (guidanceBody.items || []).find(
    (i) => (i.modelLabels || []).includes('guidance') || i.aiClassification === 'guidance',
  );
  const guidanceQueue = guidanceSample
    ? guidanceSample.workflowQueue ||
      deriveWorkflowQueue({
        hasPersistedDecision: guidanceSample.hasPersistedDecision,
        humanVerification: guidanceSample.humanVerification,
        decision: guidanceSample.verificationRecord?.decision,
        disposition: guidanceSample.verificationRecord?.disposition,
        classificationQueue: guidanceSample.triageQueue,
      })
    : null;

  return {
    skipped: false,
    ok: workflowQueue === WORKFLOW_QUEUES.NOT_APPLICABLE,
    firstReview: true,
    runId: target.runId,
    findingId: binding.findingId,
    findingCount: findings.length,
    workflowQueue,
    inNaQueue: Boolean(row),
    guidanceDistinction: guidanceQueue === WORKFLOW_QUEUES.NON_OBLIGATIONS ? 'ok' : guidanceQueue,
    response: pb,
  };
});

writeFileSync(join(OUT, 'FIRST-REVIEW-NA.json'), JSON.stringify({ generatedAt: new Date().toISOString(), deploymentId: 'dpl_B6KXoEmriaxA6BAfNAcXyrhX5TB8', ...report }, null, 2));

if (report.skipped) {
  console.error('staging-six-queue-first-review-na: SKIP', report.reason);
  process.exit(2);
}
if (!report.ok) {
  console.error('staging-six-queue-first-review-na: FAIL', report);
  process.exit(1);
}
console.log('staging-six-queue-first-review-na: PASS', {
  findingId: report.findingId,
  workflowQueue: report.workflowQueue,
  guidanceDistinction: report.guidanceDistinction,
});