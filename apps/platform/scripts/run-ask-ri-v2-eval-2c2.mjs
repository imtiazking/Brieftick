#!/usr/bin/env node
/**
 * Phase 2C.2 — live Anthropic V2 evaluation against frozen v2.1 suite (public evidence only).
 *
 * Requires: RI_AI_EXECUTION_ENABLED=true, ANTHROPIC_API_KEY (never logged).
 * Budget: USD $10 hard ceiling (see anthropic-eval-budget.mjs).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runEvalSuiteV2 } from '../lib/ri/eval/run-eval-suite-v2.mjs';
import { REPO_ROOT } from '../lib/ri/eval/eval-paths.mjs';
import { resolveV2EvalModel, V2_EVAL_BUDGET_USD } from '../lib/ri/reasoner/anthropic-eval-budget.mjs';
import { isV2LiveReasoningEnabled } from '../lib/ri/reasoner/invoke-anthropic-reasoner.mjs';

const OUT_REPORT = join(REPO_ROOT, 'docs', 'eval', 'phase-2c2-ask-ri-v2-eval-report.json');
const OUT_MD = join(REPO_ROOT, 'docs', 'eval', 'phase-2c2-ask-ri-v2-completion-report.md');
const PLATFORM_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function loadLocalEnvFile() {
  const candidates = [join(PLATFORM_ROOT, '.env.local'), join(PLATFORM_ROOT, '.env')];
  for (const path of candidates) {
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

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
    execution: r.execution,
    timingMs: r.timingMs,
    answerPreview: String(r.answer || '').slice(0, 400),
    citationCount: r.citations?.length ?? 0,
  }));
  return { ...report, results: slimResults, sanitised: true };
}

function parseArgs(argv) {
  const out = { dryRun: false };
  for (const a of argv) {
    if (a === '--dry-run') out.dryRun = true;
    if (a === '--estimate-only') out.dryRun = true;
  }
  return out;
}

async function main() {
  loadLocalEnvFile();
  const cli = parseArgs(process.argv.slice(2));
  const model = resolveV2EvalModel();

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

  const report = await runEvalSuiteV2({ dryRun: cli.dryRun });

  mkdirSync(dirname(OUT_REPORT), { recursive: true });
  writeFileSync(OUT_REPORT, JSON.stringify(sanitizeEvalReport(report), null, 2));

  const md = [
    '# Phase 2C.2 — Ask RI V2 evaluation report',
    '',
    `- Model: **${model}**`,
    `- Budget ceiling: USD $${V2_EVAL_BUDGET_USD}`,
    `- Eligible for provider: ${report.eligibility.eligibleForProvider}`,
    `- Blocked before transmission: ${report.eligibility.blockedBeforeTransmission}`,
    `- Spend (calculated): USD $${report.spend.calculatedUsd}`,
    `- Tokens in/out: ${report.spend.inputTokens} / ${report.spend.outputTokens}`,
    '',
    'See `phase-2c2-ask-ri-v2-eval-report.json` for per-case diagnostics (sanitised).',
    '',
    '**Operator held-out baseline:** confirm separately — no private held-out files accessed in this run.',
  ].join('\n');
  writeFileSync(OUT_MD, md);

  console.log(
    JSON.stringify({
      ok: true,
      reportJson: OUT_REPORT,
      completionMd: OUT_MD,
      dryRun: cli.dryRun,
      caseCount: report.caseCount,
      spend: report.spend,
      liveReasoning: !cli.dryRun,
    }),
  );
}

main().catch((e) => {
  console.error(JSON.stringify({ ok: false, error: e.message }));
  process.exit(2);
});
