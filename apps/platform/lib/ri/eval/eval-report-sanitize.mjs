import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertSanitisedDiagnosticsPayload,
} from '../reasoner/anthropic-provider-diagnostics.mjs';
import { resolveV2EvalReasonerAnthropicConfig } from '../reasoner/anthropic-eval-reasoner-config.mjs';
import { EvalSpendTracker, V2_EVAL_BUDGET_USD } from '../reasoner/anthropic-eval-budget.mjs';
import { AUTHENTIC_CORPUS_B2_DIR, EVAL_SUITE_V21_PATH } from './eval-paths.mjs';

const EVAL_DIR = dirname(fileURLToPath(import.meta.url));
const PLATFORM_ROOT = join(EVAL_DIR, '..', '..', '..');

/** Material eval dependencies (sorted paths; hashed from working-tree bytes). */
const MATERIAL_EVAL_DEPENDENCY_PATHS = [
  'lib/ri/ai/anthropic-messages-core.mjs',
  'lib/ri/eval/eval-case-filter.mjs',
  'lib/ri/eval/eval-report-sanitize.mjs',
  'lib/ri/eval/run-eval-suite-v2.mjs',
  'lib/ri/eval/score-eval-case.mjs',
  'lib/ri/eval/validate-eval-suite.mjs',
  'lib/ri/reasoner/anthropic-eval-budget.mjs',
  'lib/ri/reasoner/anthropic-eval-reasoner-config.mjs',
  'lib/ri/reasoner/anthropic-provider-diagnostics.mjs',
  'lib/ri/reasoner/build-reasoner-prompt.mjs',
  'lib/ri/reasoner/invoke-anthropic-reasoner.mjs',
  'lib/ri/reasoner/public-question-eligibility.mjs',
  'lib/ri/reasoner/reasoner-output-schema.mjs',
  'lib/ri/reasoner/run-ask-ri-v2-pipeline.mjs',
  'lib/ri/reasoner/v2-eval-models.mjs',
  'lib/ri/semantic/semantic-retrieval-eval.mjs',
].sort();

export function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

export function hashDirectoryTreeSha256(rootDir) {
  const h = createHash('sha256');
  const walk = (dir) => {
    const entries = readdirSync(dir).sort();
    for (const name of entries) {
      const abs = join(dir, name);
      const st = statSync(abs);
      const rel = relative(rootDir, abs).replace(/\\/g, '/');
      if (st.isDirectory()) walk(abs);
      else {
        h.update(rel);
        h.update(readFileSync(abs));
      }
    }
  };
  walk(rootDir);
  return h.digest('hex');
}

export function buildMaterialEvalDependencySha256() {
  const h = createHash('sha256');
  for (const rel of MATERIAL_EVAL_DEPENDENCY_PATHS) {
    const abs = join(PLATFORM_ROOT, rel);
    h.update(rel);
    h.update(readFileSync(abs));
  }
  return h.digest('hex');
}

/** @deprecated alias — use buildMaterialEvalDependencySha256 */
export function buildReasonerCodeFingerprintSha256() {
  return buildMaterialEvalDependencySha256();
}

export function loadCorpusManifestFingerprint() {
  const manifestPath = join(AUTHENTIC_CORPUS_B2_DIR, 'manifest.json');
  const raw = readFileSync(manifestPath, 'utf8');
  const manifest = JSON.parse(raw);
  return {
    corpusId: manifest.corpus ?? null,
    corpusCreatedAt: manifest.createdAt ?? null,
    corpusPublicationCount: manifest.publications?.length ?? null,
    corpusManifestSha256: createHash('sha256').update(raw).digest('hex'),
    corpusContentSha256: hashDirectoryTreeSha256(AUTHENTIC_CORPUS_B2_DIR),
  };
}

/**
 * Resume compatibility fingerprint (content-based; not git SHA alone).
 */
