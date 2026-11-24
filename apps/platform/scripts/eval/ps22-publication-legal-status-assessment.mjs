#!/usr/bin/env node
/**
 * Authoritative legal-status assessment for PS22/9 (final Consumer Duty policy statement).
 * Does not mutate historical AI runs. Records subsequent assessments for 2A.2.14R and 2A.2.26R.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { REPO_ROOT } from '../../lib/ri/eval/eval-paths.mjs';
import { extractRegulatoryPdfContent } from '../../../../integrations/regulatory-sources/core/regulatory-pdf-extract.mjs';
import { analyzeRegulatoryPdfDocument } from '../../../../integrations/regulatory-sources/core/regulatory-pdf-analysis.mjs';
import { buildPdfEvidenceBlocks } from '../../../../integrations/regulatory-sources/core/pdf-evidence-blocks.mjs';
import {
  buildProvisionPagesIndex,
  detectLegalInstrumentStartPage,
  parseProvisionReference,
  provisionMarkersInText,
} from '../../lib/ri/classification/provision-eligibility.mjs';
import { CANONICAL_CLASSIFICATION_CODES } from '../../lib/ri/classification/regulatory-classification-policy.mjs';
import { FCA_PS22_9_AUTHORITATIVE_METADATA as META } from '../../../../integrations/regulatory-sources/catalogue/fca-ps22-9-authoritative-metadata.mjs';

const OUT = join(REPO_ROOT, 'docs/eval/PS22-9-PUBLICATION-LEGAL-STATUS-ASSESSMENT-2026-11-23.json');
const BATCH1 = join(REPO_ROOT, 'docs/eval/PS22-9-CONTINUATION-V2-BATCH1-2026-11-23.json');
const PDF_PATH = join(REPO_ROOT, 'integrations/regulatory-sources/fixtures/fca-ps22-9-official.pdf');
const FOCUS = ['2A.2.14R', '2A.2.26R'];
const EXPECTED_SHA = 'ee1230a9d9dfc378604ea9462568817cf6c1e7702ab38e927027fe08172f637b';

const pdf = readFileSync(PDF_PATH);
const sha256 = createHash('sha256').update(pdf).digest('hex');
const extracted = await extractRegulatoryPdfContent(pdf);
const pages = extracted.structured?.pages || [];
const pageList = Array.isArray(pages) ? pages : Object.values(pages);
const analysis = analyzeRegulatoryPdfDocument({
  structured: { pages: pageList.map((p) => ({ text: p.text || p.extractedText || '', pageNumber: p.pageNumber })) },
  publicationMetadata: {
    publicationType: 'policy_statement',
    publicationTypeLabel: 'Policy Statement',
    title: 'PS22/9: A new Consumer Duty',
    canonicalUrl: 'https://www.fca.org.uk/publication/policy/ps22-9.pdf',
  },
  canonicalUrl: 'https://www.fca.org.uk/publication/policy/ps22-9.pdf',
});
const blocks = buildPdfEvidenceBlocks(
  { publicationId: '7a73ac4c-d6b4-4411-9f6d-1276053f2831', extractionRevisionId: 'legal-status', sourcePdfSha256: sha256, extractionProfile: 'pdf_primary_v1' },
  extracted.structured,
);
const start = detectLegalInstrumentStartPage(blocks);
const index = buildProvisionPagesIndex(blocks, start);
const batch1 = JSON.parse(readFileSync(BATCH1, 'utf8'));
const out = batch1.structured_output || {};

const publicationAssessment = {
  fcaReference: 'PS22/9',
  officialTitle: 'A new Consumer Duty — Feedback to CP21/36 and final rules',
  canonicalUrl: 'https://www.fca.org.uk/publication/policy/ps22-9.pdf',
  publicationDate: META.publicationDate,
  pdfCoverDateText: META.pdfCoverDateText,
  commencement: META.commencement,
  dateDiscrepancy:
    '29 July 2022 was not on the FCA record. Authoritative first-published date is 27 July 2022. PDF cover says July 2022 only.',
  documentTypes: ['policy_statement', 'made_rules_instrument'],
  legallyBindingAsPublished: analysis.regulatoryStatus?.publishedFinalRules === true,
  consultationPreserved: analysis.consultationPreserved === true,
  instrumentInDocument: true,
  relatedConsultations: ['CP21/36', 'CP21/13'],
  cp22_09Note:
    'CP22/09 is the Dormant Assets scheme consultation — not this PDF. Prior labelling as CP22/9 was incorrect.',
  legalInstrument: 'Appendix 1 Made rules (legal instrument) within PS22/9',
  handbookCommencement:
    'PRIN 2A Consumer Duty rules are made via PS22/9; operative status for a firm depends on applicability and commencement in the instrument — not inferred from R suffix alone.',
  sourcePdfSha256: sha256,
  sourcePdfSha256Match: sha256 === EXPECTED_SHA,
  regulatoryAnalysis: {
    publicationClassification: analysis.publicationClassification,
    regulatoryStatus: analysis.regulatoryStatus,
  },
  authoritativeSources: [
    PDF_PATH,
    'https://www.fca.org.uk/publication/policy/ps22-9.pdf',
    'FCA Handbook PRIN 2A (as enacted from PS22/9)',
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
  const inMadeRulesInstrument = pages.some((p) => p >= (start ?? 0));
  return {
    provisionCore: core,
    pdfPages: pages,
    operativeMarkerInSource,
    inMadeRulesInstrument,
    canonicalCode: marker,
    canonicalLegalStatus: CANONICAL_CLASSIFICATION_CODES[marker]?.legalStatus,
    handbookStyleBindingIfEnacted: marker === 'R' ? 'binding_requirement' : 'non_binding_guidance',
    asPublishedLegalCharacter: 'final_rule_in_PS22_9_instrument',
    mustNotPresentAsConsultationProposal: true,
    mustNotAutoApproveObligationWithoutHumanReview: true,
    historicalAiRunPreserved: true,
    subsequentAssessment: {
      assessedAt: new Date().toISOString(),
      regulatoryClassificationCode: marker,
      bindingNatureForPresentation:
        analysis.consultationPreserved ? 'consultation_proposal' : 'published_final_rule',
      conversionEligibility:
        'human_review_required; verify quotation within made rules; confirm firm applicability and commencement',
      liveExtractionSnapshot: cand
        ? {
            runId: batch1.runId,
            bindingNature: cand.bindingNature,
            regulatoryClassificationCode: cand.regulatoryClassificationCode,
            guard: cand._forgeniqRegulatoryGuard,
            bindingNatureGuarded: cand._bindingNatureGuarded,
            publicationContext: cand._forgeniqPublicationRegulatoryContext,
          }
        : null,
      alignmentWithCorrectedPublication:
        cand?._forgeniqPublicationRegulatoryContext?.consultationPreserved === true
          ? 'HISTORICAL_MISCLASSIFICATION'
          : operativeMarkerInSource && cand?.regulatoryClassificationCode === marker
            ? 'STRUCTURAL_ALIGN_REVIEW_LEGAL'
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
    note: 'Batch-0 discrepancy resolution addressed consultation presentation; publication identity is PS22/9 final rules, not CP22/9.',
  },
  batch1Reassessment: {
    focusCount: provisions.length,
    historicalMisclassificationOnStagingRuns: provisions.some(
      (p) => p.subsequentAssessment.alignmentWithCorrectedPublication === 'HISTORICAL_MISCLASSIFICATION',
    ),
  },
  policyStatement:
    'PS22/9 contains final made rules. An R marker in the instrument identifies rule text as made in this publication; binding Handbook status still requires enactment, applicability and effective dates — the platform must not auto-convert extractions to approved obligations.',
  supersedesIncorrectNarrative: 'Prior assessment incorrectly labelled source as CP22/9 consultation.',
};

writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ out: OUT, sha256Match: sha256 === EXPECTED_SHA }, null, 2));