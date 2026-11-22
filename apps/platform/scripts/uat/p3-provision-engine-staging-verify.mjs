#!/usr/bin/env node
/**
 * Post-deploy verification: CONC 7.20.1R batch-plan pages 94+95; provision engine API smoke.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { runAs, STAGING_ORIGIN } from './staging-user-sessions.mjs';

const PS26 = '829c5472-953a-40ff-9628-947afbfe4e7a';
const PS22 = '7a73ac4c-d6b4-4411-9f6d-1276053f2831';
const EVIDENCE = resolve(process.cwd(), '..', '..', 'docs', 'eval', 'STAGING-P3-PROVISION-ENGINE-VERIFY-2026-11-22.json');
const checks = [];

const check = (name, pass, detail) => {
  checks.push({ name, pass: !!pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}: ${name}${detail ? ` — ${JSON.stringify(detail)}` : ''}`);
};

async function main() {
  await runAs('A', async ({ page }) => {
    const conc = await page.request.get(
      `${STAGING_ORIGIN}/api/ri-lab/publications/${PS26}/extraction-batch-plan?maxSectionsPerBatch=12&maxBatches=8&targetProvisionCores=7.20.1R`,
    );
    const concBody = await conc.json().catch(() => ({}));
    const omitted = concBody.plan?.batches?.flatMap((b) => b.selection?.instrumentProvisionsOmitted || []) || [];
    const idx = omitted.find((r) => r.provision === '7.20.1R')?.pages;
    check('PS26 batch plan indexes CONC 7.20.1R on pages 94 and 95', Array.isArray(idx) && idx.includes(94) && idx.includes(95), { pages: idx });
    check('PS26 batch plan ok', concBody.ok === true, { status: conc.status(), error: concBody.error });

    const ps22 = await page.request.get(
      `${STAGING_ORIGIN}/api/ri-lab/publications/${PS22}/extraction-batch-plan?maxSectionsPerBatch=6&maxBatches=8&targetProvisionCores=${encodeURIComponent('2A.4.35E,2A.4.34R')}`,
    );
    const ps22Body = await ps22.json().catch(() => ({}));
    const ps22Omitted = ps22Body.plan?.batches?.flatMap((b) => b.selection?.instrumentProvisionsOmitted || []) || [];
    const eIdx = ps22Omitted.find((r) => r.provision === '2A.4.35E')?.pages;
    check('PS22 batch plan indexes PRIN 2A.4.35E', Array.isArray(eIdx) && eIdx.length > 0, { pages: eIdx });
  });

  const health = await fetch(`${STAGING_ORIGIN}/health`, { cache: 'no-store' }).then((r) => r.text());
  check('staging health reachable', health.includes('Environment') || health.includes('FORGENIQ'), { len: health.length });

  mkdirSync(resolve(process.cwd(), '..', '..', 'docs', 'eval'), { recursive: true });
  writeFileSync(EVIDENCE, JSON.stringify({ capturedAt: new Date().toISOString(), checks }, null, 2));
  if (checks.some((c) => !c.pass)) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});