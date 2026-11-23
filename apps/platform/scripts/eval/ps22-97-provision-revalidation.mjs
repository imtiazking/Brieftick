#!/usr/bin/env node
/**
 * Revalidate 97 PS22 provisions: structural completeness vs legal classification (post PS22/9 identity fix).
 * Does not mutate historical AI structured_output.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../../lib/ri/eval/eval-paths.mjs';

const OUT = join(REPO_ROOT, 'docs/eval/PS22-9-97-PROVISION-REVALIDATION-2026-11-23.json');
const SOURCE = join(REPO_ROOT, 'docs/eval/PS22-9-SOURCE-PUBLICATION-VERIFICATION-2026-11-23.json');
const BATCH0 = JSON.parse(readFileSync(join(REPO_ROOT, 'docs/eval/PS22-9-CONTINUATION-V2-BATCH0-2026-11-23.json'), 'utf8'));
const BATCH1 = JSON.parse(readFileSync(join(REPO_ROOT, 'docs/eval/PS22-9-CONTINUATION-V2-BATCH1-2026-11-23.json'), 'utf8'));
const RECON = JSON.parse(readFileSync(join(REPO_ROOT, 'docs/eval/PS22-9-PAID-RUN-RECONCILE-FINAL-2026-11-23.json'), 'utf8'));
const source = JSON.parse(readFileSync(SOURCE, 'utf8'));

const expected97 = [
  ...RECON.inventory.preservedCores,
  ...(BATCH0.expectedBatch0 || BATCH0.expectedBatch || []),
  ...(BATCH1.expectedBatch || []),
];
const unique97 = [...new Set(expected97)];

function coresFromRun(evidence) {
  const out = evidence.structured_output || {};
  const completeness = evidence.completeness || out._forgeniqProvisionCompleteness;
  return {
    runId: evidence.runId,
    suffix: evidence.suffix,
    expected: evidence.expectedBatch0 || evidence.expectedBatch || [],
    completeness,
    consultationPreserved: out._forgeniqPublicationRegulatoryContext?.consultationPreserved,
    candidates: out.candidates || [],
  };
}

const runs = [coresFromRun(BATCH0), coresFromRun(BATCH1)];
const historicalMisclassification =
  runs.every((r) => r.consultationPreserved === true) && source.publicationIdentity.publicationType === 'policy_statement';

const provisions = unique97.map((core) => {
  const batch = runs.find((r) => r.expected.includes(core));
  const candidate = batch?.candidates.find((c) => String(c.provisionReference || '').includes(core));
  return {
    core,
    historicalRunId: batch?.runId,
    structuredExtractionPresent: Boolean(candidate),
    historicalPresentationBindingNature: candidate?.bindingNature || null,
    subsequentLegalAssessment: {
      publication: 'PS22/9',
      publicationType: 'policy_statement_final_rules',
      operativeMarker: /R$/i.test(core) ? 'R' : /G$/i.test(core) ? 'G' : /E$/i.test(core) ? 'E' : null,
      legallyVerified: false,
      reason: historicalMisclassification
        ? 'Historical run used consultationPreserved=true; legal presentation requires subsequent assessment under final PS22/9 policy statement rules'
        : 'pending',
      historicalEvidencePreserved: true,
    },
  };
});

const report = {
  generatedAt: new Date().toISOString(),
  sourceSha256: source.sha256,
  sourceIdentity: source.publicationIdentity,
  classificationDefect: {
    id: 'DEF-REG-PS22-SOURCE',
    title: 'PS22/9 PDF misclassified as consultation due to CP21/36 feedback references in text',
    status: 'FIXED AND TESTED',
    commitPending: 'regulatory-pdf-analysis.mjs',
  },
  provisionCount: unique97.length,
  structuredCompleteness: {
    batch0: BATCH0.completeness?.batchCompletenessOk,
    batch1: BATCH1.completeness?.batchCompletenessOk,
    note: 'Structured extraction completeness for paid batches is separate from legal verification',
  },
  legallyVerifiedCount: 0,
  assertion:
    'The 97 completed assessments MUST NOT be reported as legally verified until subsequent assessment under corrected publication classification.',
  provisions,
  focusProvisions: provisions.filter((p) => ['2A.2.14R', '2A.2.26R'].includes(p.core)),
};

writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ out: OUT, count: unique97.length, legallyVerified: 0, historicalMisclassification }, null, 2));