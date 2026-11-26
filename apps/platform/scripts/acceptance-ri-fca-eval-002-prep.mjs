#!/usr/bin/env node
/**
 * FCA-EVAL-002 preparation acceptance (deterministic, no paid AI).
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mapImpactSuggestionToDraftFields } from '../lib/ri/ai/impact-suggestion-mapper.mjs';
import { applyImpactMaterialityPolicy, UNASSESSED } from '../lib/ri/ai/impact-materiality-policy.mjs';
import { buildRegulatoryEvidencePack } from '../lib/ri/ai/lifecycle-evidence.mjs';
import { buildConc7201rInterpretationMemo } from '../lib/ri/ai/regulatory-interpretation-conc-7-20-1r.mjs';
import {
  RUN_REFERENCE,
  PROPOSED_BUDGET_USD,
  PROPOSED_MAX_REQUESTS,
  ACCEPTANCE_CRITERIA,
  buildPrepPackage,
} from './eval/fca-eval-002-live-pilot-prep.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..');
const PREP_DIR = join(repoRoot, 'docs/uat/evidence/fca-eval-002-prep');

let failures = 0;
const check = (name, ok, detail) => {
  if (ok) console.log(`PASS: ${name}`);
  else {
    failures += 1;
    console.error(`FAIL: ${name}${detail ? ` — ${detail}` : ''}`);
  }
};

const pack = buildRegulatoryEvidencePack({
  obligation_statement: 'CONC 7.20.1R duty',
  citation: 'CONC 7.20.1R',
  effective_date: '2026-07-15',
  metadata: {
    provisionReference: 'CONC 7.20.1R',
    provisionBreakdown: {
      standaloneObligationPaths: ['CONC 7.20.1R(2)(a)', 'CONC 7.20.1R(2)(b)', 'CONC 7.20.1R(3)'],
      limbs: [{ text: 'notify the borrower', reference: 'CONC 7.20.1R(2)(a)' }],
      expertJudgement: [{ id: 'timing_as_soon_as_possible' }],
    },
  },
});

const highConfidenceLowDims = mapImpactSuggestionToDraftFields({
  structured: { confidence: 99, dimensions: ['Compliance'], claims: [] },
  evidencePack: pack,
});
check(
  'materiality is UNASSESSED without organisational evidence even at 99% model confidence',
  highConfidenceLowDims.materiality === UNASSESSED && highConfidenceLowDims.stage2Metadata.aiConfidenceNotUsedForMateriality === true,
  highConfidenceLowDims.materiality,
);
check(
  'complexity uses evidence pack not dimension count',
  highConfidenceLowDims.implementation_complexity.includes('provisional') &&
    highConfidenceLowDims.stage2Metadata.materialityAssessment.rejectedHeuristics.includes('model_confidence_percent'),
  highConfidenceLowDims.implementation_complexity,
);

const withOrg = mapImpactSuggestionToDraftFields({
  structured: { confidence: 50, dimensions: [], claims: [] },
  evidencePack: pack,
  organisationalEvidence: {
    businessAreasAffected: 'Retail lending',
    customerAccountsInScope: '120000',
    materialityRationale: 'High volume deferred payment credit borrowers; missed-payment notices are customer-facing regulatory breach risk.'.padEnd(80, '.'),
    materialityLevel: 'HIGH',
    humanApproved: false,
  },
});
check(
  'materiality becomes org-evidence-supported when organisational fields and rationale supplied',
  withOrg.materiality.includes('org-evidence-supported') &&
    withOrg.stage2Metadata.materialityAssessment.organisationalEvidenceSupplied === true,
  withOrg.materiality,
);

const policy = applyImpactMaterialityPolicy({ structured: { confidence: 100, dimensions: ['A', 'B', 'C', 'D'] }, evidencePack: null });
check('no evidence pack → both ratings unassessed', policy.materiality === UNASSESSED && policy.implementation_complexity === UNASSESSED);

const memo = await buildConc7201rInterpretationMemo();
check('interpretation memo lists explicit requirements for (1)–(4)', memo.explicitRequirements.length >= 5);
check(
  'as soon as possible is escalated without invented deadline',
  memo.interpretativeTopics.some((t) => t.id === 'timing_as_soon_as_possible' && t.explicitDeadlineInSource === false && t.escalationRequired),
);
check('commencement resolved to 2026-07-15', memo.commencement?.commencementDate === '2026-07-15');
check('expert escalations present', memo.escalationsForExpertReview.length >= 5);

await buildPrepPackage();
const pkgPath = join(PREP_DIR, 'PREP-PACKAGE.json');
const mdPath = join(PREP_DIR, 'READINESS-FOR-SECOND-LIVE-EVALUATION.md');
check('prep package written', existsSync(pkgPath) && existsSync(mdPath));
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
check('run reference and budget documented', pkg.runReference === RUN_REFERENCE && pkg.proposedBudgetUsd === PROPOSED_BUDGET_USD && pkg.proposedMaxRequests === PROPOSED_MAX_REQUESTS);
check('acceptance criteria complete', pkg.acceptanceCriteria.length === ACCEPTANCE_CRITERIA.length && pkg.paidAiCallsInPrep === 0);

if (failures) {
  console.error(`fca-eval-002-prep: ${failures} failure(s)`);
  process.exit(1);
}
console.log('PASS acceptance-ri-fca-eval-002-prep');