export function buildEvalResumeFingerprint({
  suitePath = EVAL_SUITE_V21_PATH,
  model,
  testIds,
  dryRun,
  publicProviderOnly,
  providerDeps,
  budgetUsd = V2_EVAL_BUDGET_USD,
}) {
  const suiteRaw = readFileSync(suitePath, 'utf8');
  const suiteDoc = JSON.parse(suiteRaw);
  const evalOut = resolveV2EvalReasonerAnthropicConfig(providerDeps || {});
  const sortedIds = testIds?.length ? [...testIds].sort() : null;

  return {
    schemaVersion: 'forgeniq.eval.resume-fingerprint.v2',
    modelIdentifier: model,
    budgetUsd: Number(budgetUsd),
    outputEffort: evalOut.outputEffort,
    thinkingType: evalOut.thinking?.type ?? 'adaptive',
    maxTokens: evalOut.maxTokens,
    maxTokensRetry: evalOut.maxTokensRetry,
    allowRetry: evalOut.allowRetry,
    evaluationSuiteVersion: suiteDoc.evaluationVersion ?? null,
    evaluationSuiteContentSha256: createHash('sha256').update(suiteRaw).digest('hex'),
    evaluationSuitePath: suitePath,
    ...loadCorpusManifestFingerprint(),
    testIds: sortedIds ? sortedIds.join(',') : 'ALL_RUNNABLE_FILTERED',
    dryRun: Boolean(dryRun),
    publicProviderOnly: Boolean(publicProviderOnly),
    materialEvalDependencySha256: buildMaterialEvalDependencySha256(),
    reasonerCodeFingerprintSha256: buildMaterialEvalDependencySha256(),
  };
}

const FINGERPRINT_COMPARE_KEYS = [
  'schemaVersion',
  'modelIdentifier',
  'budgetUsd',
  'outputEffort',
  'thinkingType',
  'maxTokens',
  'maxTokensRetry',
  'allowRetry',
  'evaluationSuiteVersion',
  'evaluationSuiteContentSha256',
  'corpusId',
  'corpusManifestSha256',
  'corpusContentSha256',
  'testIds',
  'dryRun',
  'publicProviderOnly',
  'materialEvalDependencySha256',
];

export function compareResumeFingerprints(stored, current) {
  const mismatches = [];
  for (const key of FINGERPRINT_COMPARE_KEYS) {
    if ((stored?.[key] ?? null) !== (current?.[key] ?? null)) {
      mismatches.push({ field: key, stored: stored?.[key] ?? null, current: current?.[key] ?? null });
    }
  }
  return mismatches;
}

export function assertResumeFingerprintCompatible(stored, current) {
  const mismatches = compareResumeFingerprints(stored, current);
  if (!stored) {
    const err = new Error('resume_incompatible:missing_stored_fingerprint');
    err.code = 'RESUME_INCOMPATIBLE';
    err.mismatches = [{ field: 'resumeFingerprint', stored: null, current: 'present' }];
    throw err;
  }
  if (mismatches.length) {
    const err = new Error(`resume_incompatible:${mismatches.map((m) => m.field).join(',')}`);
    err.code = 'RESUME_INCOMPATIBLE';
    err.mismatches = mismatches;
    throw err;
  }
}

const SPEND_CHECKPOINT_NUMERIC_KEYS = [
  'budgetUsd',
  'estimatedUsd',
  'calculatedUsd',
  'inputTokens',
  'outputTokens',
  'requestCount',
  'reservedUsd',
];

function resumeIncompatible(message, field, stored, current) {
  const err = new Error(`resume_incompatible:${message}`);
  err.code = 'RESUME_INCOMPATIBLE';
  err.mismatches = [{ field, stored: stored ?? null, current: current ?? null }];
  throw err;
}

