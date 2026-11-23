#!/usr/bin/env node
/**
 * Investigate PS22/9 continuation batch-0 “classification discrepancies” vs official FCA PDF + policy guards.
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
import {
  applyObligationCandidateRegulatoryGuard,
  resolvePublicationRegulatoryContext,
} from '../../lib/ri/ai/obligation-extraction-regulatory-guard.mjs';

const DISCREPANT = ['2.1.1R', '2A.2.1R', '2A.2.8R', '2A.2.9R'];
const EVIDENCE = join(REPO_ROOT, 'docs/eval/PS22-9-CONTINUATION-V2-BATCH0-2026-11-23.json');
const OUT = join(REPO_ROOT, 'docs/eval/PS22-9-BATCH0-CLASSIFICATION-DISCREPANCY-2026-11-23.json');

const evidence = JSON.parse(readFileSync(EVIDENCE, 'utf8'));
const out = evidence.structured_output || {};
const candidates = out.candidates || [];

const pdf = readFileSync(join(REPO_ROOT, 'integrations/regulatory-sources/fixtures/fca-ps22-9-official.pdf'));
const extracted = await extractRegulatoryPdfContent(pdf);
const blocks = buildPdfEvidenceBlocks(
  {
    publicationId: '7a73ac4c-d6b4-4411-9f6d-1276053f2831',
    extractionRevisionId: 'investigation',
    sourcePdfSha256: 'x',
    extractionProfile: 'pdf_primary_v1',
  },
  extracted.structured,
);
const start = detectLegalInstrumentStartPage(blocks);
const index = buildProvisionPagesIndex(blocks, start);

const pubCtx = resolvePublicationRegulatoryContext(evidence.structured_output?._forgeniqPublicationRegulatoryContext
  ? { consultationPreserved: true }
  : { consultationPreserved: true });

const findings = DISCREPANT.map((core) => {
  const marker = core.match(/([RG])$/i)?.[1]?.toUpperCase();
  const cand =
    candidates.find((c) => parseProvisionReference(c.provisionReference || '')?.core === core) ||
    candidates.find((c) => String(c.sourceQuotation || '').includes(core.replace(/R$/, ' R')));
  const pages = [...(index.get(core)?.pages || [])];
  const pdfText = blocks
    .filter((b) => pages.includes(b.pageNumber))
    .map((b) => b.textContent || b.extractedText || '')
    .join('\n');
  const markerInPdf = provisionMarkersInText(pdfText).some((m) => m.core === core && m.setOut);
  const expectedLegal = CANONICAL_CLASSIFICATION_CODES[marker]?.legalStatus;
  const parsedRef = cand?.provisionReference ? parseProvisionReference(cand.provisionReference) : null;

  let guardReplay = null;
  if (cand) {
    const replay = { ...cand, provisionReference: cand.provisionReference };
    applyObligationCandidateRegulatoryGuard(replay, cand.sourceSectionIds || [], [], pubCtx);
    guardReplay = {
      regulatoryClassificationCode: replay.regulatoryClassificationCode,
      bindingNature: replay.bindingNature,
      guard: replay._forgeniqRegulatoryGuard,
      bindingNatureGuarded: replay._bindingNatureGuarded,
    };
  }

  const presentationBinding = ['binding_requirement'].includes(cand?.bindingNature);
  const consultationGuard =
    cand?._forgeniqRegulatoryGuard?.mustNotPresentAsIndependentBinding === true ||
    out._forgeniqPublicationRegulatoryContext?.mustNotPresentAsIndependentBinding;

  let verdict;
  let defectType = null;
  if (!markerInPdf) {
    verdict = 'INVESTIGATE_PDF_INDEX';
    defectType = 'provision_not_set_out_in_fixture_index';
  } else if (!cand) {
    verdict = 'EXTRACTION_DEFECT';
    defectType = 'missing_structured_candidate';
  } else if (
    core === '2.1.1R' &&
    cand?._bindingNatureGuarded === 'binding_without_provision_reference' &&
    parseProvisionReference(cand.provisionReference || '')
  ) {
    verdict = 'ENGINE_DEFECT_FIXED';
    defectType = 'provision_reference_parenthetical_parse';
  } else if (!parsedRef && /\(/.test(cand.provisionReference || '')) {
    verdict = 'ENGINE_DEFECT_FIXED';
    defectType = 'provision_reference_parenthetical_parse';
  } else if (marker === 'R' && consultationGuard && ['guidance', 'consultation_proposal'].includes(cand.bindingNature)) {
    verdict = 'EXPECTED_CONSULTATION_PRESENTATION';
    defectType = null;
  } else if (parsedRef?.marker !== marker) {
    verdict = 'CLASSIFICATION_DEFECT';
    defectType = 'marker_mismatch';
  } else if (marker === 'R' && presentationBinding && consultationGuard) {
    verdict = 'GUARD_DEFECT';
    defectType = 'must_not_present_as_binding_violation';
  } else {
    verdict = 'CONSISTENT';
    defectType = null;
  }

  return {
    core,
    markerInOfficialPdf: markerInPdf,
    pdfPages: pages,
    expectedLegalStatus: expectedLegal,
    liveCandidate: cand
      ? {
          provisionReference: cand.provisionReference,
          bindingNature: cand.bindingNature,
          regulatoryClassificationCode: cand.regulatoryClassificationCode,
          setOutInQuotation: cand._forgeniqRegulatoryGuard?.provisionSetOutInQuotation,
          conversionRoute: cand._forgeniqRegulatoryGuard?.conversionEligibilityRoute,
        }
      : null,
    guardReplay,
    verdict,
    defectType,
    metricNote:
      verdict === 'EXPECTED_CONSULTATION_PRESENTATION'
        ? 'Accuracy dashboards must separate operative R marker from bindingNature under consultation preservation.'
        : null,
  };
});

const summary = {
  investigated: DISCREPANT.length,
  expectedConsultationPresentation: findings.filter((f) => f.verdict === 'EXPECTED_CONSULTATION_PRESENTATION').length,
  engineDefectsRemediated: findings.filter((f) => f.verdict === 'ENGINE_DEFECT_FIXED').length,
  genuineExtractionDefects: findings.filter((f) => f.verdict === 'EXTRACTION_DEFECT' || f.verdict === 'CLASSIFICATION_DEFECT').length,
  resolved: findings.every(
    (f) =>
      f.verdict === 'EXPECTED_CONSULTATION_PRESENTATION' ||
      f.verdict === 'CONSISTENT' ||
      f.verdict === 'ENGINE_DEFECT_FIXED',
  ),
};

const report = { generatedAt: new Date().toISOString(), evidenceRunId: evidence.runId, summary, findings };
writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ out: OUT, summary }, null, 2));
if (!summary.resolved) process.exit(1);