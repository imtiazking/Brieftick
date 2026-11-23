#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runAs, STAGING_ORIGIN } from './staging-user-sessions.mjs';

const PUB = '829c5472-953a-40ff-9628-947afbfe4e7a';
const OUT = resolve(process.cwd(), '..', '..', 'docs', 'eval', 'PS26-1-HOSTED-PROVISION-RECONCILE-2026-11-23.json');

const EXCEPTION_CORES = [
  '16.1.6R',
  '2.7.19GG',
  '2.7.19HG',
  '2.7.7FG',
  '2.8.6CG',
  '8.12.11AG',
  'TP 13.5G',
];

await runAs('A', async ({ page }) => {
  const res = await page.request.post(`${STAGING_ORIGIN}/api/ri-lab/publications/${PUB}/extraction-orchestration`, {
    data: { action: 'reconcile_provision_inventory' },
  });
  const body = await res.json().catch(() => ({}));
  const orch = body.orchestration || {};
  const rec = orch.coverageReconciliation || {};
  const outcomes = orch.provisionOutcomes || [];
  const exceptionRows = outcomes.filter((o) => EXCEPTION_CORES.includes(o.core));
  const payload = {
    generatedAt: new Date().toISOString(),
    http: res.status(),
    ok: body.ok === true,
    unresolvedCores: rec.unresolvedProvisionCores || [],
    exceptionCores: rec.provisionInventory?.exceptionCores || outcomes.filter((o) => o.trackingStatus === 'exception').map((o) => o.core),
    exceptionPreserved: EXCEPTION_CORES.every((c) =>
      (rec.unresolvedProvisionCores || []).length === 0
        ? exceptionRows.some((r) => r.core === c && (r.trackingStatus === 'exception' || r.extractionOutcome === 'supplied_requires_exception_triage'))
        : false,
    ),
    coverageReconciliation: rec,
    provisionOutcomesSample: exceptionRows,
  };
  writeFileSync(OUT, JSON.stringify(payload, null, 2));
  console.log(JSON.stringify(payload, null, 2));
  if (!payload.ok || (rec.unresolvedProvisionCores || []).length > 0) process.exit(1);
});