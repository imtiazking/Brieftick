#!/usr/bin/env node
/**
 * Evidence-backed audit of obligation-triage human verification and approval records (staging).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../../lib/ri/eval/eval-paths.mjs';
import { classifyFindingDecisionProvenance } from '../../lib/ri/triage/finding-decision-provenance.mjs';
import { PERSONAS, STAGING_ORIGIN, runAs } from '../uat/staging-user-sessions.mjs';

const OUT_DIR = join(REPO_ROOT, 'docs', 'uat', 'evidence', 'obligation-triage-decision-audit-2026-11-24');
const REPORT = join(REPO_ROOT, 'docs', 'uat', 'OBLIGATION-TRIAGE-DECISION-PROVENANCE-2026-11-24.md');
mkdirSync(OUT_DIR, { recursive: true });

const ROLE_BY_USER = Object.fromEntries(
  Object.values(PERSONAS).filter((p) => p.userId).map((p) => [p.userId, p.expectedRole || p.label]),
);

function bucket(items, keyFn) {
  const m = {};
  for (const item of items) {
    const k = keyFn(item);
    m[k] = (m[k] || 0) + 1;
  }
  return m;
}

const audit = await runAs('B', async ({ page }) => {
  const triageAll = await page.request.get(`${STAGING_ORIGIN}/api/ri-lab/triage`);
  const triageObl = await page.request.get(`${STAGING_ORIGIN}/api/ri-lab/triage?queue=OBLIGATION_TRIAGE`);
  const allBody = await triageAll.json().catch(() => ({}));
  const oblBody = await triageObl.json().catch(() => ({}));
  const apiMeta = {
    triageAllStatus: triageAll.status(),
    triageOblStatus: triageObl.status(),
    triageOblError: oblBody.error || oblBody.code || null,
  };
  const items = oblBody.items || [];

  const decisions = [];
  for (const item of items) {
    const prov = item.decisionProvenance || classifyFindingDecisionProvenance(item.verificationRecord || {}, { stagingTenant: true });
    decisions.push({
      provisionReference: item.provisionReference,
      publicationId: item.publicationId,
      publicationTitle: item.publicationTitle,
      aiClassification: item.aiClassification,
      humanVerification: item.humanVerification,
      approvalStatus: item.approvalStatus,
      decisionType: item.verificationRecord?.decision,
      reviewerUserId: item.verificationRecord?.reviewerUserId,
      reviewerRole: item.verificationRecord?.reviewerRole || ROLE_BY_USER[item.verificationRecord?.reviewerUserId],
      decisionTimestamp: item.verificationRecord?.verifiedAt,
      justification: item.verificationRecord?.reviewerJustification,
      analysisReviewId: item.verificationRecord?.analysisReviewId,
      evidencePathway: item.verificationRecord?.evidencePathway,
      quotationVerificationId: item.verificationRecord?.quotationVerificationId,
      obligationId: item.obligationId,
      runId: item.runId,
      findingId: item.findingId,
      provenanceClass: prov.provenanceClass || item.decisionProvenance?.provenanceClass,
      provenanceLabel: prov.label || item.decisionProvenance?.label,
      countsAsGenuineHumanVerification: Boolean(item.countsAsGenuineHumanVerification),
      countsAsUatOrTest: Boolean(item.countsAsUatOrTest),
      adequateRegulatoryEvidence:
        item.verificationRecord?.evidencePathway === 'production_grounded' &&
        Boolean(item.verificationRecord?.quotationVerificationId) &&
        Boolean(item.verificationRecord?.legalBasis) &&
        Boolean(item.verificationRecord?.provisionReference),
    });
  }

  const verified = decisions.filter((d) => d.humanVerification === 'VERIFIED');
  const rejected = decisions.filter((d) => d.humanVerification === 'REJECTED');
  const needsReview = decisions.filter((d) => d.humanVerification === 'NEEDS_REVIEW' || d.humanVerification === 'RE_VERIFICATION_REQUIRED');
  const approved = decisions.filter((d) => d.approvalStatus === 'APPROVED');

  let screenshots = { manualActions: false, verificationDialog: false };
  await page.goto(`${STAGING_ORIGIN}/design-lab/regulatory-intelligence/index.html#/triage/obligations`, {
    waitUntil: 'domcontentloaded',
  });
  await page
    .waitForSelector('[data-triage-review-mode="reject"], [data-triage-manual-actions]', { timeout: 120_000 })
    .catch(() => null);
  if (await page.locator('[data-triage-review-mode="reject"]').count()) {
    await page.screenshot({ path: join(OUT_DIR, 'manual-verify-reject-needs-review-actions.png'), fullPage: true });
    screenshots.manualActions = true;
  }
  const viewBtn = page.locator('[data-triage-view-verification]').first();
  if (await viewBtn.count()) {
    await viewBtn.click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: join(OUT_DIR, 'verification-evidence-dialog.png'), fullPage: true });
    screenshots.verificationDialog = true;
  }

  return {
    apiMeta,
    screenshots,
    triageCounts: allBody.counts,
    obligationQueueCount: allBody.counts?.OBLIGATION_TRIAGE,
    verificationCounts: oblBody.verificationCounts,
    approvalCounts: oblBody.approvalCounts,
    triageReconcile: oblBody.triageReconcile,
    itemCount: items.length,
    decisions,
    summary: {
      verified: verified.length,
      rejected: rejected.length,
      needsReview: needsReview.length,
      approvedObligations: approved.length,
      genuineVerified: verified.filter((d) => d.countsAsGenuineHumanVerification).length,
      uatOrTest: decisions.filter((d) => d.countsAsUatOrTest).length,
      provenanceBuckets: bucket(decisions, (d) => d.provenanceClass || 'UNREVIEWED'),
    },
    verified,
    rejected,
    needsReview,
    approved,
  };
});

writeFileSync(join(OUT_DIR, 'AUDIT.json'), JSON.stringify({ generatedAt: new Date().toISOString(), ...audit }, null, 2));

const md = `# Obligation Triage decision provenance audit (staging)

Generated: ${new Date().toISOString()}

## Count reconciliation

| Source | Obligation triage count |
|---|---|
| Dashboard \`counts.OBLIGATION_TRIAGE\` | ${audit.triageCounts?.OBLIGATION_TRIAGE ?? '—'} |
| Obligation queue API items | ${audit.itemCount} |
| Verification filter ALL | ${audit.verificationCounts?.ALL ?? '—'} |

${audit.triageReconcile?.note || ''}

## Summary

| Metric | Count |
|---|---|
| VERIFIED (workflow) | ${audit.summary.verified} |
| Genuine regulatory VERIFIED | ${audit.summary.genuineVerified} |
| UAT / test decision rows | ${audit.summary.uatOrTest} |
| REJECTED | ${audit.summary.rejected} |
| NEEDS REVIEW | ${audit.summary.needsReview} |
| APPROVED obligations (in queue) | ${audit.summary.approvedObligations} |

### Provenance buckets

${Object.entries(audit.summary.provenanceBuckets)
  .map(([k, v]) => `- **${k}**: ${v}`)
  .join('\n')}

## VERIFIED findings (${audit.verified.length})

${audit.verified.map((d, i) => `### ${i + 1}. ${d.provisionReference || '—'}
- Publication: ${d.publicationTitle || d.publicationId}
- AI classification: ${d.aiClassification || '—'}
- Provenance: **${d.provenanceClass}** — ${d.provenanceLabel}
- Reviewer: ${d.reviewerUserId} (${d.reviewerRole || 'role unknown'})
- Timestamp: ${d.decisionTimestamp}
- Audit ref: ${d.analysisReviewId}
- Pathway: ${d.evidencePathway}
- Adequate regulatory evidence fields: ${d.adequateRegulatoryEvidence ? 'yes' : 'no'}
- Genuine human verification count: ${d.countsAsGenuineHumanVerification ? 'yes' : 'no'}
- Obligation: ${d.obligationId || 'none'}
`).join('\n')}

## REJECTED findings (${audit.rejected.length})

${audit.rejected.slice(0, 5).map((d, i) => `### ${i + 1}. ${d.provisionReference || '—'} — ${d.provenanceClass} — reviewer ${d.reviewerUserId}`).join('\n')}
${audit.rejected.length > 5 ? `\n… plus ${audit.rejected.length - 5} more (see AUDIT.json).\n` : ''}

## NEEDS REVIEW (${audit.needsReview.length})

${audit.needsReview.map((d, i) => `${i + 1}. ${d.provisionReference || '—'} — ${d.humanVerification} — ${d.provenanceClass || '—'}`).join('\n')}

## APPROVED obligations in triage (${audit.approved.length})

${audit.approved.map((d, i) => `${i + 1}. ${d.provisionReference} → obligation ${d.obligationId} (${d.approvalStatus}) — staging maker-checker, not legal sign-off`).join('\n')}

## Conclusion

All persisted decisions on the authorised staging tenant \`b8f5e3a1-00ad-4000-8000-000000000001\` are **staging/UAT workflow evidence**. **${audit.summary.genuineVerified}** rows qualify as production regulatory human verification under current rules. PS22/9 legally verified count remains **0** unless separately evidenced.

Evidence: \`docs/uat/evidence/obligation-triage-decision-audit-2026-11-24/\`
`;

writeFileSync(REPORT, md);
console.log(JSON.stringify({ ok: true, report: REPORT, out: OUT_DIR, summary: audit.summary }, null, 2));