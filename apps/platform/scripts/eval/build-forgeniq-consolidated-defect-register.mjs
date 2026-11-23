#!/usr/bin/env node
/** Consolidated defect register from evidence + known remediation state (idempotent). */
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../../lib/ri/eval/eval-paths.mjs';
import { spawnSync } from 'node:child_process';

const OUT = join(REPO_ROOT, 'docs/eval/FORGENIQ-CONSOLIDATED-DEFECT-REGISTER-2026-11-23.json');
const EVAL = join(REPO_ROOT, 'docs/eval');

function readJson(p) {
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

const defects = [];

function add(d) {
  defects.push({ id: `DEF-${String(defects.length + 1).padStart(4, '0')}`, ...d });
}

const spend = readJson(join(EVAL, 'PILOT-SPEND-RECONCILE-2026-11-23.json'));
const sec = readJson(join(EVAL, 'SEC-DB-003-STAGING-ACCESS-2026-11-23.json'));
const ps26tax = readJson(join(EVAL, 'FCA-PS26-OUTSTANDING-TAXONOMY-2026-11-23.json'));
const ceiling = readJson(join(EVAL, 'PS22-9-CEILING-APPROVAL-REQUEST-2026-11-23.json'));
const batch0disc = readJson(join(EVAL, 'PS22-9-BATCH0-CLASSIFICATION-DISCREPANCY-2026-11-23.json'));

add({
  title: 'Continuation v2 spend runs absent from orchestration ledger',
  category: 1,
  status: 'FIXED AND TESTED',
  rootCause: 'Pilot reconcile only enumerated KNOWN + orchestration batches',
  resolution: 'continuationEvidenceRunIds() from PS22-9-CONTINUATION-V2-BATCH*.json',
  commit: 'ae4bd1e',
});

add({
  title: 'Parenthetical provision references fail parse (2.1.1R)',
  category: 2,
  status: 'FIXED AND TESTED',
  rootCause: 'parseProvisionReference did not strip trailing (Principle N) labels',
  resolution: 'provision-eligibility.mjs + regulatoryClassificationCode on guard',
  commit: '4e5b688',
});

add({
  title: 'Batch accuracy conflated bindingNature with operative R marker under consultation',
  category: 6,
  status: 'FIXED AND TESTED',
  rootCause: 'Heuristic treated consultation_proposal as classification defect',
  resolution: 'ps22-continuation-batch-accuracy-report.mjs dual-axis metrics',
  commit: '4e5b688',
});

add({
  title: 'Quotation accuracy checked presence only, not PDF verbatim',
  category: 2,
  status: 'FIXED AND TESTED',
  rootCause: 'textContent empty; no segment match',
  resolution: 'quotationVerbatim + page window in accuracy report',
  commit: '5f7f54e',
});

add({
  title: 'Nested runAs during batch caused post-batch spend reconcile 401',
  category: 3,
  status: 'FIXED AND TESTED',
  rootCause: 'activePersona mutex in staging-user-sessions',
  resolution: 'Reconcile after session closes in continuation batch script',
  commit: '5f7f54e',
});

add({
  title: 'SEC-DB-002 fixture seed missing created_by_user_id',
  category: 1,
  status: 'FIXED AND TESTED',
  rootCause: 'Finding review fixtures predated manual creator guard',
  resolution: 'finding-review-fixtures.mjs attribution',
  commit: 'a616b5b',
});

add({
  title: 'SEC-DB-003 hosted restricted-role proof',
  category: 7,
  status: 'BLOCKED — EXTERNAL DEPENDENCY',
  rootCause: 'STAGING_DATABASE_URL not in operator environment',
  resolution: 'Local 5/5 + staging API 6/6; harness ready',
  evidence: 'SEC-DB-003-STAGING-ACCESS-2026-11-23.json',
});

add({
  title: 'PS22 continuation exceeds $2.35 if all 12 batches executed',
  category: 7,
  status: 'BLOCKED — SPENDING AUTHORISATION',
  rootCause: 'Empirical ~$0.103/batch × 12 + $1.488 > $2.35',
  resolution: 'PS22-9-CEILING-APPROVAL-REQUEST; batches 2–8 fit under current ceiling',
  evidence: ceiling?.evidence,
});

if (ps26tax?.summary) {
  add({
    title: 'PS26 operative requirements without live structured AI recall',
    category: 2,
    status: 'READY FOR HOSTED VALIDATION',
    rootCause: 'Historical runs: truncation, omissions, cross-page; deterministic recall separate',
    resolution: 'Independent PDF verify 28R; pipeline trace + historical acceptance; no paid in this tranche',
    metrics: ps26tax.summary,
  });
}

const failedRuns = (spend?.lineItems || []).filter((x) => x.status === 'FAILED');
add({
  title: 'Historical paid extraction failures (schema/truncation)',
  category: 1,
  status: 'FIXED AND TESTED',
  rootCause: '8192 output token ceiling + batch >16 provisions',
  resolution: 'RI_LAB_MAX_PROVISIONS_PER_BATCH=16 + output preflight',
  preservedEvidence: failedRuns.map((x) => x.runId),
  note: 'Failed runs retained in spend line items for audit',
});

if (batch0disc?.summary?.resolved) {
  add({
    title: 'PS22 batch-0 four classification discrepancies',
    category: 2,
    status: 'TESTED AND PASSED',
    rootCause: 'Consultation presentation vs operative marker confusion',
    resolution: batch0disc.summary,
    evidence: 'PS22-9-BATCH0-CLASSIFICATION-DISCREPANCY-2026-11-23.json',
  });
}

add({
  title: 'PS22/9 publication legal instrument status',
  category: 2,
  status: 'TESTED AND PASSED',
  rootCause: 'N/A — policy applied',
  resolution: 'Consultation CP22/9: R markers are proposed rules; bindingNature must not be binding_requirement until final PS',
  evidence: 'PS22-9-PUBLICATION-LEGAL-STATUS-ASSESSMENT-2026-11-23.json',
});

const hostedUat = [
  'acceptance-ri-uc-ri-005-finding-review-browser',
  'acceptance-ri-applicability-workflow-browser',
  'acceptance-ri-uc-ri-005-extraction-button-browser',
];
for (const mod of hostedUat) {
  add({
    title: `Hosted browser UAT: ${mod}`,
    category: 5,
    status: 'READY FOR HOSTED VALIDATION',
    rootCause: 'Requires staging session + consolidated deploy',
    resolution: 'Execute post-deploy on staging-app.forgeniq.com',
  });
}

const suite = spawnSync('node', ['scripts/eval/run-consolidated-remediation-gates.mjs'], {
  cwd: join(REPO_ROOT, 'apps/platform'),
  encoding: 'utf8',
});
const gateReport = suite.status === 0 ? JSON.parse(suite.stdout.trim().split('\n').pop()) : { error: suite.stderr };

const summary = {
  total: defects.length,
  byStatus: defects.reduce((a, d) => ((a[d.status] = (a[d.status] || 0) + 1), a), {}),
  byCategory: defects.reduce((a, d) => ((a[d.category] = (a[d.category] || 0) + 1), a), {}),
  gateReport,
};

const payload = {
  generatedAt: new Date().toISOString(),
  programme: 'FORGENIQ consolidated remediation',
  spendCumulativeUsd: spend?.cumulativePilotSpendUsd,
  provisionsAssessedPs22: 97,
  summary,
  defects,
};
writeFileSync(OUT, JSON.stringify(payload, null, 2));
console.log(JSON.stringify({ out: OUT, summary: { total: summary.total, gateOk: suite.status === 0 } }, null, 2));
process.exit(suite.status === 0 ? 0 : 1);