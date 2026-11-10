import { readFileSync } from 'node:fs';
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
import { EvalSpendTracker, resolveV2EvalModel, V2_EVAL_BUDGET_USD } from '../reasoner/anthropic-eval-budget.mjs';
import { scoreEvalCase } from './score-eval-case.mjs';
import { isV2LiveReasoningEnabled } from '../reasoner/invoke-anthropic-reasoner.mjs';
import { classifyV2HarnessOutcome } from '../reasoner/anthropic-provider-diagnostics.mjs';
import { loadLocalEnvFile } from '../reasoner/load-local-env.mjs';

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

  const cases = selectRunnableCases(suite, { includeOperatorHeldOut: false });
  const allowlist = buildPublicEvalAllowlist(cases);
  const baselineMap = loadBaselineMap(options.baselinePath || DETERMINISTIC_V21_R2_BASELINE);

  const model = resolveV2EvalModel(options.model);
  const spend = new EvalSpendTracker({ budgetUsd: options.budgetUsd ?? V2_EVAL_BUDGET_USD, model });

  const index = await buildSemanticIndex(AUTHENTIC_CORPUS_B2_DIR);
  const results = [];
  let providerErrors = 0;
  let blockedBeforeProvider = 0;
  let verificationFailed = 0;
  let publicExecuted = 0;

  for (const caseRow of cases) {
    const engineResult = await runAskRiV2Pipeline(index, caseRow.question, caseRow, {
      spendTracker: spend,
      dryRun: options.dryRun,
      model,
      bm25Attached: false,
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

    results.push({ ...scored, ...engineResult });

    if (engineResult.v2ExecutionStatus === 'BLOCKED_EXPECTED' || engineResult.v2ExecutionStatus === 'BLOCKED_UNEXPECTED') {
      blockedBeforeProvider += 1;
    }
    if (engineResult.v2ExecutionStatus === 'PROVIDER_ERROR') providerErrors += 1;
    if (engineResult.v2ExecutionStatus === 'VERIFICATION_FAILED') verificationFailed += 1;
    if (engineResult.v2ExecutionStatus === 'PUBLIC_ELIGIBLE_EXECUTED') publicExecuted += 1;
    if (spend.stopped) break;
  }

  spend.finalizeCalculated();

  return {
    evaluationSuiteVersion: suite.evaluationVersion,
    engine: 'ask_ri_v2',
    engineCommitSha: gitSha(),
    suiteSourcePath: suitePath,
    baselineComparisonPath: options.baselinePath || DETERMINISTIC_V21_R2_BASELINE,
    model: { identifier: model, pricingNote: 'Prototype eval — see anthropic-eval-budget estimates' },
    executedAt: new Date().toISOString(),
    caseCount: results.length,
    caseCountTotalRunnable: cases.length,
    eligibility: {
      allowedTestIds: allowlist.allowedTestIds,
      blocked: allowlist.blocked,
      eligibleForProvider: allowlist.allowedTestIds.length,
      blockedBeforeTransmission: allowlist.blocked.length,
    },
    spend: spend.toJSON(),
    summary: {
      v2Execution: {
        PUBLIC_ELIGIBLE_EXECUTED: publicExecuted,
        BLOCKED_EXPECTED: results.filter((r) => r.v2ExecutionStatus === 'BLOCKED_EXPECTED').length,
        BLOCKED_UNEXPECTED: results.filter((r) => r.v2ExecutionStatus === 'BLOCKED_UNEXPECTED').length,
        PROVIDER_ERROR: providerErrors,
        VERIFICATION_FAILED: verificationFailed,
        NOT_RUN: results.filter((r) => r.v2ExecutionStatus === 'NOT_RUN').length,
        blockedBeforeProvider,
      },
      outcomes: results.reduce((acc, r) => {
        acc[r.outcome] = (acc[r.outcome] || 0) + 1;
        return acc;
      }, {}),
      preReasonerBlocks: {
        reference_validation: results.filter((r) => r.preReasonerBlock === 'reference_validation').length,
        authority_gate: results.filter((r) => r.preReasonerBlock === 'authority_gate').length,
      },
      engineInsufficientEvidence: results.filter((r) => r.status === 'INSUFFICIENT_EVIDENCE').length,
      pipelineDryRunNotRun: results.filter((r) => r.v2ExecutionStatus === 'NOT_RUN' && r.status === 'NOT_RUN').length,
      harnessOutcomes: results.reduce((acc, r) => {
        const k = r.harnessOutcome || 'UNKNOWN';
        acc[k] = (acc[k] || 0) + 1;
        return acc;
      }, {}),
      providerAttempts: spend.requestCount,
    },
    results,
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
