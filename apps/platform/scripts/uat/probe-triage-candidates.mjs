#!/usr/bin/env node
import { runAs } from './staging-user-sessions.mjs';

const PS22_PUB = '7a73ac4c-d6b4-4411-9f6d-1276053f2831';

const data = await runAs('A', async ({ page }) => {
  return page.evaluate(async (excludePub) => {
    const res = await fetch('/api/ri-lab/triage?queue=OBLIGATION_TRIAGE', { credentials: 'same-origin' });
    const body = await res.json();
  const items = body.items || [];
  const eligible = items.filter((i) => i.draftEligible && !i.obligationId && i.publicationId !== excludePub);
  const withoutObl = items.filter((i) => !i.obligationId && i.publicationId !== excludePub && i.reviewStatus === 'HUMAN_REVIEW_REQUIRED');
  return {
    status: res.status,
    total: body.total,
    itemCount: items.length,
    draftEligible: eligible.length,
    eligibleSample: eligible.slice(0, 8),
    pendingWithoutObl: withoutObl.length,
    pendingSample: withoutObl.slice(0, 5).map((i) => ({
      runId: i.runId,
      findingId: i.findingId,
      pub: i.publicationTitle,
      provisional: i.provisional,
      draftEligible: i.draftEligible,
    })),
  };
  }, PS22_PUB);
});

console.log(JSON.stringify(data, null, 2));