#!/usr/bin/env node
/**
 * Revised FCA PS26/1 benchmark — separate ID, legal, obligation metrics (no paid AI).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../../lib/ri/eval/eval-paths.mjs';
import {
  assessBatchProvisionCompleteness,
  suppliedProvisionCoresFromGrounding,
} from '../../lib/ri/ai/provision-assessment-completeness.mjs';

const INDEP = join(REPO_ROOT, 'docs/eval/FCA-PS26-INDEPENDENT-PROVISION-VERIFICATION-2026-11-23.json');
const SNAPSHOT = join(REPO_ROOT, 'docs/eval/fixtures/PS26-HISTORICAL-RUNS-SNAPSHOT-2026-11-23.json');
const FIVE = ['4.2A.3R', '4.2A.6R', '4.2A.7R', '7.20.3R', '7.20.1R'];
const OUT = join(REPO_ROOT, 'docs/eval/FCA-PS26-ACCURACY-BENCHMARK-REVISED-2026-11-23.json');

const indep = JSON.parse(readFileSync(INDEP, 'utf8'));
const snapshot = JSON.parse(readFileSync(SNAPSHOT, 'utf8'));
const r28 = indep.provisions.filter((p) => p.legalClassificationIndependent === 'binding_requirement');
const g19 = indep.provisions.filter((p) => p.legalClassificationIndependent === 'guidance');

const latest = snapshot.runs?.[snapshot.runs.length - 1]?.structured_output || {};
const supplied = suppliedProvisionCoresFromGrounding(latest._forgeniqGrounding || {});
const ai = assessBatchProvisionCompleteness({
  suppliedCores: supplied.length ? supplied : FIVE,
  candidates: latest.candidates || [],
  claims: latest.claims || [],
});

const five = FIVE.map((core) => {
  const ind = indep.provisions.find((p) => p.core === core);
  const a = ai.assessments.find((x) => x.provisionCore === core);
  return {
    core,
    legalEvidence: ind?.independentReviewerDecision || 'instrument_parser_not_ai',
    operativeBindingVerified: ind?.operativeBindingRequirement === true,
    aiOutcome: a?.outcome || 'not_in_supplied_scope',
    strictTp4_2A_3R:
      core === '4.2A.3R' ? a?.outcome === 'assessed_structured' && (latest.candidates || []).some((c) => /4\.2A\.3/.test(c.sourceQuotation || c.statement || '')) : null,
  };
});

const payload = {
  generatedAt: new Date().toISOString(),
  inventory: { rProvisions: r28.length, gProvisions: g19.length, total: indep.provisions.length },
  metrics: {
    provisionIdentificationRecall28R: null,
    operativeBindingRecallFiveVerified: five.filter((f) => f.aiOutcome !== 'omitted' && f.aiOutcome !== 'not_in_supplied_scope')
      .length,
    operativeBindingRecallDenominator: FIVE.length,
    obligationExtractionRecallFive: five.filter((f) => f.aiOutcome === 'assessed_structured').length,
    unsupportedBindingClassifications: (latest.candidates || []).filter((c) => c.bindingNature === 'binding_requirement' && !c.provisionReference).length,
    humanCorrectionRate: null,
    unresolvedProvisions: ai.omissionCores,
    quotationAccuracy: 'requires_provisionReference_plus_set_out_quotation — 4.2A.3R text_hit_without_structured_provisionReference on historical runs',
  },
  fiveOperativeVerification: five,
  strictTruePositive4_2A_3R: {
    identifiedInAiOutput: five[0].aiOutcome !== 'omitted',
    structuredProvisionReference: (latest.candidates || []).some((c) => String(c.provisionReference || '').includes('4.2A.3R')),
    verdict: 'PARTIAL — text/quotation cites 4.2A.3R duties; structured provisionReference historically absent',
  },
  policyNote: 'R marker alone does not create obligation; benchmark uses independent verification JSON',
};
writeFileSync(OUT, JSON.stringify(payload, null, 2));
console.log(JSON.stringify({ out: OUT, metrics: payload.metrics }, null, 2));