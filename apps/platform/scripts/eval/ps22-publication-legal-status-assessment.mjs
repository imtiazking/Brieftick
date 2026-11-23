#!/usr/bin/env node
/**
 * Authoritative legal-status assessment for PS22/9 (CP22/9 Consumer Duty) — does not mutate historical AI runs.
 * Records subsequent assessments for 2A.2.14R and 2A.2.26R.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../../lib/ri/eval/eval-paths.mjs';
import { extractRegulatoryPdfContent } from '../../../../integrations/regulatory-sources/core/regulatory-pdf-extract.mjs';
import { buildPdfEvidenceBlocks } from '../../../../integrations/regulatory-sources/core/pdf-evidence-blocks.mjs';
import {
  buildProvisionPagesIndex,
  detectLegalInstrumentStartPage,
  parseProvisionReference,
  provisionMarkersInText,
} from '../../lib/ri/classification/provision-eligibility.mjs';
import { CANONICAL_CLASSIFICATION_CODES } from '../../lib/ri/classification/regulatory-classification-policy.mjs';

const OUT = join(REPO_ROOT, 'docs/eval/PS22-9-PUBLICATION-LEGAL-STATUS-ASSESSMENT-2026-11-23.json');
const BATCH1 = join(REPO_ROOT, 'docs/eval/PS22-9-CONTINUATION-V2-BATCH1-2026-11-23.json');
const FOCUS = ['2A.2.14R', '2A.2.26R'];

const pdf = readFileSync(join(REPO_ROOT, 'integrations/regulatory-sources/fixtures/fca-ps22-9-official.pdf'));
const extracted = await extractRegulatoryPdfContent(pdf);
const blocks = buildPdfEvidenceBlocks(
  { publicationId: '7a73ac4c-d6b4-4411-9f6d-1276053f2831', extractionRevisionId: 'legal-status', sourcePdfSha256: 'x', extractionProfile: 'pdf_primary_v1' },
  extracted.structured,
);
const start = detectLegalInstrumentStartPage(blocks);
const index = buildProvisionPagesIndex(blocks, start);
const batch1 = JSON.parse(readFileSync(BATCH1, 'utf8'));
const out = batch1.structured_output || {};

const publicationAssessment = {
  fcaReference: 'CP22/9',
  title: 'A new Consumer Duty',
  documentTypes: ['consultation_paper', 'proposed_handbook_instrument'],
  legallyBindingAsPublished: false,
  consultationPreserved: true,
  instrumentInDocument: true,
  note:
    'Made rules text in CP22/9 are proposals subject to consultation, not independently operative Handbook obligations until implemented via Policy Statement / instrument made by the FCA.',
  authoritativeSources: [
    'integrations/regulatory-sources/fixtures/fca-ps22-9-official.pdf',
    'FCA CP22/9 (Consumer Duty consultation)',
  ],
};

function assessCore(core) {
  const pages = [...(index.get(core)?.pages || [])];
  const text = blocks
    .filter((b) => pages.includes(b.pageNumber))
    .map((b) => b.extractedText || '')
    .join('\n');
  const markers = provisionMarkersInText(text).filter((m) => m.core === core);
  const cand = (out.candidates || []).find((c) => parseProvisionReference(c.provisionReference || '')?.core === core);
  const marker = core.match(/([RG])$/i)?.[1]?.toUpperCase();
  const operativeMarkerInSource = markers.length > 0 && marker === 'R';
  return {
    provisionCore: core,
    pdfPages: pages,
    operativeMarkerInSource,
    canonicalCode: marker,
    canonicalLegalStatus: CANONICAL_CLASSIFICATION_CODES[marker]?.legalStatus,
    handbookStyleBindingIfFinalised: marker === 'R' ? 'binding_requirement' : 'non_binding_guidance',
    asPublishedLegalCharacter: 'consultation_proposal',
    mustNotPresentAsIndependentBinding: true,
    historicalAiRunPreserved: true,
    subsequentAssessment: {
      assessedAt: new Date().toISOString(),
      regulatoryClassificationCode: marker,
      bindingNatureForPresentation: 'consultation_proposal',
      conversionEligibilityUnderConsultation: 'human_review_required_before_obligation_conversion',
      liveExtractionSnapshot: cand
        ? {
            runId: batch1.runId,
            bindingNature: cand.bindingNature,
            regulatoryClassificationCode: cand.regulatoryClassificationCode,
            guard: cand._forgeniqRegulatoryGuard,
            bindingNatureGuarded: cand._bindingNatureGuarded,
          }
        : null,
      alignmentWithPolicy:
        cand?.regulatoryClassificationCode === marker &&
        ['consultation_proposal', 'guidance'].includes(cand?.bindingNature) &&
        cand?._forgeniqRegulatoryGuard?.mustNotPresentAsIndependentBinding === true
          ? 'ALIGNED'
          : 'REVIEW',
    },
    quotationSetOut: markers.some((m) => m.setOut),
  };
}

const provisions = FOCUS.map(assessCore);
const batch0Reassessment = JSON.parse(
  readFileSync(join(REPO_ROOT, 'docs/eval/PS22-9-BATCH0-CLASSIFICATION-DISCREPANCY-2026-11-23.json'), 'utf8'),
);
const report = {
  generatedAt: new Date().toISOString(),
  publicationAssessment,
  focusProvisions: provisions,
  batch0DiscrepancyReassessment: {
    priorFindings: batch0Reassessment.findings?.length,
    resolved: batch0Reassessment.summary?.resolved,
    note: 'Historical batch-0 JSON unchanged; this block is subsequent legal interpretation only.',
  },
  batch1Reassessment: {
    allAligned: provisions.every((p) => p.subsequentAssessment.alignmentWithPolicy === 'ALIGNED'),
    count: provisions.length,
  },
  policyStatement:
    'Provision suffix R identifies proposed rule text in the consultation instrument; it does not alone establish a currently binding Handbook obligation. The engine must preserve consultation guards.',
};

writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ out: OUT, batch1Aligned: report.batch1Reassessment.allAligned }, null, 2));