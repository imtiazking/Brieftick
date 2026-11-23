#!/usr/bin/env node
/** Post-batch PS22/9 accuracy vs official PDF fixture (not a substitute for SME sign-off). */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../../lib/ri/eval/eval-paths.mjs';
import { extractRegulatoryPdfContent } from '../../../../integrations/regulatory-sources/core/regulatory-pdf-extract.mjs';
import { buildPdfEvidenceBlocks } from '../../../../integrations/regulatory-sources/core/pdf-evidence-blocks.mjs';
import { detectLegalInstrumentStartPage, buildProvisionPagesIndex } from '../../lib/ri/classification/provision-eligibility.mjs';
import { assessBatchProvisionCompleteness } from '../../lib/ri/ai/provision-assessment-completeness.mjs';
import { parseProvisionReference } from '../../lib/ri/classification/provision-eligibility.mjs';
import { CANONICAL_CLASSIFICATION_CODES } from '../../lib/ri/classification/regulatory-classification-policy.mjs';

const BATCH = Number(process.argv[2] ?? '0');
const EVIDENCE = join(REPO_ROOT, `docs/eval/PS22-9-CONTINUATION-V2-BATCH${BATCH}-2026-11-23.json`);
const OUT = join(REPO_ROOT, `docs/eval/PS22-9-CONTINUATION-V2-BATCH${BATCH}-ACCURACY-2026-11-23.json`);
const TOTAL_CONTINUATION_BATCHES = 14;

const evidence = JSON.parse(readFileSync(EVIDENCE, 'utf8'));
const out = evidence.structured_output || {};
const expected = evidence.expectedBatch || evidence.expectedBatch0 || [];

