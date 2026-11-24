#!/usr/bin/env node
/**
 * Staging smoke: presentation counts, reassessment (no paid AI), SoD and history.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../../lib/ri/eval/eval-paths.mjs';
import { STAGING_ORIGIN, runAs } from './staging-user-sessions.mjs';

const OUT = join(REPO_ROOT, 'docs', 'uat', 'evidence', 'finding-reassessment-staging-smoke-2026-11-24');
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

const result = await runAs('B', async ({ page }) => {
  const triageRes = await page.request.get(`${STAGING_ORIGIN}/api/ri-lab/triage?queue=OBLIGATION_TRIAGE`);
  const triage = await triageRes.json().catch(() => ({}));
  if (!triageRes.ok()) {
    fail('triage-api', { status: triageRes.status(), error: triage.error });
    return { steps, triage };
  }
  const pc = triage.presentationCounts || {};
  if (typeof pc.AWAITING_FIRST_REVIEW !== 'number' || typeof pc.UAT_VERIFIED !== 'number') {
    fail('presentation-counts-shape', pc);
  } else {
    pass('presentation-counts-shape', pc);
  }
  if ((pc.REGULATORY_VERIFIED ?? 0) !== 0) {
    fail('regulatory-verified-still-zero', pc);
  } else {
    pass('regulatory-verified-still-zero', { REGULATORY_VERIFIED: pc.REGULATORY_VERIFIED });
  }

  const items = triage.items || [];
  const target =
    items.find((i) => i.canReassess && !i.obligationApprovalLocked && i.humanVerification === 'REJECTED') ||
    items.find((i) => i.canReassess && !i.obligationApprovalLocked);
  if (!target?.runId || !target?.findingId) {
    fail('reassess-candidate', { count: items.length });
    return { steps, triage };
  }
  pass('reassess-candidate', {
    provisionReference: target.provisionReference,
    runId: target.runId,
    findingId: target.findingId,
  });

  const reviewRes = await page.request.get(`${STAGING_ORIGIN}/api/ri-lab/ai-analysis-runs/${target.runId}/findings`);
  const review = await reviewRes.json().catch(() => ({}));
  const finding = (review.findings || []).find((f) => f.findingId === target.findingId);

  const payload = {
    decision: {
      findingId: target.findingId,
      claimIndex: finding?.claimIndex ?? 1,
      decision: 'REJECTED',
      comment: `Staging reassessment smoke ${new Date().toISOString()}`,
      reassessmentJustification:
        'Controlled reassessment smoke: authorised reviewer reconfirms rejection without new AI extraction.',
      disposition: 'NOT_OBLIGATION',
      triageQueue: 'OBLIGATION_TRIAGE',
    },
  };

  const postRes = await page.request.post(
    `${STAGING_ORIGIN}/api/ri-lab/ai-analysis-runs/${target.runId}/findings/${target.findingId}/reassess`,
    { data: payload },
  );
  const postBody = await postRes.json().catch(() => ({}));
  if (!postRes.ok()) {
    fail('reassess-post-reviewer', { status: postRes.status(), body: postBody });
  } else {
    pass('reassess-post-reviewer', postBody);
  }

  const reviewAfter = await page.request.get(`${STAGING_ORIGIN}/api/ri-lab/ai-analysis-runs/${target.runId}/findings`);
  const reviewAfterBody = await reviewAfter.json().catch(() => ({}));
  const findingAfter = (reviewAfterBody.findings || []).find((f) => f.findingId === target.findingId);
  const reassessCount = (findingAfter?.reassessments || []).length;
  if (reassessCount < 1) {
    fail('reassessment-history', { reassessCount });
  } else {
    pass('reassessment-history', { reassessCount, latest: findingAfter.reassessments[reassessCount - 1]?.decision });
  }

  return { steps, presentationCounts: pc, target: { runId: target.runId, findingId: target.findingId }, payload };
});

if (result.target?.runId) {
  await runAs('A', async ({ page: pageA }) => {
    const denied = await pageA.request.post(
      `${STAGING_ORIGIN}/api/ri-lab/ai-analysis-runs/${result.target.runId}/findings/${result.target.findingId}/reassess`,
      { data: result.payload },
    );
    const deniedBody = await denied.json().catch(() => ({}));
    if (denied.status() === 200) {
      fail('sod-unauthorised-reassess', deniedBody);
    } else {
      pass('sod-unauthorised-reassess', { status: denied.status(), code: deniedBody.error || deniedBody.code });
    }
  });
}

writeFileSync(join(OUT, 'SMOKE.json'), JSON.stringify({ generatedAt: new Date().toISOString(), ...result }, null, 2));
const failed = (result.steps || []).filter((s) => !s.ok);
if (failed.length) {
  console.error(`staging-finding-reassessment-smoke: FAIL (${failed.length})`);
  process.exit(1);
}
console.log('staging-finding-reassessment-smoke: PASS');