/** Persist full spend state needed to resume budget accounting (no fresh budget). */
export function serializeSpendForCheckpoint(spend) {
  if (!spend) return null;
  return {
    ...spend.toJSON(),
    pendingReserveUsd: Number((spend.pendingReserveUsd || 0).toFixed(6)),
  };
}

/**
 * Restore EvalSpendTracker from checkpoint; fail-closed if spend cannot be established safely.
 */
export function restoreEvalSpendTracker(storedSpend, expected) {
  if (!storedSpend || typeof storedSpend !== 'object') {
    resumeIncompatible('missing_stored_spend', 'spend', null, 'required');
  }
  for (const k of SPEND_CHECKPOINT_NUMERIC_KEYS) {
    if (storedSpend[k] == null || Number.isNaN(Number(storedSpend[k]))) {
      resumeIncompatible(`missing_or_invalid_spend_${k}`, k, storedSpend[k], 'numeric');
    }
  }
  if (storedSpend.stopped == null) {
    resumeIncompatible('missing_spend_stopped', 'stopped', null, 'boolean');
  }
  if (String(storedSpend.model) !== String(expected.model)) {
    resumeIncompatible('spend_model_mismatch', 'model', storedSpend.model, expected.model);
  }
  if (Number(storedSpend.budgetUsd) !== Number(expected.budgetUsd)) {
    resumeIncompatible('spend_budget_mismatch', 'budgetUsd', storedSpend.budgetUsd, expected.budgetUsd);
  }
  if (Number(storedSpend.pendingReserveUsd || 0) > 1e-9) {
    resumeIncompatible('spend_pending_reserve_unsettled', 'pendingReserveUsd', storedSpend.pendingReserveUsd, 0);
  }

  const spend = new EvalSpendTracker({ budgetUsd: Number(storedSpend.budgetUsd), model: storedSpend.model });
  spend.estimatedUsd = Number(storedSpend.estimatedUsd);
  spend.calculatedUsd = Number(storedSpend.calculatedUsd);
  spend.inputTokens = Number(storedSpend.inputTokens);
  spend.outputTokens = Number(storedSpend.outputTokens);
  spend.requestCount = Number(storedSpend.requestCount);
  spend.reservedUsd = Number(storedSpend.reservedUsd);
  spend.stopped = Boolean(storedSpend.stopped);
  spend.stopReason = storedSpend.stopReason ?? null;
  spend.pendingReserveUsd = 0;
  return spend;
}

/** Refuse resume when budget ceiling already blocks further provider work. */
export function assertResumeBudgetAllowsRemainingCases(spend, remainingCaseCount) {
  if (!remainingCaseCount) return;
  if (spend.stopped && spend.stopReason === 'budget_ceiling') {
    resumeIncompatible('budget_exhausted', 'spend.stopped', true, false);
  }
  if (spend.calculatedUsd >= spend.budgetUsd && remainingCaseCount > 0) {
    resumeIncompatible('budget_exhausted_calculated', 'spend.calculatedUsd', spend.calculatedUsd, `<${spend.budgetUsd}`);
  }
  if (!spend.canAfford(0) && remainingCaseCount > 0) {
    resumeIncompatible('budget_no_headroom', 'spend.canAfford', false, true);
  }
}

/**
 * Build top-level eval summary from all logical result rows (resumed + new).
 */
