#!/usr/bin/env node
/**
 * Stage B operator sign-off pack — integrity + checklist (programmePass remains false).
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { verifyProtectedBaselineHashes } from '../lib/ri/eval/baseline-protection.mjs';

const platformRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(platformRoot, '..', '..');
const manifestPath = join(repoRoot, 'docs', 'eval', 'stage-b-secure-evidence-manifest.json');
const outPath = join(repoRoot, 'docs', 'eval', 'stage-b-operator-signoff-pack.json');

function sha256File(abs) {
  return createHash('sha256').update(readFileSync(abs)).digest('hex');
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const manifestBody = { ...manifest };
delete manifestBody.manifestSha256;
const recomputedManifestSha = createHash('sha256').update(JSON.stringify(manifestBody)).digest('hex');
const manifestIntegrityOk = recomputedManifestSha === manifest.manifestSha256;

const baselines = verifyProtectedBaselineHashes();
const baselineOk = baselines.every((b) => b.ok);

const harness = spawnSync(process.execPath, ['scripts/acceptance-stage-b-secure-eval-evidence.mjs'], {
  cwd: platformRoot,
  encoding: 'utf8',
});
const reproducibility = {
  acceptanceStageBSecureEvalEvidence: harness.status === 0,
  exitCode: harness.status,
};

const redactionChecks = {
  evalReportSanitizePresent: existsSync(join(platformRoot, 'lib', 'ri', 'eval', 'eval-report-sanitize.mjs')),
  providerDiagnosticsSafetyScript: existsSync(join(platformRoot, 'scripts', 'acceptance-provider-diagnostics-safety.mjs')),
  manifestOrgScopeOfflineOnly: manifest.organisationScope === 'offline_eval_corpus_only',
};

const evidenceRetention = {
  manifestPath: 'docs/eval/stage-b-secure-evidence-manifest.json',
  baselinePaths: manifest.protectedBaselinePaths,
  runOutputs: 'docs/eval/runs/ (timestamped, sanitised)',
  retentionPolicy: 'Corpus offline only; no Partner UAT DB artefacts in eval manifests',
};

const operatorChecklist = [
  { id: 'B-01', item: 'Verify manifestSha256 matches change control record', status: 'PENDING_OPERATOR', required: true },
  { id: 'B-02', item: 'Confirm protected baseline SHA-256 hashes unchanged', status: baselineOk ? 'TECH_PASS' : 'TECH_FAIL', required: true },
  { id: 'B-03', item: 'Review harness + provider diagnostics acceptance output', status: reproducibility.acceptanceStageBSecureEvalEvidence ? 'TECH_PASS' : 'TECH_FAIL', required: true },
  { id: 'B-04', item: 'Confirm eval corpus contains no live tenant snapshots', status: 'PENDING_OPERATOR', required: true },
  { id: 'B-05', item: 'Sign SME secure-evidence attestation (name, date)', status: 'PENDING_OPERATOR', required: true },
];

const securityConcerns = [
  {
    id: 'SEC-B-01',
    severity: 'medium',
    topic: 'Live Anthropic key in developer environments',
    mitigation: 'Stage E gated; RI_AI_EXECUTION_ENABLED default off on staging',
    operatorReviewRequired: true,
  },
  {
    id: 'SEC-B-02',
    severity: 'low',
    topic: 'Eval run JSON may contain publication excerpts',
    mitigation: 'sanitizeEvalReport before commit; redaction harness acceptance',
    operatorReviewRequired: true,
  },
];

const pack = {
  schemaVersion: 'forgeniq.eval.stage-b-signoff-pack.v1',
  capturedAt: new Date().toISOString(),
  programmePass: false,
  operatorApproval: null,
  operatorApprovalFields: {
    attestedBy: null,
    attestedAt: null,
    changeControlRef: null,
  },
  manifestVerification: {
    path: manifestPath,
    recordedSha256: manifest.manifestSha256,
    recomputedSha256: recomputedManifestSha,
    integrityOk: manifestIntegrityOk,
  },
  baselineIntegrity: { allOk: baselineOk, baselines },
  evidenceRetention,
  redactionChecks,
  reproducibility,
  operatorChecklist,
  outstandingSecurityConcerns: securityConcerns,
  technicalReadinessForOperatorReview: baselineOk && manifestIntegrityOk && reproducibility.acceptanceStageBSecureEvalEvidence,
  notes: 'Technical checks do not constitute programme PASS. Operator must complete checklist B-01, B-04, B-05.',
};

writeFileSync(outPath, JSON.stringify(pack, null, 2));
console.log(
  JSON.stringify({
    ok: pack.technicalReadinessForOperatorReview,
    outPath,
    programmePass: false,
    manifestIntegrityOk,
  }, null, 2),
);
process.exit(pack.technicalReadinessForOperatorReview ? 0 : 1);