#!/usr/bin/env node
/**
 * Offline Ask RI evaluation harness — deterministic engine only.
 * Never calls askRiProduction, live APIs, or AI providers.
 *
 * Usage:
 *   node ./scripts/run-ask-ri-eval-suite.mjs
 *   node ./scripts/run-ask-ri-eval-suite.mjs --suite=/path/to/private-suite.json --out=/path/to/results.json
 */
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { execSync } from 'node:child_process';
import { runAskRiDeterministic } from '../lib/ri/ask-ri/run-ask-ri.mjs';
import { questionMentionsPublicationReference } from '../lib/ri/ask-ri/publication-pdf-question-match.mjs';
import { EVAL_SUITE_PATH, BASELINE_DIR, REPO_ROOT } from '../lib/ri/eval/eval-paths.mjs';
import { loadEvidencePackIndex, hydrateStateFromPacks } from '../lib/ri/eval/load-evidence-packs.mjs';
import { scoreEvalCase } from '../lib/ri/eval/score-eval-case.mjs';
import { createEvalTenantState } from '../lib/ri/eval/tenant-fixture-v1.mjs';
import { validateEvalSuite, selectRunnableCases } from '../lib/ri/eval/validate-eval-suite.mjs';

function parseArgs(argv) {
  const out = { engine: 'deterministic', suite: null, out: null, includeHeldOut: false, quiet: false };
  for (const a of argv) {
    if (a.startsWith('--engine=')) out.engine = a.split('=')[1];
    else if (a.startsWith('--suite=')) out.suite = a.slice('--suite='.length);
    else if (a.startsWith('--out=')) out.out = a.slice('--out='.length);
    else if (a === '--include-operator-held-out') out.includeHeldOut = true;
    else if (a === '--quiet') out.quiet = true;
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

function caseEvidenceAvailable(caseRow, packIndex) {
  const ids = caseRow.expectedPublicationIds || [];
  if (!ids.length) return true;
  return ids.every((id) => packIndex.byPublicationId.has(id));
}

function aggregateOutcomes(results) {
  const counts = {
    PASS: 0,
    PARTIAL_PASS: 0,
    FAIL: 0,
    CORRECT_INSUFFICIENT_EVIDENCE: 0,
    NOT_RUN: 0,
    NOT_MEASURED: 0,
    AWAITING_SME_REVIEW: 0,
  };
  for (const r of results) counts[r.outcome] = (counts[r.outcome] || 0) + 1;
  return counts;
}

function aggregateByCategory(results) {
  const by = {};
  for (const r of results) {
    const cat = r.questionCategory || '?';
    by[cat] = by[cat] || { PASS: 0, PARTIAL_PASS: 0, FAIL: 0, CORRECT_INSUFFICIENT_EVIDENCE: 0, NOT_RUN: 0 };
    by[cat][r.outcome] = (by[cat][r.outcome] || 0) + 1;
  }
  return by;
}

function aggregateDimensions(results, suite) {
  const dimIds = suite.scoringDimensions.map((d) => d.id);
  const summary = {};
  for (const id of dimIds) {
    const numeric = [];
    let awaiting = 0;
    let notMeasured = 0;
    for (const r of results) {
      const v = r.dimensions?.[id];
      if (v === 'AWAITING_SME_REVIEW') awaiting += 1;
      else if (v === 'NOT_MEASURED') notMeasured += 1;
      else if (typeof v === 'number') numeric.push(v);
    }
    summary[id] = {
      automatableMean: numeric.length ? numeric.reduce((a, b) => a + b, 0) / numeric.length : null,
      automatableSamples: numeric.length,
      awaitingSmeReview: awaiting,
      notMeasured,
    };
  }
  return summary;
}

function loadSuite(suitePath, { includeHeldOut }) {
  const abs = resolve(suitePath);
  const raw = readFileSync(abs, 'utf8');
  const doc = JSON.parse(raw);
  const isRepoDefault = resolve(abs) === resolve(EVAL_SUITE_PATH);
  const validation = validateEvalSuite(doc, {
    allowOperatorHeldOut: true,
    requireQuestions: includeHeldOut || !isRepoDefault,
  });
  if (!validation.ok) {
    throw new Error(`invalid_eval_suite: ${validation.errors.join('; ')}`);
  }
  if (isRepoDefault && includeHeldOut) {
    throw new Error('operator_held_out_must_use_external_suite');
  }
  const cases = selectRunnableCases(doc, { includeOperatorHeldOut: includeHeldOut });
  if (!cases.length) throw new Error('no_runnable_cases');
  return { suite: doc, suitePath: abs, cases, isRepoDefault };
}

export function runEvalSuite(options) {
  const engine = options.engine || 'deterministic';
  if (engine !== 'deterministic') throw new Error('unsupported_engine');

  const { suite, suitePath, cases, isRepoDefault } = loadSuite(
    options.suitePath || EVAL_SUITE_PATH,
    { includeHeldOut: options.includeHeldOut },
  );
  const packIndex = loadEvidencePackIndex();
  const tenantState = createEvalTenantState();

  const results = [];
  const criticalFailures = [];
  const missingEvidence = [];

  for (const caseRow of cases) {
    const question = caseRow.question || '';
    const simulateCatalogueAttach = questionMentionsPublicationReference(question);
    const evidenceAvailable = caseEvidenceAvailable(caseRow, packIndex);
    if (!evidenceAvailable) {
      missingEvidence.push({ testId: caseRow.testId, expectedPublicationIds: caseRow.expectedPublicationIds });
    }

    const state = hydrateStateFromPacks(caseRow, packIndex, tenantState, { simulateCatalogueAttach });
    const engineResult = runAskRiDeterministic(state, question);
    const scored = scoreEvalCase(caseRow, engineResult, { simulateCatalogueAttach, evidenceAvailable });
    scored.questionCategory = caseRow.questionCategory;
    scored.expectedResultClassification = caseRow.expectedResultClassification;
    scored.engine = engine;
    scored.providerUsed = engineResult?.execution?.providerUsed ?? false;
    results.push(scored);
    if (scored.criticalFailures?.length) {
      criticalFailures.push({ testId: caseRow.testId, failures: scored.criticalFailures });
    }
  }

  const report = {
    evaluationSuiteVersion: suite.evaluationVersion,
    engine: 'deterministic_v1',
    engineCommitSha: gitSha(),
    suiteSourcePath: suitePath,
    suiteIsRepoDefault: isRepoDefault,
    evidencePackHashes: packIndex.packHashes,
    evidenceManifest: packIndex.manifest,
    executedAt: new Date().toISOString(),
    caseCount: results.length,
    heldOutExcluded: isRepoDefault ? suite.datasetMetadata?.operatorHeldOutCount ?? 10 : 0,
    results,
    summary: {
      outcomes: aggregateOutcomes(results),
      byCategory: aggregateByCategory(results),
      byDimension: aggregateDimensions(results, suite),
      criticalFailureInstances: criticalFailures,
      missingEvidence,
      unmeasured: {
        regulatoryInterpretation: 'AWAITING_SME_REVIEW',
        tenantSecurityD11: 'NOT_MEASURED',
        crossDomainD10: 'NOT_MEASURED',
        hallucinationDetection: 'NOT_AUTOMATABLE',
      },
    },
    safetyChecks: {
      liveApiCalls: false,
      aiProviderCalls: false,
      databaseWrites: false,
      storageWrites: false,
      askRiProductionInvoked: false,
    },
  };

  return report;
}

function main() {
  const cli = parseArgs(process.argv.slice(2));
  if (cli.engine !== 'deterministic') {
    console.error('Only --engine=deterministic is supported');
    process.exit(2);
  }

  let report;
  try {
    report = runEvalSuite({
      engine: cli.engine,
      suitePath: cli.suite,
      includeHeldOut: cli.includeHeldOut,
    });
  } catch (e) {
    console.error(JSON.stringify({ ok: false, error: e.message }, null, 2));
    process.exit(2);
  }

  const defaultOut = `${BASELINE_DIR}/deterministic-v1-2026-11-10.json`;
  const outPath = cli.out ? resolve(cli.out) : defaultOut;
  const outDir = dirname(outPath);
  if (outDir) mkdirSync(outDir, { recursive: true });
  writeFileSync(outPath, JSON.stringify(report, null, 2));

  const payload = {
    ok: true,
    outPath,
    caseCount: report.caseCount,
    outcomes: report.summary.outcomes,
    missingEvidence: report.summary.missingEvidence.length,
    criticalFailures: report.summary.criticalFailureInstances.length,
  };
  if (!cli.quiet) {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    console.log(JSON.stringify(payload));
  }
}

main();
