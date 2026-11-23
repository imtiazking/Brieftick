#!/usr/bin/env node
/**
 * Provision-level accuracy vs independent benchmark (recorded PS26 outputs only).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../../lib/ri/eval/eval-paths.mjs';
import { parseProvisionReference } from '../../lib/ri/classification/provision-eligibility.mjs';

const BENCH = join(REPO_ROOT, 'docs', 'eval', 'FCA-REGULATORY-BENCHMARK-2026-11-23.json');
const INDEP = join(REPO_ROOT, 'docs', 'eval', 'FCA-PS26-INDEPENDENT-PROVISION-VERIFICATION-2026-11-23.json');
const RECORDED = join(REPO_ROOT, 'docs', 'eval', 'FCA-EXTRACTION-ACCURACY-BENCHMARK-2026-11-23.json');
const OUT = join(REPO_ROOT, 'docs', 'eval', 'FCA-BINDING-ACCURACY-DETERMINISTIC-2026-11-23.json');

const bench = JSON.parse(readFileSync(BENCH, 'utf8'));
const indep = JSON.parse(readFileSync(INDEP, 'utf8'));
const recorded = JSON.parse(readFileSync(RECORDED, 'utf8'));

const goldBindingCores = new Set(
  indep.provisions
    .filter((p) => p.legalClassificationIndependent === 'binding_requirement' && p.authoritativeCitationFound)
    .map((p) => p.core),
);
const humanVerifiedCores = new Set(
  bench.entries.filter((e) => e.independentBindingVerified).map((e) => e.core),
);

function normCore(ref) {
  const p = parseProvisionReference(ref);
  return p?.core || String(ref || '').replace(/^CONC\s+/i, '').replace(/\s+/g, '');
}

const emittedBinding = new Set();
for (const row of recorded.perProvision || []) {
  if (row.recalled) emittedBinding.add(row.core);
}

let tp = 0;
let fn = 0;
for (const core of goldBindingCores) {
  if (emittedBinding.has(core)) tp += 1;
  else fn += 1;
}

const fpUnverifiedBindingClaims = (recorded.emittedBindingCandidateCount || 0) - (recorded.emittedBindingCandidateCountOnGold || 0);

const payload = {
  generatedAt: new Date().toISOString(),
  methodology:
    'Recall on 28 parser-verified R provisions with PDF page location (independent instrument text). Separate human-verified subset (n=3). Precision uses gold-touching claims only.',
  counts: {
    truePositives: tp,
    falseNegatives: fn,
    goldBindingInstrumentVerified: goldBindingCores.size,
    goldBindingHumanVerified: humanVerifiedCores.size,
    falsePositivesUnverifiedBindingClaims: fpUnverifiedBindingClaims,
    benchmarkInventoryEntries: bench.entryCount,
    parserBindingRCount: bench.breakdown?.bindingR,
  },
  metrics: {
    bindingRequirementRecallInstrumentR28: goldBindingCores.size ? tp / goldBindingCores.size : null,
    bindingRequirementRecallHumanVerifiedN3: (() => {
      let t = 0;
      for (const c of humanVerifiedCores) if (emittedBinding.has(c)) t += 1;
      return humanVerifiedCores.size ? t / humanVerifiedCores.size : null;
    })(),
    bindingRequirementPrecisionOnGoldTouchingClaims:
      recorded.emittedBindingCandidateCountOnGold != null && recorded.emittedBindingCandidateCountOnGold > 0
        ? tp / recorded.emittedBindingCandidateCountOnGold
        : null,
    legacyHarnessPrecision: recorded.metrics?.bindingRequirementPrecision,
    legacyHarnessRecall: recorded.metrics?.bindingRequirementRecall,
  },
  interpretation: [
    'Legacy 8.5% precision used all binding-shaped claims vs 3 gold rules — statistically misleading.',
    'Expand independentBindingVerified set before production thresholds apply.',
  ],
  productionReady: false,
};

writeFileSync(OUT, JSON.stringify(payload, null, 2));
console.log(JSON.stringify(payload, null, 2));