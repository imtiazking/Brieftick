#!/usr/bin/env node
/**
 * FCA-EVAL-002 preparation (no paid AI). Builds expected outcomes, acceptance criteria,
 * regulatory interpretation memo, and mock five-stage validation contract for authorisation request.
 */
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildConc7201rInterpretationMemo } from '../../lib/ri/ai/regulatory-interpretation-conc-7-20-1r.mjs';
import { breakDownProvision, extractProvisionText } from '../../lib/ri/ai/provision-breakdown.mjs';
import { parsePdfPhysicalPages } from '../../../../integrations/regulatory-sources/core/pdf-physical-page-parser.mjs';
import { legalRecordForProvision } from '../../lib/ri/ai/provision-legal-status.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../../..');
const PREP_DIR = join(repoRoot, 'docs/uat/evidence/fca-eval-002-prep');
mkdirSync(PREP_DIR, { recursive: true });

export const RUN_REFERENCE = 'pilot-fca-eval-002-conc-7-20-1r';
export const PROPOSED_BUDGET_USD = 0.75;
export const PROPOSED_MAX_REQUESTS = 8;
export const PROPOSED_STAGE_REQUESTS = 5;
export const PUBLICATION_ID = '829c5472-953a-40ff-9628-947afbfe4e7a';
export const TARGET_CORES = ['7.20.1R'];

export const ACCEPTANCE_CRITERIA = [
  'correct_provision_level_legal_classification',
  'correct_effective_dates_with_provenance',
  'no_missing_mandatory_requirements_in_scope',
  'no_fabricated_obligations',
  'no_fabricated_regulatory_citations',
  'complete_requirement_to_control_traceability',
  'evidence_based_or_provisional_risk_ratings',
  'proposed_controls_not_presented_as_existing',
  'complete_assurance_procedures_without_truncation',
  'unresolved_interpretations_escalated',
  'full_human_review_and_maker_checker_auditability',
];

export const CAPTURE_REQUIREMENTS = [
  'raw_provider_response_per_stage',
  'structured_output_json',
  'source_quotations_and_citations',
  'validateStageClaims_results',
  'processing_duration_ms',
  'input_output_token_counts',
  'settled_usd_per_request_and_total',
];

function expectedOutcomes(legal, breakdown) {
  return {
    provision: 'CONC 7.20.1R',
    legalClassification: 'final_made_rule',
    instrumentStatus: 'made',
    effectiveDate: legal.commencement?.commencementDate ?? null,
    commencementBasis: legal.commencement?.basis ?? null,
    standaloneObligationPaths: breakdown.standaloneObligationPaths,
    applicabilityPaths: breakdown.applicabilityPaths,
    definitionPaths: breakdown.definitionPaths,
    expertJudgementIds: (breakdown.expertJudgement ?? []).map((e) => e.id),
    mandatoryLimbsVerbatim: (breakdown.limbs ?? [])
      .filter((l) => l.standaloneObligation)
      .map((l) => ({ reference: l.reference, kind: l.kind })),
  };
}

export async function buildPrepPackage() {
  const pdfPath = resolve(repoRoot, 'integrations/regulatory-sources/fixtures/fca-ps26-1-official.pdf');
  const parsed = await parsePdfPhysicalPages(readFileSync(pdfPath));
  const pages = parsed.pages.map((p) => ({ pageNumber: p.pageNumber, text: p.text }));
  const legal = legalRecordForProvision({ pages, provisionReference: 'CONC 7.20.1R' });
  const ex = extractProvisionText(pages, '7.20.1R');
  const breakdown = ex ? breakDownProvision('7.20.1R', ex.text, { sourcebook: 'CONC', pages: ex.pages }) : legal.breakdown;
  const interpretation = await buildConc7201rInterpretationMemo({ pages });

  const pkg = {
    generatedAt: new Date().toISOString(),
    paidAiCallsInPrep: 0,
    runReference: RUN_REFERENCE,
    proposedBudgetUsd: PROPOSED_BUDGET_USD,
    proposedMaxRequests: PROPOSED_MAX_REQUESTS,
    proposedStageRequests: PROPOSED_STAGE_REQUESTS,
    publicationId: PUBLICATION_ID,
  targetCores: TARGET_CORES,
    stagingOnly: true,
    productionAuthorised: false,
    stages: [
      { stage: 1, useCase: 'UC-RI-005', name: 'Regulatory publication and obligation extraction' },
      { stage: 2, useCase: 'UC-RI-004', name: 'Impact assessment' },
      { stage: 3, useCase: 'UC-RI-006', name: 'Risk assessment' },
      { stage: 4, useCase: 'UC-RI-007', name: 'Control recommendations' },
      { stage: 5, useCase: 'UC-RI-008', name: 'Assurance and testing recommendations' },
    ],
    acceptanceCriteria: ACCEPTANCE_CRITERIA,
    captureRequirements: CAPTURE_REQUIREMENTS,
    expectedOutcomes: expectedOutcomes(legal, breakdown),
    regulatoryInterpretation: interpretation,
    expertReviewQuestions: interpretation.escalationsForExpertReview,
    authorisationPrerequisites: [
      'Written authorisation of budget, max requests and run reference',
      'RI_AI_EXECUTION_ENABLED=true on staging only for the run window',
      'Stages 2–5 live posture enabled with spend ledger scope forgeniq-lab-anthropic',
      'Expert review of interpretative topics or explicit acceptance of escalations in the assurance record',
    ],
    comparisonMethod:
      'Each stage output is scored against expectedOutcomes and ACCEPTANCE_CRITERIA using deterministic evaluators (pilot-saved-output-evaluator pattern) plus validateStageClaims; no historical pilot records are overwritten.',
  };

  writeFileSync(join(PREP_DIR, 'PREP-PACKAGE.json'), `${JSON.stringify(pkg, null, 2)}\n`);
  writeFileSync(
    join(PREP_DIR, 'READINESS-FOR-SECOND-LIVE-EVALUATION.md'),
    renderMarkdown(pkg),
  );
  return pkg;
}

function renderMarkdown(pkg) {
  const lines = [
    '# FCA-EVAL-002 — readiness for second live AI evaluation',
    '',
    `Generated: ${pkg.generatedAt}. **No paid AI was used to produce this package.**`,
    '',
    '## Proposed run controls',
    '',
    `| Field | Value |`,
    `| --- | --- |`,
    `| Run reference | \`${pkg.runReference}\` |`,
    `| Max budget (USD) | ${pkg.proposedBudgetUsd} |`,
    `| Max requests | ${pkg.proposedMaxRequests} |`,
    `| Expected stage requests | ${pkg.proposedStageRequests} |`,
    `| Publication ID (staging) | \`${pkg.publicationId}\` |`,
    '',
    '## Acceptance criteria',
    '',
    ...pkg.acceptanceCriteria.map((c) => `- ${c.replace(/_/g, ' ')}`),
    '',
    '## Expected outcomes (independent baseline)',
    '',
    '```json',
    JSON.stringify(pkg.expectedOutcomes, null, 2),
    '```',
    '',
    '## Outstanding regulatory expert-review questions',
    '',
    ...pkg.expertReviewQuestions.map((e) => `- **${e.reference} — ${e.question}:** ${e.reason}`),
    '',
    '## Authorisation prerequisites',
    '',
    ...pkg.authorisationPrerequisites.map((p) => `- ${p}`),
  ];
  return `${lines.join('\n')}\n`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const pkg = await buildPrepPackage();
  console.log(JSON.stringify({ ok: true, dir: PREP_DIR, runReference: pkg.runReference }, null, 2));
}