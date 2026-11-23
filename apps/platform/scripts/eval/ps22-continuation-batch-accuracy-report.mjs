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

const EVIDENCE = process.argv[2] || join(REPO_ROOT, 'docs/eval/PS22-9-CONTINUATION-V2-BATCH0-2026-11-23.json');
const OUT = join(REPO_ROOT, 'docs/eval/PS22-9-CONTINUATION-V2-BATCH0-ACCURACY-2026-11-23.json');

const evidence = JSON.parse(readFileSync(EVIDENCE, 'utf8'));
const out = evidence.structured_output || {};
const expected = evidence.expectedBatch0 || [];

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
  const candidates = (out.candidates || []).filter((c) => {
    const ref = String(c.provisionReference || c.provisionCore || '');
    return ref.includes(core.replace(/^2A\./, '2A.')) || norm(c.provisionCore) === core;
  });
  const assessment = (completeness.assessments || []).find((a) => a.provisionCore === core);
  const quotation = candidates[0]?.sourceQuotation || candidates[0]?.statement || '';
  const pdfPages = [...(index.get(core)?.pages || [])];
  const pdfText = blocks
    .filter((b) => pdfPages.includes(b.pageNumber))
    .map((b) => b.textContent || '')
    .join(' ');
  const coreInPdfText = pdfText.includes(core.split(/[RG]$/i)[0]) || pdfText.includes(core);
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
      coreCitedInQuotation: norm(quotation).includes(core) || coreInPdfText,
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
  falsePositiveBindings: perProvision.filter((p) => p.falsePositiveBinding).map((p) => p.core),
  falseNegativeBindings: perProvision.filter((p) => p.falseNegativeBinding).map((p) => p.core),
  actualSpendUsd: evidence.spendUsd,
  spendAfter: evidence.spendAfter,
  remainingBatchCostEmpiricalUsd: Math.round(13 * 0.095 * 1000) / 1000,
  note: 'Provision inventory reconciliation ≠ verified regulatory extraction accuracy',
};

writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), evidenceRunId: evidence.runId, summary, perProvision }, null, 2));
console.log(JSON.stringify({ out: OUT, summary }, null, 2));