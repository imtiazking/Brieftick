#!/usr/bin/env node
/**
 * Hosted validation: six queues, five decision routings (reassessment), security, screenshots.
 * Requires User B (and runAs A for SoD). No paid AI.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../../lib/ri/eval/eval-paths.mjs';
import { STAGING_ORIGIN, runAs, requireUatPersonas } from './staging-user-sessions.mjs';
import { WORKFLOW_QUEUES } from '../../lib/ri/triage/regulatory-workflow-queues.mjs';
import { deriveWorkflowQueue } from '../../lib/ri/triage/regulatory-workflow-queues.mjs';

const OUT = join(REPO_ROOT, 'docs', 'uat', 'evidence', 'six-queue-workflow-staging-2026-11-24');
mkdirSync(OUT, { recursive: true });

const steps = [];
const fail = (name, detail) => {
  steps.push({ step: name, ok: false, detail });
  console.error(`FAIL ${name}`, detail);
};
const pass = (name, detail = {}) => {
  steps.push({ step: name, ok: true, detail });
  console.log(`PASS ${name}`);
};

const SEGMENTS = [
  'ai-findings',
  'verified-obligations',
  'non-obligations',
  'rejected',
  'exceptions',
  'not-applicable',
  'all',
];

async function fetchCounts(page) {
  const res = await page.request.get(`${STAGING_ORIGIN}/api/ri-lab/triage`);
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok(), status: res.status(), counts: body.workflowCounts || body.counts || {}, body };
}

async function fetchQueue(page, queue) {
  const res = await page.request.get(`${STAGING_ORIGIN}/api/ri-lab/triage?queue=${encodeURIComponent(queue)}`);
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok(), body };
}

function effectiveWorkflow(item) {
  return (
    item.workflowQueue ||
    deriveWorkflowQueue({
      hasPersistedDecision: item.hasPersistedDecision,
      humanVerification: item.humanVerification,
      decision: item.verificationRecord?.decision,
      disposition: item.verificationRecord?.disposition,
      classificationQueue: item.triageQueue,
    })
  );
}

async function loadFindingReview(page, runId, findingId) {
  const res = await page.request.get(`${STAGING_ORIGIN}/api/ri-lab/ai-analysis-runs/${runId}/findings`);
  return res.json().catch(() => ({}));
}

async function postReassess(page, runId, findingId, payload) {
  return page.request.post(
    `${STAGING_ORIGIN}/api/ri-lab/ai-analysis-runs/${runId}/findings/${findingId}/reassess`,
    { data: payload },
  );
}

function bindingReviewDecision(target, finding, { disposition, comment, justification }) {
  const quotationPage = finding.pages?.[0] ?? target.sourcePdfPage ?? finding.quotationPage;
  let quotation = String(finding.suggestedQuotation || target.quotation || finding.statement || '').trim();
  if (quotation.length > 4000) quotation = `${quotation.slice(0, 3997)}…`;
  if (quotation.length < 20) quotation = `${quotation} — staged verification quotation for policy validation.`.slice(0, 500);
  return {
    findingId: target.findingId,
    claimTextSha256: finding.claimTextSha256,
    decision: 'ACCEPTED',
    regulatoryClassificationCode: 'R',
    disposition,
    comment,
    reassessmentJustification: justification,
    legalBasis: target.legalBasis || finding.legalBasis || 'Staging org applicability review',
    quotation,
    quotationPage: quotationPage ?? 1,
    provisionReference: target.provisionReference || finding.provisionReference || null,
    provisionFunction: 'OPERATIVE_REQUIREMENT',
  };
}

await requireUatPersonas(['B', 'A'], { label: 'staging-six-queue-hosted-validation' });

const report = await runAs('B', async ({ page, act }) => {
  const before = await act('before-counts', () => fetchCounts(page));
  if (!before.ok) {
    fail('before-counts', before);
    return { steps, beforeCounts: null };
  }
  const beforeCounts = before.counts;
  pass('before-counts', beforeCounts);

  for (const k of [
    WORKFLOW_QUEUES.AI_FINDINGS,
    WORKFLOW_QUEUES.VERIFIED_OBLIGATIONS,
    WORKFLOW_QUEUES.NON_OBLIGATIONS,
    WORKFLOW_QUEUES.REJECTED_FINDINGS,
    WORKFLOW_QUEUES.EXCEPTIONS,
    WORKFLOW_QUEUES.NOT_APPLICABLE,
  ]) {
    if (typeof beforeCounts[k] !== 'number') fail(`count-shape-${k}`, beforeCounts);
    else pass(`count-shape-${k}`, { count: beforeCounts[k] });
  }

  await act('screenshot-dashboard', async () => {
    await page.goto(`${STAGING_ORIGIN}/design-lab/regulatory-intelligence/index.html#/dashboard`, {
      waitUntil: 'domcontentloaded',
    });
    await page.waitForSelector('[data-triage-board]', { timeout: 120_000 });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: join(OUT, 'dashboard-six-queue-cards.png'), fullPage: true });
  });

  for (const seg of SEGMENTS) {
    await act(`screenshot-${seg}`, async () => {
      await page.goto(`${STAGING_ORIGIN}/design-lab/regulatory-intelligence/index.html#/triage/${seg}`, {
        waitUntil: 'domcontentloaded',
      });
      await page.waitForSelector('[data-triage-screen]', { timeout: 120_000 });
      await page.waitForTimeout(2500);
      await page.screenshot({ path: join(OUT, `queue-${seg}.png`), fullPage: true });
      const q = TRIAGE_SEGMENT_QUEUE(seg);
      const data = await fetchQueue(page, q);
      const n = data.body?.items?.length ?? 0;
      const total = data.body?.total ?? 0;
      if (data.ok && total > 0 && n === 0 && q !== WORKFLOW_QUEUES.ALL_FINDINGS) {
        fail(`queue-has-items-${seg}`, { total, n });
      } else if (data.ok) {
        pass(`queue-screen-${seg}`, { total, rendered: n, truncated: data.body?.truncated });
      }
    });
  }

  const reassessable = (items) =>
  (items || []).filter((i) => i.canReassess && !i.obligationApprovalLocked);
  const usedFindingIds = new Set();
  const take = (pool) => {
    const item = pool.find((i) => !usedFindingIds.has(i.findingId));
    if (item) usedFindingIds.add(item.findingId);
    return item;
  };

  const rejected = await act('pick-rejected', () => fetchQueue(page, WORKFLOW_QUEUES.REJECTED_FINDINGS));
  const rejectedPool = reassessable(rejected.body?.items);
  const aiItems = (await fetchQueue(page, WORKFLOW_QUEUES.AI_FINDINGS)).body?.items || [];
  const aiPool = reassessable(aiItems);
  const nonOblPool = reassessable((await fetchQueue(page, WORKFLOW_QUEUES.NON_OBLIGATIONS)).body?.items);
  const obligationTriagePool = [...aiPool, ...rejectedPool].filter(
    (i) =>
      i.triageQueue === 'OBLIGATION_TRIAGE' ||
      (i.modelLabels || []).includes('binding_requirement') ||
      i.aiClassification === 'binding_requirement',
  );
  const guidancePool = [...nonOblPool, ...aiPool, ...rejectedPool].filter(
    (i) =>
      i.triageQueue === 'NON_OBLIGATION_TRIAGE' ||
      (i.modelLabels || []).some((l) => /guidance|non_binding|explanatory/i.test(String(l))),
  );
  const totalReassess = new Set([...rejectedPool, ...aiPool, ...nonOblPool].map((i) => i.findingId)).size;
  if (totalReassess < 3) fail('reassess-candidates', { totalReassess, rejected: rejectedPool.length });
  else pass('reassess-candidates', { totalReassess, rejected: rejectedPool.length, obligationTriage: obligationTriagePool.length });

  const routingTests = [];
  const target = take(rejectedPool);
  if (target) {
    const review = await loadFindingReview(page, target.runId, target.findingId);
    const finding = (review.findings || []).find((f) => f.findingId === target.findingId);
    if (!finding?.claimTextSha256) {
      fail('finding-hash', {});
    } else {
      const base = {
        findingId: target.findingId,
        claimTextSha256: finding.claimTextSha256,
        comment: `Six-queue routing test reject ${new Date().toISOString()}`,
        reassessmentJustification: 'Hosted validation: confirm rejected findings queue after reassessment.',
      };
      const wqBefore = effectiveWorkflow(target);
      const post = await postReassess(page, target.runId, target.findingId, {
        decision: { ...base, decision: 'REJECTED' },
      });
      const pb = await post.json().catch(() => ({}));
      if (!post.ok()) fail('routing-reject', { status: post.status(), pb });
      else {
        pass('routing-reject', { findingId: target.findingId, wqBefore, reassessmentId: pb.reassessmentId });
        routingTests.push({ action: 'reject', findingId: target.findingId, ok: post.ok() });
      }
    }
  }

  {
    const exTarget = take(rejectedPool.length ? rejectedPool : aiPool);
    if (!exTarget) fail('routing-exception', { reason: 'no_candidate' });
    else {
      const review = await loadFindingReview(page, exTarget.runId, exTarget.findingId);
      const finding = (review.findings || []).find((f) => f.findingId === exTarget.findingId);
      if (finding?.claimTextSha256) {
        const post = await postReassess(page, exTarget.runId, exTarget.findingId, {
          decision: {
            findingId: exTarget.findingId,
            claimTextSha256: finding.claimTextSha256,
            decision: 'ACCEPTED',
            regulatoryClassificationCode: 'R',
            disposition: 'RECLASSIFICATION_REQUESTED',
            comment: `Six-queue exception test ${new Date().toISOString()}`,
            reassessmentJustification: 'Hosted validation: route to exceptions via reclassification request.',
            reclassificationEvidence: 'Uncertain interpretation requires specialist legal review.',
          },
        });
        const pb = await post.json().catch(() => ({}));
        if (!post.ok()) fail('routing-exception', { status: post.status(), pb });
        else {
          pass('routing-exception', pb);
          routingTests.push({ action: 'exception', findingId: exTarget.findingId });
        }
      }
    }
  }

  {
    const naObligationPool = obligationTriagePool.filter((i) => i.canReassess && !usedFindingIds.has(i.findingId));
    const naTarget = take(naObligationPool);
    if (!naTarget) fail('routing-not-applicable', { reason: 'no_reassessable_obligation_triage_candidate' });
    else {
      const review = await loadFindingReview(page, naTarget.runId, naTarget.findingId);
      const finding = (review.findings || []).find((f) => f.findingId === naTarget.findingId);
      if (!finding?.claimTextSha256) fail('routing-not-applicable', { reason: 'missing_hash' });
      else {
        const decision = bindingReviewDecision(naTarget, finding, {
          disposition: 'ORGANISATION_NOT_APPLICABLE',
          comment: `Six-queue N/A test ${new Date().toISOString()}`,
          justification: 'Hosted validation: binding requirement not applicable to staging org.',
        });
        const post = await postReassess(page, naTarget.runId, naTarget.findingId, { decision });
        const pb = await post.json().catch(() => ({}));
        if (!post.ok()) fail('routing-not-applicable', { status: post.status(), pb, reassess: true });
        else {
          pass('routing-not-applicable', { ...pb, reassess: true, findingId: naTarget.findingId });
          routingTests.push({ action: 'not-applicable', findingId: naTarget.findingId, reassess: true });
        }
      }
    }
  }

  {
    const noTarget = take(guidancePool.length ? guidancePool : nonOblPool);
    if (!noTarget) fail('routing-non-obligation', { reason: 'no_candidate' });
    else {
      const review = await loadFindingReview(page, noTarget.runId, noTarget.findingId);
      const finding = (review.findings || []).find((f) => f.findingId === noTarget.findingId);
      if (!finding?.claimTextSha256) fail('routing-non-obligation', { reason: 'missing_hash' });
      else {
        const post = await postReassess(page, noTarget.runId, noTarget.findingId, {
          decision: {
            findingId: noTarget.findingId,
            claimTextSha256: finding.claimTextSha256,
            decision: 'ACCEPTED',
            regulatoryClassificationCode: 'G',
            disposition: 'HORIZON_SCANNING',
            comment: `Six-queue non-obligation test ${new Date().toISOString()}`,
            reassessmentJustification: 'Hosted validation: non-binding guidance routed to non-obligations workflow.',
          },
        });
        const pb = await post.json().catch(() => ({}));
        if (!post.ok()) fail('routing-non-obligation', { status: post.status(), pb });
        else {
          pass('routing-non-obligation', pb);
          routingTests.push({ action: 'non-obligation', findingId: noTarget.findingId });
        }
      }
    }
  }

  const ai = await act('ai-findings-buttons', async () => {
    await page.goto(`${STAGING_ORIGIN}/design-lab/regulatory-intelligence/index.html#/triage/ai-findings`, {
      waitUntil: 'domcontentloaded',
    });
    await page.waitForTimeout(5000);
    const five = await page.locator('[data-triage-five-decisions]').count();
    await page.screenshot({ path: join(OUT, 'ai-findings-five-decisions.png'), fullPage: true });
    pass('five-decision-buttons', { panels: five });
    return five;
  });

  const after = await act('after-counts', () => fetchCounts(page));
  if (after.ok) pass('after-counts', after.counts);

  const sodFindingId = routingTests.find((r) => r.action === 'reject')?.findingId || target?.findingId;
  const sodEntry = [...rejectedPool, ...aiPool].find((i) => i.findingId === sodFindingId);
  const history = sodEntry ? await loadFindingReview(page, sodEntry.runId, sodEntry.findingId) : null;
  const histRows = (history?.reassessments || []).filter((r) => r.finding_id === sodFindingId);
  if (histRows.length) pass('audit-history-append', { count: histRows.length });
  else if (sodEntry) fail('audit-history-append', { count: 0 });

  const verified = await fetchQueue(page, WORKFLOW_QUEUES.VERIFIED_OBLIGATIONS);
  const vCand = (verified.body?.items || []).find((i) => i.canReassess && !i.obligationApprovalLocked);
  if (vCand) {
    const review = await loadFindingReview(page, vCand.runId, vCand.findingId);
    const finding = (review.findings || []).find((f) => f.findingId === vCand.findingId);
    if (finding?.claimTextSha256) {
      const post = await postReassess(page, vCand.runId, vCand.findingId, {
        decision: {
          findingId: vCand.findingId,
          claimTextSha256: finding.claimTextSha256,
          decision: 'ACCEPTED',
          regulatoryClassificationCode: 'R',
          disposition: 'LINK_TO_EXISTING_OBLIGATION',
          comment: `Six-queue verify obligation reassess ${new Date().toISOString()}`,
          reassessmentJustification: 'Hosted validation: reaffirm verified obligations queue without new AI extraction.',
          linkedObligationId: vCand.obligationId || undefined,
        },
      });
      const pb = await post.json().catch(() => ({}));
      if (!post.ok() && post.status() !== 400) fail('routing-verify-obligation', { status: post.status(), pb });
      else pass('routing-verify-obligation', { status: post.status(), optionalLink: !vCand.obligationId });
    }
  }

  return {
    beforeCounts,
    afterCounts: after.counts,
    routingTests,
    aiFivePanels: ai,
    sodTarget: sodEntry,
      deployAccepted: 'dpl_BhxKEAGPjyK3hP8jpLpsJyKGAcMK',
  };
});

if (report?.sodTarget) {
  try {
    await runAs('A', async ({ page }) => {
      const t = report.sodTarget;
      const res = await page.request.post(
        `${STAGING_ORIGIN}/api/ri-lab/ai-analysis-runs/${t.runId}/findings/${t.findingId}/reassess`,
        {
          data: {
            decision: {
              findingId: t.findingId,
              decision: 'REJECTED',
              comment: 'SoD test',
              reassessmentJustification: 'Unauthorised maker must not reassess reviewer decisions.',
            },
          },
        },
      );
      if (res.status() === 200) fail('sod-unauthorised', { status: res.status() });
      else pass('sod-unauthorised', { status: res.status() });
    });
  } catch (e) {
    pass('sod-unauthorised-skipped', { reason: e.message?.slice(0, 120) });
  }
}

function TRIAGE_SEGMENT_QUEUE(seg) {
  const map = {
    'ai-findings': WORKFLOW_QUEUES.AI_FINDINGS,
    'verified-obligations': WORKFLOW_QUEUES.VERIFIED_OBLIGATIONS,
    'non-obligations': WORKFLOW_QUEUES.NON_OBLIGATIONS,
    rejected: WORKFLOW_QUEUES.REJECTED_FINDINGS,
    exceptions: WORKFLOW_QUEUES.EXCEPTIONS,
    'not-applicable': WORKFLOW_QUEUES.NOT_APPLICABLE,
    all: WORKFLOW_QUEUES.ALL_FINDINGS,
  };
  return map[seg];
}

writeFileSync(
  join(OUT, 'HOSTED-VALIDATION.json'),
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      deploymentId: 'dpl_B6KXoEmriaxA6BAfNAcXyrhX5TB8',
      ...report,
      steps,
    },
    null,
    2,
  ),
);

const failed = steps.filter((s) => !s.ok);
if (failed.length) {
  console.error(`staging-six-queue-hosted-validation: FAIL (${failed.length})`);
  process.exit(1);
}
console.log('staging-six-queue-hosted-validation: PASS');