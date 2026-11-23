#!/usr/bin/env node
/** Taxonomy for 29 outstanding PS26 provisions — instrument evidence vs AI omission. */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../../lib/ri/eval/eval-paths.mjs';
import { assessBatchProvisionCompleteness } from '../../lib/ri/ai/provision-assessment-completeness.mjs';

const INDEP = join(REPO_ROOT, 'docs/eval/FCA-PS26-INDEPENDENT-PROVISION-VERIFICATION-2026-11-23.json');
const SNAPSHOT = join(REPO_ROOT, 'docs/eval/fixtures/PS26-HISTORICAL-RUNS-SNAPSHOT-2026-11-23.json');
const OUTSTANDING = join(REPO_ROOT, 'docs/eval/FCA-PS26-OUTSTANDING-RECONCILE-2026-11-23.json');
const OUT = join(REPO_ROOT, 'docs/eval/FCA-PS26-OUTSTANDING-TAXONOMY-2026-11-23.json');

const indep = JSON.parse(readFileSync(INDEP, 'utf8'));
const snapshot = JSON.parse(readFileSync(SNAPSHOT, 'utf8'));
const outstandingCores = JSON.parse(readFileSync(OUTSTANDING, 'utf8')).outstandingDetail.map((r) => r.core);

function operativeBinding(p) {
  return p?.operativeBindingRequirement === true;
}

function classifyInstrument(p) {
  if (p.operativeBindingRequirement === true && p.legalClassificationIndependent === 'binding_requirement') {
    return 'operative_binding_requirement';
  }
  if (p.legalClassificationIndependent === 'guidance' || p.markerInInstrument === 'G') {
    return 'guidance';
  }
  const amend = String(p.amendmentOrTransitional || '');
  if (/AMENDMENT|TRANSITIONAL|NEW_TEXT|UNCERTAIN/i.test(amend)) {
    return 'amendment_or_transitional';
  }
  if (/^TP\s/i.test(p.core)) {
    return 'transitional_provision_TP';
  }
  if (p.mustNotClassifyAsBinding === true) {
    return 'legitimate_non_binding_exception';
  }
  return 'scope_applicability_or_other';
}

const runViews = (snapshot.runs || []).map((run) => {
  const so = run.structured_output || {};
  const supplied = so._forgeniqGrounding?.instrumentProvisionsNewlySupplied || [];
  const completeness = assessBatchProvisionCompleteness({
    suppliedCores: supplied,
    candidates: so.candidates || [],
    claims: so.claims || [],
  });
  return { runId: run.runId, status: run.status, completeness };
});

const rows = outstandingCores.map((core) => {
  const p = indep.provisions.find((x) => x.core === core);
  if (!p) {
    return { core, error: 'missing_independent_verification', taxonomy: 'unknown' };
  }
  const instrumentClass = classifyInstrument(p);
  const liveStructured = runViews.some((rv) =>
    (rv.completeness.assessments || []).some((a) => a.provisionCore === core && a.outcome === 'assessed_structured'),
  );
  const liveOmitted = runViews.some((rv) => (rv.completeness.omissionCores || []).includes(core));
  const deterministicOnly = liveOmitted || (!liveStructured && runViews.length > 0);

  let aiExtractionFinding = 'not_structured_in_historical_live_runs';
  if (liveStructured) aiExtractionFinding = 'live_ai_structured_present';
  else if (instrumentClass === 'legitimate_non_binding_exception' || instrumentClass === 'guidance') {
    aiExtractionFinding = 'possible_legitimate_non_extraction_target';
  } else if (operativeBinding(p) && !liveStructured) {
    aiExtractionFinding = 'ai_extraction_omission_candidate';
  }

  return {
    core,
    instrumentClass,
    operativeBinding: p.operativeBindingRequirement === true,
    legalClass: p.legalClassificationIndependent,
    amendmentOrTransitional: p.amendmentOrTransitional,
    applicability: p.applicability,
    humanInstrumentVerified: p.independentReviewerDecision === 'instrument_text_verified',
    liveAiStructuredRecall: liveStructured,
    deterministicCompletenessSignal: deterministicOnly,
    aiExtractionFinding,
    reportStructuredRecallSeparately: true,
    mustNotCountAsUnattendedAiRecall: !liveStructured,
  };
});

const summary = {
  operative_binding_requirement: rows.filter((r) => r.instrumentClass === 'operative_binding_requirement').length,
  guidance: rows.filter((r) => r.instrumentClass === 'guidance').length,
  amendment_or_transitional: rows.filter((r) => r.instrumentClass === 'amendment_or_transitional').length,
  transitional_provision_TP: rows.filter((r) => r.instrumentClass === 'transitional_provision_TP').length,
  legitimate_non_binding_exception: rows.filter((r) => r.instrumentClass === 'legitimate_non_binding_exception').length,
  scope_applicability_or_other: rows.filter((r) => r.instrumentClass === 'scope_applicability_or_other').length,
  ai_omission_candidates: rows.filter((r) => r.aiExtractionFinding === 'ai_extraction_omission_candidate').length,
  liveStructuredRecallAmongOutstanding: rows.filter((r) => r.liveAiStructuredRecall).length,
};

writeFileSync(
  OUT,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      policy: 'Structured extraction recall reported separately from deterministic completeness',
      outstandingCount: rows.length,
      summary,
      provisions: rows,
    },
    null,
    2,
  ),
);
console.log(JSON.stringify({ out: OUT, summary }, null, 2));