/** Quote-insensitive, whitespace-collapsed form so PDF typography does not mask a verbatim match. */
function canon(s) {
  return String(s || '')
    .replace(/[\u2018\u2019\u201B\u2032]/g, "'")
    .replace(/[\u201C\u201D\u2033]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Every elided segment of at least 20 characters must appear verbatim in the cited pages. */
function quotationVerbatim(quotation, pageText) {
  const hay = canon(pageText);
  const segments = String(quotation || '')
    .split(/\.\.\.|…/)
    .map(canon)
    .filter((s) => s.length >= 20);
  if (!segments.length) return { verbatim: false, segments: 0, missing: [] };
  const missing = segments.filter((s) => !hay.includes(s));
  return { verbatim: missing.length === 0, segments: segments.length, missing: missing.map((s) => s.slice(0, 80)) };
}

const pdf = readFileSync(join(REPO_ROOT, 'integrations/regulatory-sources/fixtures/fca-ps22-9-official.pdf'));
const extracted = await extractRegulatoryPdfContent(pdf);
const blocks = buildPdfEvidenceBlocks(
  {
    publicationId: '7a73ac4c-d6b4-4411-9f6d-1276053f2831',
    extractionRevisionId: 'accuracy',
    sourcePdfSha256: 'x',
    extractionProfile: 'pdf_primary_v1',
  },
  extracted.structured,
);
const start = detectLegalInstrumentStartPage(blocks);
const index = buildProvisionPagesIndex(blocks, start);

function norm(s) {
  return String(s || '').replace(/\s+/g, ' ').trim();
}

function markerForCore(core) {
  const m = core.match(/([RG])(\s*)$/i);
  return m ? m[1].toUpperCase() : null;
}

const completeness =
  evidence.completeness ||
  assessBatchProvisionCompleteness({
    suppliedCores: expected,
    candidates: out.candidates || [],
    claims: out.claims || [],
  });

const perProvision = expected.map((core) => {
  const inPdf = index.has(core);
  const marker = markerForCore(core);
  const candidates = (out.candidates || []).filter(
    (c) => parseProvisionReference(c.provisionReference || c.provisionCore || '')?.core === core,
  );
  const quotation = candidates[0]?.sourceQuotation || '';
  const pdfPages = [...(index.get(core)?.pages || [])];
  const window = new Set(pdfPages.flatMap((p) => [p - 1, p, p + 1]));
  const pdfText = blocks
    .filter((b) => window.has(b.pageNumber))
    .sort((a, b) => a.pageNumber - b.pageNumber)
    .map((b) => b.extractedText || b.textContent || '')
    .join(' ');
  const verbatim = candidates.map((c) => quotationVerbatim(c.sourceQuotation, pdfText));
  const coreInPdfText = canon(pdfText).includes(canon(core.replace(/([RG])$/i, ' $1')));
  const primary = candidates[0];
  const deterministic = (out.deterministicProvisionCandidates || []).find((d) => d.provisionCore === core);
  const parsedRef = primary?.provisionReference ? parseProvisionReference(primary.provisionReference) : null;
  const codeFromCandidate =
    primary?.regulatoryClassificationCode ||
    parsedRef?.marker ||
    deterministic?.regulatoryClassificationCode ||
    null;
  const consultationGuard =
    primary?._forgeniqRegulatoryGuard?.mustNotPresentAsIndependentBinding === true ||
    out._forgeniqPublicationRegulatoryContext?.mustNotPresentAsIndependentBinding === true;
  const presentationBinding = candidates.some(
    (c) => c.bindingNature === 'binding_requirement' || c.regulatoryClassificationCode === 'binding_requirement',
  );
  const guidanceExpected = marker === 'G';
  const bindingExpected = marker === 'R';
  const operativeCodeOk = !marker || codeFromCandidate === marker;
  const consultationPresentationOk =
    bindingExpected && consultationGuard
      ? ['guidance', 'consultation_proposal', 'explanatory_commentary', 'unknown'].includes(primary?.bindingNature)
      : true;
  const independentBindingOk = !(consultationGuard && presentationBinding);
  const classificationOk = operativeCodeOk && consultationPresentationOk && independentBindingOk;
  const expectedLegal = marker ? CANONICAL_CLASSIFICATION_CODES[marker]?.legalStatus : null;

  const assessments = completeness.assessments || out._forgeniqProvisionAssessments || [];
  const structuredAssessment =
    assessments.find((a) => a.provisionCore === core) ||
    assessments.find((a) => norm(a.provisionReference || '').includes(core));

  return {
    core,
    inOfficialPdfIndex: inPdf,
    pdfPages,
    structuredAssessment: structuredAssessment?.outcome || 'missing',
    candidateCount: candidates.length,
    hasProvisionReference: candidates.some((c) => c.provisionReference),
    quotationAccuracy: {
      hasQuotation: Boolean(norm(quotation)),
      provisionMarkerInPdfPages: coreInPdfText,
      verbatimInPdf: verbatim.length > 0 && verbatim.every((v) => v.verbatim),
      candidatesVerbatim: verbatim.filter((v) => v.verbatim).length,
      missingSegments: verbatim.flatMap((v) => v.missing),
    },
    regulatoryClassification: {
      markerExpected: marker,
      regulatoryClassificationCode: codeFromCandidate,
      expectedLegalStatus: expectedLegal,
      bindingNaturePresented: primary?.bindingNature || null,
      consultationPreserved: consultationGuard,
      operativeCodeMatchesMarker: operativeCodeOk,
      consultationPresentationAppropriate: consultationPresentationOk,
      mustNotPresentIndependentBinding: consultationGuard,
      classificationPlausible: classificationOk,
    },
    falsePositiveBinding: guidanceExpected && presentationBinding,
    falseNegativeBinding:
      bindingExpected &&
      presentationBinding &&
      !consultationGuard &&
      (structuredAssessment?.outcome === 'assessed_structured' || structuredAssessment?.identified),
    missedRequirement: structuredAssessment?.outcome === 'omitted' || structuredAssessment?.outcome === 'requires_exception_review',
  };
});

const summary = {
  structuredAssessmentCompleteness: {
    batchCompletenessOk: completeness.batchCompletenessOk,
    omissionCount: completeness.omissionCount,
    assessedStructured: (completeness.assessments || out._forgeniqProvisionAssessments || []).filter(
      (a) => a.outcome === 'assessed_structured' || (a.identified && a.outcome !== 'omitted'),
    ).length,
    denominator: expected.length,
  },
  regulatoryClassificationPlausible: perProvision.filter((p) => p.regulatoryClassification.classificationPlausible).length,
  bindingRequirementsVerified: perProvision.filter((p) => p.regulatoryClassification.markerExpected === 'R' && !p.missedRequirement).length,
  bindingRequirementsExpected: perProvision.filter((p) => p.regulatoryClassification.markerExpected === 'R').length,
  missedRequirements: perProvision.filter((p) => p.missedRequirement).map((p) => p.core),
  quotationHits: perProvision.filter((p) => p.quotationAccuracy.hasQuotation).length,
  quotationsVerbatimInPdf: perProvision.filter((p) => p.quotationAccuracy.verbatimInPdf).length,
  quotationsNotVerbatim: perProvision.filter((p) => !p.quotationAccuracy.verbatimInPdf).map((p) => p.core),
  falsePositiveBindings: perProvision.filter((p) => p.falsePositiveBinding).map((p) => p.core),
  falseNegativeBindings: perProvision.filter((p) => p.falseNegativeBinding).map((p) => p.core),
  actualSpendUsd: evidence.spendUsd,
  spendAfter: evidence.spendAfter,
  remainingBatches: TOTAL_CONTINUATION_BATCHES - 1 - BATCH,
  remainingBatchCostEmpiricalUsd:
    Math.round((TOTAL_CONTINUATION_BATCHES - 1 - BATCH) * Number(evidence.spendUsd || 0.105) * 1000) / 1000,
  note: 'Provision inventory reconciliation ≠ verified regulatory extraction accuracy',
};

writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), evidenceRunId: evidence.runId, summary, perProvision }, null, 2));
console.log(JSON.stringify({ out: OUT, summary }, null, 2));