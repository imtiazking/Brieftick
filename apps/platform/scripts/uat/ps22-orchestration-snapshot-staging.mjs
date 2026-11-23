#!/usr/bin/env node
import { runAs, STAGING_ORIGIN } from './staging-user-sessions.mjs';

const PUB = '7a73ac4c-d6b4-4411-9f6d-1276053f2831';
await runAs('A', async ({ page }) => {
  const res = await page.request.get(`${STAGING_ORIGIN}/api/ri-lab/publications/${PUB}/extraction-orchestration`);
  const body = await res.json().catch(() => ({}));
  const batches = (body.orchestration?.batches || []).map((b) => ({
    batchIndex: b.batchIndex,
    status: b.status,
    runId: b.runId,
    idempotencySuffix: b.idempotencySuffix,
  }));
  console.log(JSON.stringify({ cumulative: body.orchestration?.cumulativeSuppliedProvisionCores?.length, batches }, null, 2));
});