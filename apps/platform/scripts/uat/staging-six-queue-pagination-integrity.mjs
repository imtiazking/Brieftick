#!/usr/bin/env node
/**
 * Hosted: paginate ALL_FINDINGS until every finding id is seen exactly once (208 on staging).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../../lib/ri/eval/eval-paths.mjs';
import { STAGING_ORIGIN, runAs, requireUatPersonas } from './staging-user-sessions.mjs';
import { WORKFLOW_QUEUES } from '../../lib/ri/triage/regulatory-workflow-queues.mjs';

const OUT = join(REPO_ROOT, 'docs', 'uat', 'evidence', 'six-queue-workflow-staging-2026-11-24');
mkdirSync(OUT, { recursive: true });

const QUEUES = [
  WORKFLOW_QUEUES.AI_FINDINGS,
  WORKFLOW_QUEUES.VERIFIED_OBLIGATIONS,
  WORKFLOW_QUEUES.NON_OBLIGATIONS,
  WORKFLOW_QUEUES.REJECTED_FINDINGS,
  WORKFLOW_QUEUES.EXCEPTIONS,
  WORKFLOW_QUEUES.NOT_APPLICABLE,
  WORKFLOW_QUEUES.ALL_FINDINGS,
];

await requireUatPersonas(['C'], { label: 'pagination-integrity' });

const report = await runAs('C', async ({ page }) => {
  const queueResults = {};
  for (const queue of QUEUES) {
    const seen = new Map();
    let pageNum = 1;
    let total = null;
    let pages = 0;
    while (pageNum <= 50) {
      const url = `${STAGING_ORIGIN}/api/ri-lab/triage?queue=${encodeURIComponent(queue)}&page=${pageNum}&pageSize=25`;
      const res = await page.request.get(url);
      const body = await res.json().catch(() => ({}));
      if (!res.ok()) throw new Error(`${queue} page ${pageNum}: ${body.error || res.status()}`);
      total = body.total ?? total;
      const pg = body.pagination;
      if (!pg) throw new Error(`${queue}: missing pagination`);
      for (const item of body.items || []) {
        const n = (seen.get(item.findingId) || 0) + 1;
        seen.set(item.findingId, n);
      }
      pages += 1;
      if (!pg.hasNextPage) break;
      pageNum = pg.page + 1;
    }
    const dupes = [...seen.entries()].filter(([, n]) => n > 1);
    const unique = seen.size;
    queueResults[queue] = {
      total,
      unique,
      pages,
      duplicates: dupes.length,
      complete: unique === total && dupes.length === 0,
    };
  }
  const all = queueResults[WORKFLOW_QUEUES.ALL_FINDINGS];
  return { queueResults, ok: all?.complete === true && all?.total === 208, expectedTotal: 208 };
});

writeFileSync(join(OUT, 'PAGINATION-INTEGRITY.json'), JSON.stringify({ generatedAt: new Date().toISOString(), ...report }, null, 2));

if (!report.ok) {
  console.error('staging-six-queue-pagination-integrity: FAIL', report);
  process.exit(1);
}
console.log('staging-six-queue-pagination-integrity: PASS', report.queueResults[WORKFLOW_QUEUES.ALL_FINDINGS]);