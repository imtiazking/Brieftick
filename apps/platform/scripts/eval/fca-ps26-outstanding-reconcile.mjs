#!/usr/bin/env node
/**
 * Reconcile PS26 outstanding provisions — separate live AI, deterministic completeness, human/instrument ground truth.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../../lib/ri/eval/eval-paths.mjs';
import { assessBatchProvisionCompleteness } from '../../lib/ri/ai/provision-assessment-completeness.mjs';

const INDEP = join(REPO_ROOT, 'docs/eval/FCA-PS26-INDEPENDENT-PROVISION-VERIFICATION-2026-11-23.json');
const SNAPSHOT = join(REPO_ROOT, 'docs/eval/fixtures/PS26-HISTORICAL-RUNS-SNAPSHOT-2026-11-23.json');
const REVISED = join(REPO_ROOT, 'docs/eval/FCA-PS26-ACCURACY-BENCHMARK-REVISED-2026-11-23.json');
const OUT = join(REPO_ROOT, 'docs/eval/FCA-PS26-OUTSTANDING-RECONCILE-2026-11-23.json');

const indep = JSON.parse(readFileSync(INDEP, 'utf8'));
const snapshot = JSON.parse(readFileSync(SNAPSHOT, 'utf8'));
const runs = snapshot.runs || [];

function classifyRun(run) {
  const so = run.structured_output || {};
  const completeness = assessBatchProvisionCompleteness({
    suppliedCores: run.suppliedCores || so._forgeniqGrounding?.instrumentProvisionsNewlySupplied || [],
    candidates: so.candidates || [],
    claims: so.claims || [],
  });
  return {
    runId: run.runId,
    status: run.status,
    spendUsd: run.spendUsd,
    completeness,
    liveAiSucceeded: run.status === 'COMPLETED',
    deterministicOmissions: completeness.omissionCores || [],
  };
}

const runViews = runs.map(classifyRun);
const latestComplete = [...runViews].reverse().find((r) => r.liveAiSucceeded) || runViews[runViews.length - 1];

const outstandingFromBenchmark = JSON.parse(readFileSync(REVISED, 'utf8')).metrics?.unresolvedProvisions || [];

const rows = indep.provisions.map((p) => {
  const core = p.core;
  const inOutstandingList = outstandingFromBenchmark.includes(core);
  const humanReviewed = p.independentReviewerDecision === 'instrument_text_verified' || p.groundTruthSource === 'instrument_parser_not_ai';
  const liveHits = runViews.filter((r) => !(r.deterministicOmissions || []).includes(core));
  const liveStructured = runViews.filter((r) =>
    (r.completeness.assessments || []).some((a) => a.provisionCore === core && a.outcome === 'assessed_structured'),
  );
  const deterministicOnly =
    liveStructured.length === 0 &&
    liveHits.some((r) => (r.completeness.assessments || []).some((a) => a.provisionCore === core));

  let bucket = 'not_attempted_in_live_ai_scope';
  if (liveStructured.length > 0) bucket = 'live_ai_structured_extraction';
  else if (deterministicOnly) bucket = 'deterministic_completeness_only_not_ai_recall';
  else if (inOutstandingList) bucket = 'outstanding_unresolved';
  else if (humanReviewed && p.operativeBindingRequirement) bucket = 'human_instrument_verified_operative';

  return {
    core,
    legalClassificationIndependent: p.legalClassificationIndependent,
    operativeBindingRequirement: p.operativeBindingRequirement,
    humanInstrumentVerified: humanReviewed,
    inBenchmarkOutstandingList: inOutstandingList,
    bucket,
    liveAiStructuredRunIds: liveStructured.map((r) => r.runId),
    mustNotReportAsAiRecall: bucket !== 'live_ai_structured_extraction',
  };
});

const outstandingRows = rows.filter((r) => r.inBenchmarkOutstandingList);

const payload = {
  generatedAt: new Date().toISOString(),
  policy: 'Do not report deterministic assessment coverage as unattended AI recall',
  inventory: indep.counts,
  historicalRunCount: runs.length,
  latestCompletedRun: latestComplete?.runId || null,
  outstandingCount: outstandingRows.length,
  bucketSummary: Object.groupBy(outstandingRows, (r) => r.bucket),
  provisions: rows,
  outstandingDetail: outstandingRows,
  metricsHonest: {
    liveAiStructuredRecallAmongOutstanding: outstandingRows.filter((r) => r.bucket === 'live_ai_structured_extraction').length,
    notCountableAsLiveAiRecallAmongOutstanding: outstandingRows.filter((r) => r.mustNotReportAsAiRecall).length,
    denominatorOutstanding: outstandingRows.length,
  },
};

writeFileSync(OUT, JSON.stringify(payload, null, 2));
console.log(JSON.stringify({ out: OUT, metricsHonest: payload.metricsHonest }, null, 2));