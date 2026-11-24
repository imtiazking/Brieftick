#!/usr/bin/env node
/**
 * Sequential paid-extraction gate. Refuses to call a provider unless the ceiling is explicitly authorised.
 * Does not retry failed batches. Does not run under the current instruction.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../../lib/ri/eval/eval-paths.mjs';
import { resolveMaxProvisionsPerBatch } from '../../lib/ri/ai/extraction-output-preflight.mjs';

const ps22 = JSON.parse(readFileSync(join(REPO_ROOT, 'docs/eval/PS22-9-CONTINUATION-READINESS-2026-11-24.json'), 'utf8'));
const ps26 = JSON.parse(readFileSync(join(REPO_ROOT, 'docs/eval/PS26-17-OPERATIVE-PAID-PLAN-2026-11-24.json'), 'utf8'));
const cap = resolveMaxProvisionsPerBatch();
const spent = 1.488222;
const authorised = 2.35;
const additional = Number((ps22.estimatedUsd + ps26.estimatedUsd).toFixed(3));
const projected = Number((spent + additional).toFixed(3));
const execute = process.argv.includes('--execute');
const problems = [];
if (!ps22.coversOutstandingInventory || !ps22.allWithinCap || !ps22.preflightOk || !ps22.noOverlapWithCompleted) {
  problems.push('PS22 continuation plan is not ready');
}
if (ps22.publication?.sourcePdfSha256 !== 'ee1230a9d9dfc378604ea9462568817cf6c1e7702ab38e927027fe08172f637b') {
  problems.push('PS22 source hash mismatch');
}
if (ps22.publication?.publicationType !== 'policy_statement' || ps22.publication?.consultationPreserved !== false) {
  problems.push('PS22 is not classified as final policy statement');
}
for (const batch of ps26.batches || []) {
  if (batch.provisionCount > cap || !batch.preflight?.ok || !batch.pdfEvidence?.every((p) => p.inIndex)) {
    problems.push(`PS26 batch ${batch.batchIndex} failed the gate`);
  }
}
const ceiling = Number(process.env.FORGENIQ_PAID_CEILING_USD || authorised);
const explicit = process.env.FORGENIQ_PAID_EXTRACTION_AUTHORISED === 'PS22-PS26-2026-11-24';
if (execute && (!explicit || ceiling < projected)) {
  problems.push(`Paid execution refused. Projected ${projected} needs an explicit ceiling approval. Current authorised ceiling is ${authorised}.`);
}
const report = {
  executed: false,
  provisionCap: cap,
  spentUsd: spent,
  authorisedCeilingUsd: authorised,
  additionalUsd: additional,
  projectedUsd: projected,
  ps22Batches: ps22.batchCount,
  ps26Batches: (ps26.batches || []).map((b) => b.provisionCount),
  noAutomaticRetry: true,
  problems,
};
console.log(JSON.stringify(report, null, 2));
if (problems.length) process.exit(execute ? 2 : 1);
if (execute) {
  console.error('Execution path is not implemented in this gate. Authorisation was checked only.');
  process.exit(2);
}
