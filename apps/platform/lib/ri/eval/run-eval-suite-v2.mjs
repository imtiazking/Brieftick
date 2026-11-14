import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';
import {
  AUTHENTIC_CORPUS_B2_DIR,
  DETERMINISTIC_V21_R2_BASELINE,
  EVAL_SUITE_V21_PATH,
  REPO_ROOT,
} from './eval-paths.mjs';
import { validateEvalSuite, selectRunnableCases } from './validate-eval-suite.mjs';
import { buildPublicEvalAllowlist } from '../reasoner/public-question-eligibility.mjs';
import { buildSemanticIndex } from '../semantic/semantic-retrieval-eval.mjs';
import { runAskRiV2Pipeline } from '../reasoner/run-ask-ri-v2-pipeline.mjs';
import {
  EvalSpendTracker,
  resolveV2EvalModel,
  V2_EVAL_BUDGET_USD,
  estimateRequestCostUsd,
} from '../reasoner/anthropic-eval-budget.mjs';
import { scoreEvalCase } from './score-eval-case.mjs';
import { isV2LiveReasoningEnabled } from '../reasoner/invoke-anthropic-reasoner.mjs';
import { classifyV2HarnessOutcome } from '../reasoner/anthropic-provider-diagnostics.mjs';
import { loadLocalEnvFile } from '../reasoner/load-local-env.mjs';
import { writeCheckpointAtomic } from './eval-checkpoint.mjs';
import { emitEvalProgress } from './eval-progress.mjs';
import { filterEvalSuiteCases, validateEvalCaseFilter } from './eval-case-filter.mjs';
import {
  slimCaseForPersistence,
  buildProviderDiagnosticsByTestId,
  providerDiagnosticsFromResult,
  buildEvalResumeFingerprint,
  assertResumeFingerprintCompatible,
  restoreEvalSpendTracker,
  assertResumeBudgetAllowsRemainingCases,
  serializeSpendForCheckpoint,
  buildEvalRunSummary,
} from './eval-report-sanitize.mjs';

