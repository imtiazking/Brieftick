#!/usr/bin/env node
/**
 * Stage B — integrity-verifiable secure eval evidence manifest (offline).
 */
import { createHash } from 'node:crypto';
import { writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyProtectedBaselineHashes, PROTECTED_HISTORICAL_BASELINES } from '../lib/ri/eval/baseline-protection.mjs';

const platformRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const outPath = join(platformRoot, '..', '..', 'docs', 'eval', 'stage-b-secure-evidence-manifest.json');

const baselines = verifyProtectedBaselineHashes();
const checks = [
  'scripts/acceptance-ask-ri-eval-harness.mjs',
  'scripts/acceptance-provider-diagnostics-safety.mjs',
  'lib/ri/eval/baseline-protection.mjs',
  'lib/ri/eval/validate-eval-suite.mjs',
];

const fileDigests = checks.map((rel) => {
  const abs = join(platformRoot, rel);
  const buf = readFileSync(abs);
  return { path: rel, sha256: createHash('sha256').update(buf).digest('hex') };
});

const body = {
  schemaVersion: 'forgeniq.eval.stage-b-manifest.v1',
  capturedAt: new Date().toISOString(),
  organisationScope: 'offline_eval_corpus_only',
  protectedBaselines: baselines,
  protectedBaselinePaths: PROTECTED_HISTORICAL_BASELINES,
  integrityChecks: fileDigests,
  programmeStatus: 'STAGE_B_OFFLINE_MANIFEST_COMPLETE',
  programmePass: false,
  programmePassCriteria:
    'Operator attestation + corpus audit sign-off; manifestSha256 recorded in change control',
};

const manifestHash = createHash('sha256').update(JSON.stringify(body)).digest('hex');
body.manifestSha256 = manifestHash;

writeFileSync(outPath, JSON.stringify(body, null, 2));
console.log(JSON.stringify({ ok: baselines.every((b) => b.ok), outPath, manifestSha256: manifestHash }, null, 2));
process.exit(baselines.every((b) => b.ok) ? 0 : 1);