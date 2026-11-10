#!/usr/bin/env node
/**
 * Single-case Anthropic V2 smoke test (public FCA eval question only).
 * Budget ceiling: USD $0.25 by default (ASK_RI_V2_SMOKE_BUDGET_USD).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { loadLocalEnvFile } from '../lib/ri/reasoner/load-local-env.mjs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { readFileSync as read } from 'node:fs';
import { AUTHENTIC_CORPUS_B2_DIR, EVAL_SUITE_V21_PATH, REPO_ROOT } from '../lib/ri/eval/eval-paths.mjs';
import { buildSemanticIndex } from '../lib/ri/semantic/semantic-retrieval-eval.mjs';
import { runAskRiV2Pipeline } from '../lib/ri/reasoner/run-ask-ri-v2-pipeline.mjs';
import { EvalSpendTracker } from '../lib/ri/reasoner/anthropic-eval-budget.mjs';
import { resolveV2EvalModel } from '../lib/ri/reasoner/anthropic-eval-budget.mjs';
import { getAnthropicApiKey, validateAnthropicApiKeyFormat } from '../lib/ri/ai/anthropic-provider-core.mjs';
import { validateReasonerOutput } from '../lib/ri/reasoner/reasoner-output-schema.mjs';

const RUNS_DIR = join(REPO_ROOT, 'docs', 'eval', 'runs');
const SMOKE_CASE_ID = process.env.ASK_RI_V2_SMOKE_CASE_ID || 'EVAL-D-02';
const SMOKE_BUDGET = Number(process.env.ASK_RI_V2_SMOKE_BUDGET_USD || 0.25);

function parseArgs(argv) {
  const out = { model: null };
  for (const a of argv) {
    if (a.startsWith('--model=')) out.model = a.slice('--model='.length);
    if (a.startsWith('--case=')) process.env.ASK_RI_V2_SMOKE_CASE_ID = a.slice('--case='.length);
  }
  return out;
}

function gitSha() {
  try {
    return execSync('git rev-parse HEAD', { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

async function main() {
  loadLocalEnvFile();
  const cli = parseArgs(process.argv.slice(2));
  const model = resolveV2EvalModel(cli.model);
  const apiKeyPresent = Boolean(getAnthropicApiKey());
  const keyFormatOk = validateAnthropicApiKeyFormat();
  process.env.RI_AI_EXECUTION_ENABLED = 'true';

  const suite = JSON.parse(read(EVAL_SUITE_V21_PATH, 'utf8'));
  const caseRow = suite.cases.find((c) => c.testId === (process.env.ASK_RI_V2_SMOKE_CASE_ID || SMOKE_CASE_ID));
  if (!caseRow?.question) throw new Error('smoke_case_not_found');

  const index = await buildSemanticIndex(AUTHENTIC_CORPUS_B2_DIR);
  const spend = new EvalSpendTracker({ budgetUsd: SMOKE_BUDGET, model });

  const result = await runAskRiV2Pipeline(index, caseRow.question, caseRow, {
    model,
    dryRun: false,
    spendTracker: spend,
  });
  spend.finalizeCalculated();

  const schemaOk =
    result.modelOutput && validateReasonerOutput(result.modelOutput).ok
      ? true
      : result.modelOutput
        ? false
        : null;

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outPath = join(RUNS_DIR, `phase-2c2-ask-ri-v2-smoke-${model}-${stamp}.json`);

  const report = {
    smokeTest: true,
    testId: caseRow.testId,
    questionCategory: caseRow.questionCategory,
    gitCommitSha: gitSha(),
    model,
    auth: {
      apiKeyPresent,
      keyFormatOk,
      executionEnabled: process.env.RI_AI_EXECUTION_ENABLED === 'true',
    },
    provider: {
      invoked: result.providerInvoked,
      diagnostics: result.providerDiagnostics || null,
      usage: result.execution?.usage || null,
    },
    structuredOutputValidation: schemaOk,
    citationVerification: result.verification
      ? { ok: result.verification.ok, failureCount: result.verification.failures?.length ?? 0 }
      : null,
    spend: spend.toJSON(),
    pipeline: {
      v2ExecutionStatus: result.v2ExecutionStatus,
      status: result.status,
      sufficiency: result.sufficiency,
      evidenceChunkCount: result.evidenceBundle?.chunkIds?.length ?? 0,
    },
    answerPreview: String(result.answer || '').slice(0, 600),
  };

  mkdirSync(RUNS_DIR, { recursive: true });
  writeFileSync(outPath, JSON.stringify(report, null, 2));

  const hardFail = result.v2ExecutionStatus === 'PROVIDER_ERROR' || result.v2ExecutionStatus === 'OUTPUT_TRUNCATED';
  console.log(JSON.stringify({ ok: !hardFail, outPath, report }, null, 2));
  process.exit(hardFail ? 2 : 0);
}

main().catch((e) => {
  console.error(JSON.stringify({ ok: false, error: e.message }));
  process.exit(2);
});
