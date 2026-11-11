#!/usr/bin/env node
/**
 * Phase 2C.2 — V2 evaluation against frozen v2.1 suite (public evidence only).
 *
 * Default: timestamped output under docs/eval/runs/ (does not overwrite historical reports).
 *
 * Usage:
 *   node ./scripts/run-ask-ri-v2-eval-2c2.mjs --dry-run
 *   node ./scripts/run-ask-ri-v2-eval-2c2.mjs --model=claude-haiku-5-5 --out=...
 *   node ./scripts/run-ask-ri-v2-eval-2c2.mjs --dry-run --public-provider-only
 *   node ./scripts/run-ask-ri-v2-eval-2c2.mjs --dry-run --test-ids=EVAL-D-02,EVAL-C-01
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { loadLocalEnvFile } from '../lib/ri/reasoner/load-local-env.mjs';
import { runEvalSuiteV2 } from '../lib/ri/eval/run-eval-suite-v2.mjs';
import { REPO_ROOT, EVAL_SUITE_V21_PATH, AUTHENTIC_CORPUS_B2_DIR } from '../lib/ri/eval/eval-paths.mjs';
import { resolveV2EvalModel, V2_EVAL_BUDGET_USD } from '../lib/ri/reasoner/anthropic-eval-budget.mjs';
import { isV2LiveReasoningEnabled } from '../lib/ri/reasoner/invoke-anthropic-reasoner.mjs';
import { execSync } from 'node:child_process';
import { parseTestIdsArg } from '../lib/ri/eval/eval-case-filter.mjs';

const RUNS_DIR = join(REPO_ROOT, 'docs', 'eval', 'runs');

function sanitizeEvalReport(report) {
  const slimResults = (report.results || []).map((r) => ({
    testId: r.testId,
    outcome: r.outcome,
    engineStatus: r.engineStatus,
    v2ExecutionStatus: r.v2ExecutionStatus,
    deterministicR2Outcome: r.deterministicR2Outcome,
    deterministicR2Status: r.deterministicR2Status,
    v2Diagnostics: r.v2Diagnostics,
    sufficiency: r.sufficiency,
    humanReviewRequired: r.humanReviewRequired,
    providerInvoked: r.providerInvoked,
    preReasonerBlock: r.preReasonerBlock,
    harnessOutcome: r.harnessOutcome,
    regulatoryMeasurement: r.regulatoryMeasurement,
    providerDiagnostics: r.providerDiagnostics || r.v2Diagnostics?.providerDiagnostics,
    execution: r.execution,
    timingMs: r.timingMs,
    answerPreview: String(r.answer || '').slice(0, 400),
    citationCount: r.citations?.length ?? 0,
  }));
  return { ...report, results: slimResults, sanitised: true };
}

function parseArgs(argv) {
  const out = { dryRun: false, model: null, out: null, force: false, publicProviderOnly: false, testIds: null };
  for (const a of argv) {
    if (a === '--dry-run' || a === '--estimate-only') out.dryRun = true;
    else if (a === '--public-provider-only') out.publicProviderOnly = true;
    else if (a.startsWith('--model=')) out.model = a.slice('--model='.length);
    else if (a.startsWith('--out=')) out.out = a.slice('--out='.length);
    else if (a.startsWith('--test-ids=')) out.testIds = parseTestIdsArg(a.slice('--test-ids='.length));
    else if (a === '--force') out.force = true;
  }
  return out;
}

function defaultOutPath({ dryRun, model }) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const mode = dryRun ? 'dry-run' : 'live';
  const safeModel = String(model).replace(/[^a-zA-Z0-9-]+/g, '-');
  return join(RUNS_DIR, `phase-2c2-ask-ri-v2-eval-${mode}-${safeModel}-${stamp}.json`);
}

function loadCorpusVersion() {
  try {
    const manifestPath = join(AUTHENTIC_CORPUS_B2_DIR, 'manifest.json');
    const m = JSON.parse(readFileSync(manifestPath, 'utf8'));
    return { corpus: m.corpus, createdAt: m.createdAt, publicationCount: m.publications?.length ?? null };
  } catch {
    return { corpus: 'authentic-corpus-b2-2b2', createdAt: null, publicationCount: null };
  }
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

  if (!cli.dryRun && !isV2LiveReasoningEnabled()) {
    console.log(
      JSON.stringify({
        ok: false,
        error: 'live_reasoning_disabled',
        hint: 'Set RI_AI_EXECUTION_ENABLED=true and configure ANTHROPIC_API_KEY to run live evaluation.',
      }),
    );
    process.exit(2);
  }

  const outPath = cli.out ? cli.out : defaultOutPath({ dryRun: cli.dryRun, model });
  const checkpointPath = `${outPath}.checkpoint.json`;
  const partialResultsPath = `${outPath}.partial.json`;
  if (existsSync(outPath) && !cli.force) {
    console.error(
      JSON.stringify({
        ok: false,
        error: 'output_exists',
        message: 'Use --out= with a new path or pass --force to overwrite.',
        outPath,
      }),
    );
    process.exit(2);
  }

  const report = await runEvalSuiteV2({
    dryRun: cli.dryRun,
    model,
    checkpointPath,
    partialResultsPath,
    publicProviderOnly: cli.publicProviderOnly,
    testIds: cli.testIds,
  });
  const envelope = {
    ...report,
    runMetadata: {
      executionTimestamp: new Date().toISOString(),
      gitCommitSha: gitSha(),
      modelIdentifier: model,
      evaluationSuiteVersion: report.evaluationSuiteVersion,
      corpusVersion: loadCorpusVersion(),
      runMode: cli.dryRun ? 'dry_run' : 'live_provider',
      providerCallStatus: cli.dryRun ? 'disabled' : isV2LiveReasoningEnabled() ? 'enabled' : 'disabled',
      suiteSourcePath: EVAL_SUITE_V21_PATH,
    },
  };

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(sanitizeEvalReport(envelope), null, 2));

  console.log(
    JSON.stringify({
      ok: true,
      outPath,
      dryRun: cli.dryRun,
      model,
      caseCount: report.caseCount,
      spend: report.spend,
      summary: report.summary,
      liveReasoning: !cli.dryRun,
    }),
  );
}

main().catch((e) => {
  console.error(JSON.stringify({ ok: false, error: e.message }));
  process.exit(2);
});
