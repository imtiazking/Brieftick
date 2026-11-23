#!/usr/bin/env node
/** Dry-run PS22 batch 0 plan + preflight — no paid extract (max $0.20 per batch when authorised). */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runAs, STAGING_ORIGIN } from './staging-user-sessions.mjs';
import {
  assertExtractionOutputBudget,
  estimateStructuredOutputTokens,
} from '../../lib/ri/ai/extraction-output-preflight.mjs';

const PUB = '7a73ac4c-d6b4-4411-9f6d-1276053f2831';
const MAX_USD = 0.2;
const MAX_SECTIONS = 4;
const OUT = resolve(process.cwd(), '..', '..', 'docs', 'eval', 'PS22-9-FIRST-BATCH-PREP-2026-11-23.json');

const log = [];
const record = (step, payload) => log.push({ step, at: new Date().toISOString(), ...payload });

await runAs('A', async ({ page }) => {
  const planRes = await page.request.get(
    `${STAGING_ORIGIN}/api/ri-lab/publications/${PUB}/extraction-batch-plan?fullPublicationCoverage=true&maxSectionsPerBatch=${MAX_SECTIONS}`,
  );
  const plan = (await planRes.json().catch(() => ({}))).plan;
  record('staging-batch-plan', {
    inventory: plan?.instrumentProvisionCount,
    batches: plan?.batches?.length,
    batch0: plan?.batches?.[0]?.instrumentProvisionsNewlySupplied?.length,
    batch0Preflight: plan?.batches?.[0]?.estimate?.outputPreflight,
  });
  const b0 = plan?.batches?.[0];
  const prov = b0?.instrumentProvisionsNewlySupplied?.length ?? 0;
  const sections = Math.min(MAX_SECTIONS, b0?.selection?.selectedSections ?? MAX_SECTIONS);
  const preflight = assertExtractionOutputBudget({
    estimateTokens: estimateStructuredOutputTokens({ provisionCount: prov, sectionCount: sections }),
    maxOutputTokens: 8192,
  });
  record('client-preflight', preflight);
  record('policy', {
    maxUsdPerBatch: MAX_USD,
    cumulativeCeilingUsd: 2.35,
    existingAuthorisedCeilingUsd: 2,
    additionalAuthorisationRequiredUsd: 0.35,
    paidExtract: false,
    idempotencySuffixPattern: 'live-ps22-replace-batch0-2026-11-23',
    historicalRunsPreserved: ['147574c3-229a-42e3-9adb-fd480b905d3b', '3872aebf-cdab-4367-8fa9-c5c1ddd0e08e'],
  });
});

writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), log }, null, 2));
console.log(`Wrote ${OUT}`);