function gitSha() {
  try {
    return execSync('git rev-parse HEAD', { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

function loadBaselineMap(path) {
  const doc = JSON.parse(readFileSync(path, 'utf8'));
  return new Map((doc.results || []).map((r) => [r.testId, r]));
}

export async function runEvalSuiteV2(options = {}) {
  if (!options.dryRun && !options.skipEnvLoad) loadLocalEnvFile();
  const suitePath = resolve(options.suitePath || EVAL_SUITE_V21_PATH);
  const suite = JSON.parse(readFileSync(suitePath, 'utf8'));
  const validation = validateEvalSuite(suite, { allowOperatorHeldOut: true, requireQuestions: true });
  if (!validation.ok) throw new Error(`invalid_eval_suite: ${validation.errors.join('; ')}`);

  const runnableCases = selectRunnableCases(suite, { includeOperatorHeldOut: false });
  const allowlist = buildPublicEvalAllowlist(runnableCases);
  const filterCheck = validateEvalCaseFilter(runnableCases, allowlist, {
    publicProviderOnly: Boolean(options.publicProviderOnly),
    testIds: options.testIds,
  });
  if (!filterCheck.ok) throw new Error(`invalid_eval_case_filter: ${filterCheck.errors.join('; ')}`);
  const allSelectedCases = filterCheck.filtered;
  let cases = allSelectedCases;
  const baselineMap = loadBaselineMap(options.baselinePath || DETERMINISTIC_V21_R2_BASELINE);

  const model = resolveV2EvalModel(options.model);
  const budgetUsd = options.budgetUsd ?? V2_EVAL_BUDGET_USD;

  const checkpointPath = options.checkpointPath || null;
  const partialResultsPath = options.partialResultsPath || null;

  const resumeFingerprint = buildEvalResumeFingerprint({
    suitePath,
    model,
    testIds: options.testIds,
    dryRun: options.dryRun,
    publicProviderOnly: options.publicProviderOnly,
    providerDeps: options.providerDeps,
    budgetUsd,
  });

  let resumedPartialRows = [];
  let spend;
  if (options.resumeFromPartial && partialResultsPath && existsSync(partialResultsPath)) {
    const partialDoc = JSON.parse(readFileSync(partialResultsPath, 'utf8'));
    assertResumeFingerprintCompatible(partialDoc.resumeFingerprint, resumeFingerprint);
    resumedPartialRows = Array.isArray(partialDoc.results) ? partialDoc.results : [];
    const completed = new Set(resumedPartialRows.map((r) => r.testId).filter(Boolean));
    cases = cases.filter((c) => !completed.has(c.testId));
    spend = restoreEvalSpendTracker(partialDoc.spend, { model, budgetUsd });
    assertResumeBudgetAllowsRemainingCases(spend, cases.length);
  } else {
    spend = new EvalSpendTracker({ budgetUsd, model });
  }

  const index = await buildSemanticIndex(AUTHENTIC_CORPUS_B2_DIR);
  const results = [];
  const runStartedAt = Date.now();

  const progressSink = options.progressSink;

  const emitProgress = (payload) => {
    const runningUsd = estimateRequestCostUsd(spend.model, spend.inputTokens, spend.outputTokens);
    const line = {
      ...payload,
      calculatedUsd: Number(runningUsd.toFixed(4)),
      spend: serializeSpendForCheckpoint(spend),
    };
    if (typeof progressSink === 'function') progressSink(line);
    else if (options.emitProgress !== false) emitEvalProgress(line);
  };

  for (let caseIndex = 0; caseIndex < cases.length; caseIndex += 1) {
    const caseRow = cases[caseIndex];
    const caseT0 = Date.now();
    const engineResult = await runAskRiV2Pipeline(index, caseRow.question, caseRow, {
      spendTracker: spend,
      dryRun: options.dryRun,
      model,
      bm25Attached: false,
      providerDeps: options.providerDeps,
    });

    const deterministicR2 = baselineMap.get(caseRow.testId);
    const scored = scoreEvalCase(caseRow, engineResult, { simulateCatalogueAttach: false, evidenceAvailable: true });
    scored.harnessOutcome = classifyV2HarnessOutcome(engineResult);
    if (scored.harnessOutcome !== 'REGULATORY_MEASURED') {
      scored.regulatoryMeasurement = 'NOT_MEASURED';
    }
    scored.engine = 'ask_ri_v2';
    scored.providerUsed = Boolean(engineResult.execution?.providerUsed);
    scored.v2ExecutionStatus = engineResult.v2ExecutionStatus;
    scored.deterministicR2Outcome = deterministicR2?.outcome ?? null;
    scored.deterministicR2Status = deterministicR2?.engineStatus ?? null;
    scored.v2Diagnostics = {
      eligibility: engineResult.eligibility,
      sufficiency: engineResult.sufficiency,
      claimClassifications: engineResult.claimClassifications,
      verificationOk: engineResult.verification?.ok,
      verifierFailures: engineResult.verification?.failures,
      humanReviewRequired: engineResult.humanReviewRequired,
      retrievalPublicationSelected: engineResult.retrieval?.publicationSelected,
      evidenceChunkIds: engineResult.evidenceBundle?.chunkIds,
      preReasonerBlock: engineResult.preReasonerBlock || null,
      providerDiagnostics: engineResult.providerDiagnostics || null,
    };

    const mergedRow = { ...scored, ...engineResult };
    if (engineResult.providerDiagnostics) {
      mergedRow.providerDiagnostics = engineResult.providerDiagnostics;
    }
    results.push(mergedRow);

    emitProgress({
      caseIndex: resumedPartialRows.length + caseIndex + 1,
      caseTotal: allSelectedCases.length,
      testId: caseRow.testId,
      v2ExecutionStatus: engineResult.v2ExecutionStatus,
      outcome: scored.outcome,
      harnessOutcome: scored.harnessOutcome,
      elapsedMs: Date.now() - caseT0,
      runElapsedMs: Date.now() - runStartedAt,
      providerAttempts: engineResult.execution?.providerAttempts ?? (engineResult.providerInvoked ? 1 : 0),
      providerInvoked: Boolean(engineResult.providerInvoked),
    });

    const persistedRows = [...resumedPartialRows, ...results.map((r) => slimCaseForPersistence(r))];
    const providerDiagnosticsByTestId = buildProviderDiagnosticsByTestId(persistedRows);
    const lastProviderDiagnostics = providerDiagnosticsFromResult(mergedRow);
    const runSummary = buildEvalRunSummary(persistedRows);

    const checkpointPayload = {
      checkpoint: true,
      resumeFingerprint,
      updatedAt: new Date().toISOString(),
      caseIndex: resumedPartialRows.length + caseIndex + 1,
      caseTotal: allSelectedCases.length,
      lastTestId: caseRow.testId,
      model: { identifier: model },
      spend: serializeSpendForCheckpoint(spend),
      resultsCount: persistedRows.length,
      resumeFromPartial: Boolean(options.resumeFromPartial),
      lastProviderDiagnostics,
      providerDiagnosticsByTestId,
      partialSummary: {
        completedCases: persistedRows.length,
        providerErrors: runSummary.v2Execution.PROVIDER_ERROR,
        publicExecuted: runSummary.v2Execution.PUBLIC_ELIGIBLE_EXECUTED,
      },
      runSummary,
    };
    if (checkpointPath) writeCheckpointAtomic(checkpointPath, checkpointPayload);
    if (partialResultsPath) {
      writeCheckpointAtomic(partialResultsPath, {
        ...checkpointPayload,
        results: persistedRows,
      });
    }

    if (options.stopAfterNewCases != null && results.length >= options.stopAfterNewCases) {
      break;
    }
    if (spend.stopped) break;
  }

  spend.finalizeCalculated();

  const allResultRows = [...resumedPartialRows, ...results.map((r) => ({ ...r, ...slimCaseForPersistence(r) }))];
  const summary = {
    ...buildEvalRunSummary(allResultRows),
    providerAttempts: spend.requestCount,
  };

  return {
    evaluationSuiteVersion: suite.evaluationVersion,
    engine: 'ask_ri_v2',
    engineCommitSha: gitSha(),
    suiteSourcePath: suitePath,
    baselineComparisonPath: options.baselinePath || DETERMINISTIC_V21_R2_BASELINE,
    model: { identifier: model, pricingNote: 'Prototype eval — see anthropic-eval-budget estimates' },
    executedAt: new Date().toISOString(),
    caseCount: allResultRows.length,
    resumedCaseCount: resumedPartialRows.length,
    caseCountTotalRunnable: runnableCases.length,
    caseCountSelected: allSelectedCases.length,
    caseCountNewThisRun: results.length,
    caseFilter: {
      publicProviderOnly: Boolean(options.publicProviderOnly),
      testIds: options.testIds?.length ? options.testIds : null,
    },
    eligibility: {
      allowedTestIds: allowlist.allowedTestIds,
      blocked: allowlist.blocked,
      eligibleForProvider: allowlist.allowedTestIds.length,
      blockedBeforeTransmission: allowlist.blocked.length,
    },
    spend: serializeSpendForCheckpoint(spend),
    summary,
    resumeFingerprint,
    results: allResultRows,
    safetyChecks: {
      liveAskRiProductionInvoked: false,
      databaseWrites: false,
      stagingDatabaseWrites: false,
      askRiEngineV2ProductionFlag: false,
      liveReasoningEnabled: isV2LiveReasoningEnabled(),
      dryRun: Boolean(options.dryRun),
    },
  };
}