export function buildEvalRunSummary(resultRows) {
  const rows = resultRows || [];
  return {
    v2Execution: {
      PUBLIC_ELIGIBLE_EXECUTED: rows.filter((r) => r.v2ExecutionStatus === 'PUBLIC_ELIGIBLE_EXECUTED').length,
      BLOCKED_EXPECTED: rows.filter((r) => r.v2ExecutionStatus === 'BLOCKED_EXPECTED').length,
      BLOCKED_UNEXPECTED: rows.filter((r) => r.v2ExecutionStatus === 'BLOCKED_UNEXPECTED').length,
      PROVIDER_ERROR: rows.filter((r) => r.v2ExecutionStatus === 'PROVIDER_ERROR').length,
      VERIFICATION_FAILED: rows.filter((r) => r.v2ExecutionStatus === 'VERIFICATION_FAILED').length,
      NOT_RUN: rows.filter((r) => r.v2ExecutionStatus === 'NOT_RUN').length,
      blockedBeforeProvider: rows.filter(
        (r) => r.v2ExecutionStatus === 'BLOCKED_EXPECTED' || r.v2ExecutionStatus === 'BLOCKED_UNEXPECTED',
      ).length,
    },
    outcomes: rows.reduce((acc, r) => {
      if (r.outcome) acc[r.outcome] = (acc[r.outcome] || 0) + 1;
      return acc;
    }, {}),
    preReasonerBlocks: {
      reference_validation: rows.filter((r) => r.preReasonerBlock === 'reference_validation').length,
      authority_gate: rows.filter((r) => r.preReasonerBlock === 'authority_gate').length,
    },
    engineInsufficientEvidence: rows.filter((r) => (r.engineStatus ?? r.status) === 'INSUFFICIENT_EVIDENCE').length,
    pipelineDryRunNotRun: rows.filter((r) => r.v2ExecutionStatus === 'NOT_RUN' && r.status === 'NOT_RUN').length,
    harnessOutcomes: rows.reduce((acc, r) => {
      const k = r.harnessOutcome || 'UNKNOWN';
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {}),
  };
}

export function scrubProviderDiagnosticsForReport(diag) {
  if (!diag) return null;
  const violations = assertSanitisedDiagnosticsPayload(diag);
  if (violations.length) {
    return {
      ok: false,
      errorClass: 'DIAGNOSTICS_REDACTED',
      safeMessage: 'Provider diagnostics omitted (failed safety scrub).',
    };
  }
  return diag;
}

export function providerDiagnosticsFromResult(r) {
  return scrubProviderDiagnosticsForReport(r.providerDiagnostics || r.v2Diagnostics?.providerDiagnostics);
}

/** Slim persisted case row (partial / checkpoint / final sanitise). */
export function slimCaseForPersistence(r) {
  const providerDiagnostics = providerDiagnosticsFromResult(r);
  return {
    testId: r.testId,
    outcome: r.outcome,
    engineStatus: r.engineStatus ?? r.status,
    v2ExecutionStatus: r.v2ExecutionStatus,
    deterministicR2Outcome: r.deterministicR2Outcome ?? null,
    deterministicR2Status: r.deterministicR2Status ?? null,
    harnessOutcome: r.harnessOutcome,
    timingMs: r.timingMs,
    providerInvoked: r.providerInvoked,
    sufficiency: r.sufficiency,
    humanReviewRequired: r.humanReviewRequired,
    execution: r.execution,
    preReasonerBlock: r.preReasonerBlock ?? null,
    status: r.status ?? r.engineStatus ?? null,
    providerDiagnostics,
    v2Diagnostics: r.v2Diagnostics
      ? {
          ...r.v2Diagnostics,
          providerDiagnostics,
        }
      : providerDiagnostics
        ? { providerDiagnostics }
        : null,
  };
}

export function buildProviderDiagnosticsByTestId(rows) {
  const out = {};
  for (const row of rows || []) {
    if (row?.testId && row.providerDiagnostics) out[row.testId] = row.providerDiagnostics;
  }
  return out;
}

export function sanitizeEvalReport(report) {
  const slimResults = (report.results || []).map((r) => {
    const slim = slimCaseForPersistence(r);
    return {
      ...slim,
      preReasonerBlock: r.preReasonerBlock,
      harnessOutcome: r.harnessOutcome,
      regulatoryMeasurement: r.regulatoryMeasurement,
      answerPreview: String(r.answer || '').slice(0, 400),
      citationCount: r.citations?.length ?? 0,
    };
  });
  return { ...report, results: slimResults, sanitised: true };
}
