#!/usr/bin/env node
/**
 * Reconcile ALL_FINDINGS vs six workflow queue counts using live staging IDs (read-only).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../../lib/ri/eval/eval-paths.mjs';
import { STAGING_ORIGIN, runAs, requireUatPersonas } from './staging-user-sessions.mjs';
import { WORKFLOW_QUEUES, deriveWorkflowQueue } from '../../lib/ri/triage/regulatory-workflow-queues.mjs';

const OUT = join(REPO_ROOT, 'docs', 'uat', 'evidence', 'six-queue-workflow-staging-2026-11-24');
mkdirSync(OUT, { recursive: true });

await requireUatPersonas(['C'], { label: 'queue-reconcile' });

const result = await runAs('C', async ({ page }) => {
  const wcRes = await page.request.get(`${STAGING_ORIGIN}/api/ri-lab/triage`);
  const wcBody = await wcRes.json().catch(() => ({}));
  if (!wcRes.ok()) throw new Error(wcBody.error || 'triage_counts_failed');
  const wc = wcBody.workflowCounts || wcBody.counts || {};

  const allIds = new Set();
  let items = [];
  let pageNum = 1;
  let lastBody = null;
  for (;;) {
    const res = await page.request.get(
      `${STAGING_ORIGIN}/api/ri-lab/triage?queue=${WORKFLOW_QUEUES.ALL_FINDINGS}&page=${pageNum}&pageSize=100`,
    );
    const body = await res.json().catch(() => ({}));
    if (!res.ok()) throw new Error(body.error || 'triage_all_failed');
    lastBody = body;
  for (const item of body.items || []) {
    allIds.add(item.findingId);
    items.push(item);
  }
    if (!body.pagination?.hasNextPage) break;
    pageNum = body.pagination.page + 1;
  }
  const body = lastBody || {};
  const keys = [
    WORKFLOW_QUEUES.AI_FINDINGS,
    WORKFLOW_QUEUES.VERIFIED_OBLIGATIONS,
    WORKFLOW_QUEUES.NON_OBLIGATIONS,
    WORKFLOW_QUEUES.REJECTED_FINDINGS,
    WORKFLOW_QUEUES.EXCEPTIONS,
    WORKFLOW_QUEUES.NOT_APPLICABLE,
  ];
  const sumSix = keys.reduce((s, k) => s + (wc[k] || 0), 0);
  const all = wc[WORKFLOW_QUEUES.ALL_FINDINGS] ?? body.total ?? 0;
  const mismatches = [];
  const byQueue = Object.fromEntries(keys.map((k) => [k, []]));
  for (const item of items) {
    const q = item.workflowQueue || deriveWorkflowQueue({
      hasPersistedDecision: item.hasPersistedDecision,
      humanVerification: item.humanVerification,
      decision: item.verificationRecord?.decision,
      disposition: item.verificationRecord?.disposition,
      classificationQueue: item.triageQueue,
    });
    if (byQueue[q]) byQueue[q].push(item.findingId);
    else mismatches.push({ findingId: item.findingId, workflowQueue: q });
  }
  return {
    workflowCounts: wc,
    sumSix,
    allReported: all,
    totalInResponse: body.total,
    itemsReturned: allIds.size,
    paginatedUniqueIds: allIds.size,
    truncated: body.truncated === true,
    paginationEnabled: Boolean(body.pagination),
    sumEqualsAll: sumSix === all,
    overlapExplanation:
      sumSix === all
        ? 'Each finding has exactly one workflowQueue; ALL_FINDINGS total equals sum of six queues (mutually exclusive partition).'
        : `Sum of six queues (${sumSix}) differs from ALL (${all}) — inspect workflowCounts and unassigned workflowQueue values.`,
    sampleFindingIds: Object.fromEntries(keys.map((k) => [k, (byQueue[k] || []).slice(0, 5)])),
    unassignedSample: mismatches.slice(0, 10),
    uiNote:
      allIds.size < (body.total || 0)
        ? `Paginated fetch returned ${allIds.size} of ${body.total} total — investigate pagination integrity.`
        : `All ${allIds.size} findings retrieved via paginated API (pageSize 100).`,
  };
});

writeFileSync(join(OUT, 'QUEUE-COUNT-RECONCILE.json'), JSON.stringify({ generatedAt: new Date().toISOString(), ...result }, null, 2));
console.log(JSON.stringify(result, null, 2));
if (!result.sumEqualsAll || result.itemsReturned !== result.allReported) process.exit(1);
console.log('staging-six-queue-count-reconcile: PASS');